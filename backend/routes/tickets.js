import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'
import { createNotification } from './notifications.js'
import ExcelJS from 'exceljs'
import { recordEvent } from '../monitoring/metrics.js'
import { logAdminAction } from '../lib/audit.js'

const router = Router()

// Simple in-process lock map to serialize operations per event/tier.
// Note: protects only this Node process. For multi-node deployments,
// replace with DB-level transactions or an external lock system.
const locks = new Map()
function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve()
  const promise = prev.then(() => fn())
  locks.set(key, promise)
  promise.finally(() => {
    if (locks.get(key) === promise) locks.delete(key)
  })
  return promise
}

const MAX_REFERENCE_LENGTH = 128
const MAX_BANK_NAME_LENGTH = 64
const MAX_APPROVAL_NOTE_LENGTH = 500

function isValidCloudinaryUrl(url) {
  return typeof url === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(url)
}

function normalizeString(value, maxLength) {
  if (!value) return ''
  const trimmed = value.toString().trim()
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

async function logAudit({ requestId = null, actorId = null, actorRole = null, action = '', metadata = {} }) {
  try {
    await supabaseAdmin
      .from('ticket_audit_log')
      .insert({ request_id: requestId, actor_id: actorId, actor_role: actorRole, action, metadata })
  } catch (e) {
    logger.warn('AUDIT', 'Failed to write audit log', { error: e?.message || String(e), requestId, action })
  }
}

async function getAcceptedEventRoleId(eventId, userId) {
  const { data, error } = await supabaseAdmin
    .from('event_roles')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()

  if (error || !data) return null
  return data.id
}

async function logEventRoleActivity(eventId, userId, action, metadata = {}) {
  const roleId = await getAcceptedEventRoleId(eventId, userId)
  if (!roleId) return
  try {
    await supabaseAdmin
      .from('event_role_activity')
      .insert({ event_role_id: roleId, action, performed_by: userId, metadata })
  } catch (e) {
    logger.warn('ROLE-ACTIVITY', 'Failed to log event role activity', { error: e?.message || String(e), eventId, userId, action })
  }
}

router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id

  const { data: tickets, error } = await supabaseAdmin
    .from('ticket_requests')
    .select(`
      *,
      events!inner(title, date, location, banner_url, category)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('TICKETS-LIST', 'Failed to fetch tickets', {
      requestId: req.requestId,
      userId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil tiket' })
  }

  // Fetch thread IDs for all tickets
  const ticketIds = tickets.map(t => t.id)
  const { data: threads } = await supabaseAdmin
    .from('chat_threads')
    .select('ticket_request_id, id')
    .in('ticket_request_id', ticketIds)
  const threadMap = Object.fromEntries((threads || []).map(th => [th.ticket_request_id, th.id]))

  const result = tickets.map(t => ({
    id: t.id,
    event_id: t.event_id,
    event_name: t.events?.title || '',
    event_date: t.events?.date || '',
    event_location: t.events?.location || '',
    event_category: t.events?.category || '',
    tier_name: t.tier_name || 'Regular',
    status: t.status || 'pending',
    qr_data: t.id,
    thread_id: threadMap[t.id] || null
  }))

  res.json({ tickets: result })
})

router.post('/', requireAuth, async (req, res) => {
  const { event_id, items, seat_ids } = req.body
  const io = req.app.get('io')

  // Release any session-based seat locks on failure (so seats don't
  // stay stuck in "reserved" state when the request fails validation)
  async function releaseSessionLocks() {
    if (!seat_ids || !Array.isArray(seat_ids) || seat_ids.length === 0) return
    try {
      const { data: locked } = await supabaseAdmin
        .from('venue_seats')
        .select('id, reserved_by')
        .in('id', seat_ids)
      if (!locked) return
      const toRelease = locked.filter(s => s.reserved_by?.startsWith('session_')).map(s => s.id)
      if (toRelease.length === 0) return
      await supabaseAdmin
        .from('venue_seats')
        .update({ status: 'available', reserved_by: null, reserved_until: null })
        .in('id', toRelease)
        .eq('status', 'reserved')
      if (io) {
        toRelease.forEach(seatId => {
          io.to(`event:${event_id}:seats`).emit('SEAT_UPDATE', { seatId, status: 'available', reservedUntil: null })
        })
      }
    } catch (e) {
      logger.error('TICKETS-CREATE', 'Failed to release session locks', { requestId: req.requestId, error: e?.message || String(e) })
    }
  }

  if (!event_id) {
    return res.status(400).json({ error: 'event_id wajib diisi' })
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Minimal satu tiket harus dipilih' })
  }

  // Validate seat IDs if provided
  if (seat_ids && Array.isArray(seat_ids) && seat_ids.length > 0) {
    const sessionId = `session_${req.user.id}_${Date.now()}`
    const { data: seatCheck, error: seatCheckError } = await supabaseAdmin
      .from('venue_seats')
      .select('id, status, reserved_by')
      .in('id', seat_ids)
      .eq('event_id', event_id)

    if (seatCheckError) {
      await releaseSessionLocks()
      return res.status(500).json({ error: 'Gagal memvalidasi kursi' })
    }

    if (!seatCheck || seatCheck.length !== seat_ids.length) {
      await releaseSessionLocks()
      return res.status(400).json({ error: 'Beberapa kursi tidak ditemukan', code: 'SEAT_INVALID' })
    }

    const unavailableSeats = seatCheck.filter(s =>
      s.status !== 'available' && !(s.status === 'reserved' && s.reserved_by?.startsWith('session_'))
    )

    if (unavailableSeats.length > 0) {
      await releaseSessionLocks()
      return res.status(409).json({
        error: `${unavailableSeats.length} kursi sudah tidak tersedia`,
        code: 'SEAT_UNAVAILABLE',
        seats: unavailableSeats.map(s => s.id)
      })
    }
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id, creator_id, title, date, status')
    .eq('id', event_id)
    .single()

  if (eventError || !event) {
    await releaseSessionLocks()
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  if (event.creator_id === req.user.id) {
    await releaseSessionLocks()
    logger.warn('TICKETS-CREATE', 'Creator tried to request own ticket', {
      requestId: req.requestId,
      userId: req.user.id,
      eventId: event_id
    })
    return res.status(403).json({ error: 'Kreator tidak bisa memesan tiket di acara sendiri' })
  }

  if (event.status !== 'published') {
    await releaseSessionLocks()
    return res.status(400).json({
      error: 'Acara belum dipublikasikan atau sudah tidak aktif',
      code: 'EVENT_NOT_ACTIVE'
    })
  }

  if (new Date(event.date) < new Date()) {
    await releaseSessionLocks()
    return res.status(400).json({
      error: 'Acara sudah berlalu, tidak bisa memesan tiket',
      code: 'EVENT_NOT_ACTIVE'
    })
  }

  const { data: pendingRequests, error: pendingRequestsError } = await supabaseAdmin
    .from('ticket_requests')
    .select('id')
    .eq('event_id', event_id)
    .eq('user_id', req.user.id)
    .eq('status', 'pending')
    .limit(1)

  if (pendingRequestsError) {
    await releaseSessionLocks()
    logger.error('TICKETS-CREATE', 'Failed to check existing requests', {
      requestId: req.requestId,
      userId: req.user.id,
      eventId: event_id,
      error: pendingRequestsError.message
    })
    return res.status(500).json({ error: 'Gagal membuat permintaan tiket' })
  }

  if (pendingRequests && pendingRequests.length > 0) {
    await releaseSessionLocks()
    return res.status(409).json({
      error: 'Kamu sudah memiliki permintaan tiket menunggu pembayaran untuk acara ini',
      code: 'ACTIVE_TICKET_REQUEST_EXISTS'
    })
  }

  const tierNames = [...new Set(items.map(i => i.tier_name))]
  const { data: tiers, error: tiersError } = await supabaseAdmin
    .from('ticket_tiers')
    .select('*, seat_tier')
    .eq('event_id', event_id)
    .in('name', tierNames)

  if (tiersError || !tiers || tiers.length === 0) {
    await releaseSessionLocks()
    return res.status(400).json({ error: 'Tiket yang dipilih tidak tersedia' })
  }

  const tierMap = Object.fromEntries(tiers.map(t => [t.name, t]))

  const invalidItems = items.filter(i => !tierMap[i.tier_name])
  if (invalidItems.length > 0) {
    await releaseSessionLocks()
    return res.status(400).json({
      error: `Tiket tidak ditemukan: ${invalidItems.map(i => i.tier_name).join(', ')}`
    })
  }

  // Validate seat_tier requirements: if any item's tier has seat_tier=true,
  // seat_ids must be provided and count must match quantity
  const seatTierItems = items.filter(i => tierMap[i.tier_name]?.seat_tier)
  if (seatTierItems.length > 0) {
    if (!seat_ids || !Array.isArray(seat_ids) || seat_ids.length === 0) {
      await releaseSessionLocks()
      return res.status(400).json({
        error: 'Tiket kursi wajib memilih kursi',
        code: 'SEAT_REQUIRED'
      })
    }

    const expectedSeatCount = seatTierItems.reduce((sum, i) => sum + (i.quantity || 1), 0)
    if (seat_ids.length !== expectedSeatCount) {
      await releaseSessionLocks()
      return res.status(400).json({
        error: `Jumlah kursi (${seat_ids.length}) tidak sesuai dengan jumlah tiket (${expectedSeatCount})`,
        code: 'SEAT_COUNT_MISMATCH'
      })
    }

    // Validate per-tier seat ownership — query tier_id from DB directly
    const { data: seatTierCheck } = await supabaseAdmin
      .from('venue_seats')
      .select('id, tier_id')
      .in('id', seat_ids)

    if (seatTierCheck) {
      // Build expected tier_id for each seat based on item ordering
      const tierIdSequence = []
      for (const item of seatTierItems) {
        const tier = tierMap[item.tier_name]
        if (!tier) continue
        for (let i = 0; i < (item.quantity || 1); i++) {
          tierIdSequence.push(tier.id)
        }
      }

      for (let i = 0; i < Math.min(seat_ids.length, tierIdSequence.length); i++) {
        const sid = seat_ids[i]
        const expectedTierId = tierIdSequence[i]
        const seat = seatTierCheck.find(s => s.id === sid)
        if (seat && seat.tier_id !== expectedTierId) {
          await releaseSessionLocks()
          return res.status(400).json({
            error: `Kursi ${seat.seat_code || sid} bukan milik tipe tiket yang dipilih`,
            code: 'SEAT_TIER_MISMATCH'
          })
        }
      }
    }
  }

  const created = []

  try {
    for (const item of items) {
      const tier = tierMap[item.tier_name]
      const quantity = item.quantity || 1

      // Use DB-level atomic reservation via Postgres function `reserve_ticket_requests`.
      try {
        const { data: reserved, error: rpcErr } = await supabaseAdmin.rpc('reserve_ticket_requests', {
          _event_id: event_id,
          _tier_name: item.tier_name,
          _user_id: req.user.id,
          _quantity: quantity
        })

        if (rpcErr) {
          // Map known DB exceptions to user-friendly responses
          const msg = (rpcErr.message || '').toUpperCase()
          if (msg.includes('NOT_ENOUGH_TICKETS')) {
            await releaseSessionLocks()
            return res.status(409).json({ error: `Tiket ${item.tier_name} tidak mencukupi`, code: 'NOT_ENOUGH_TICKETS' })
          }
          if (msg.includes('TIER_NOT_FOUND')) {
            await releaseSessionLocks()
            return res.status(400).json({ error: `Tipe tiket ${item.tier_name} tidak ditemukan` })
          }
          logger.error('TICKETS-CREATE', 'RPC error', { requestId: req.requestId, error: rpcErr.message })
          await releaseSessionLocks()
          return res.status(500).json({ error: 'Gagal membuat permintaan tiket' })
        }

        // RPC returns rows of created ticket_requests
        if (Array.isArray(reserved)) {
          reserved.forEach(r => created.push(r))
        } else if (reserved) {
          created.push(reserved)
        }
      } catch (e) {
        await releaseSessionLocks()
        logger.error('TICKETS-CREATE', 'Reserve RPC failed', { requestId: req.requestId, error: e?.message || String(e) })
        return res.status(500).json({ error: 'Gagal membuat permintaan tiket' })
      }
    }
  } catch (err) {
    await releaseSessionLocks()
    if (err && err.status && err.body) {
      return res.status(err.status).json(err.body)
    }
    logger.error('TICKETS-CREATE', 'Unhandled error during ticket creation', { requestId: req.requestId, error: err?.message || String(err) })
    return res.status(500).json({ error: 'Gagal membuat permintaan tiket' })
  }

  // Link seat IDs to the created ticket requests one-to-one
  if (seat_ids && Array.isArray(seat_ids) && seat_ids.length > 0 && created.length > 0) {
    const allTicketIds = created.map(r => r.id).filter(Boolean)
    const ioSeats = req.app.get('io')
    const pairs = []

    for (let i = 0; i < Math.min(seat_ids.length, allTicketIds.length); i++) {
      pairs.push({
        id: seat_ids[i],
        status: 'reserved',
        reserved_by: allTicketIds[i],
        reserved_until: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      })
    }

    // Batch update each seat individually (one-to-one mapping)
    for (const pair of pairs) {
      const { error: linkError } = await supabaseAdmin
        .from('venue_seats')
        .update({
          status: pair.status,
          reserved_by: pair.reserved_by,
          reserved_until: pair.reserved_until
        })
        .eq('id', pair.id)

      if (linkError) {
        logger.error('TICKETS-CREATE', 'Failed to link seat', {
          requestId: req.requestId,
          seatId: pair.id,
          error: linkError.message
        })
      } else if (ioSeats) {
        ioSeats.to(`event:${event_id}:seats`).emit('SEAT_UPDATE', {
          seatId: pair.id,
          status: 'reserved',
          reservedUntil: pair.reserved_until
        })
      }
    }
  }

  const { data: requesterUser } = await supabaseAdmin.auth.admin.getUserById(req.user.id)
  const requesterName = requesterUser?.user?.user_metadata?.name || requesterUser?.user?.email || 'Seseorang'
  const requesterProfile = {
    name: requesterName,
    email: requesterUser?.user?.email || ''
  }

  if (io) {
    created.forEach(t => {
      io.to(`event:${event_id}:queue`).emit('queue:new', {
        ...t,
        profiles: requesterProfile,
        claimed_by_profile: null
      })
    })
  }

  for (const item of items) {
    await createNotification(
      event.creator_id,
      'ticket_request',
      'Permintaan Tiket Baru',
      `${requesterName} meminta tiket ${item.tier_name} untuk ${event.title}`,
      event_id,
      'event'
    )
  }

  // Ensure chat threads exist for newly created ticket requests and add an initial system message
  for (const t of created) {
    try {
      const { data: existingThread } = await supabaseAdmin
        .from('chat_threads')
        .select('id')
        .eq('ticket_request_id', t.id)
        .maybeSingle()

      let threadId = existingThread?.id
      if (!threadId) {
        const { data: newThread, error: threadErr } = await supabaseAdmin
          .from('chat_threads')
          .insert({
            ticket_request_id: t.id,
            event_id: t.event_id,
            buyer_id: t.user_id
          })
          .select()
          .single()

        if (threadErr) {
          logger.warn('TICKETS-CREATE', 'Failed to create chat thread', { requestId: req.requestId, ticketId: t.id, error: threadErr.message })
        } else {
          threadId = newThread.id

          // initial system message for admin awareness
          await supabaseAdmin.from('chat_messages').insert({
            thread_id: threadId,
            sender_id: req.user.id,
            message_type: 'system',
            content: `Permintaan tiket ${t.tier_name} dibuat oleh ${requesterName}.`
          })

          if (io) {
            io.to(`event:${t.event_id}:admins`).emit('chat:new_thread', { thread_id: threadId, ticket_request: t })
          }
        }
      }
    } catch (e) {
      logger.error('TICKETS-CREATE', 'Error ensuring chat thread', { requestId: req.requestId, ticketId: t.id, error: e?.message || String(e) })
    }
  }

  logger.info('TICKETS-CREATE', 'Ticket requests created', {
    requestId: req.requestId,
    userId: req.user.id,
    eventId: event_id,
    count: created.length
  })

  res.status(201).json({ tickets: created })
})

router.get('/latest', async (req, res) => {
  try {
    const { data: tickets, error } = await supabaseAdmin
      .from('ticket_requests')
      .select(`id, user_id, tier_name, created_at, events!inner(title)`)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) return res.status(500).json({ error: 'Gagal memuat data' })

    const enriched = await Promise.all(tickets.map(async (t) => {
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(t.user_id)
      const name = user?.user?.user_metadata?.name || user?.user?.email?.split('@')[0] || 'Unknown'
      return { buyer_name: name, tier_name: t.tier_name, event_title: t.events.title, created_at: t.created_at }
    }))

    res.json(enriched)
  } catch {
    res.status(500).json({ error: 'Gagal memuat data' })
  }
})

router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  const { data: ticket, error } = await supabaseAdmin
    .from('ticket_requests')
    .select(`
      *,
      events!inner(title, date, location, banner_url, location_lat, location_lng, category, gallery_urls)
    `)
    .eq('id', id)
    .single()

  if (error || !ticket) {
    return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  }

  if (ticket.user_id !== userId) {
    return res.status(403).json({ error: 'Bukan tiket kamu' })
  }

  if (!['confirmed','completed'].includes(ticket.status)) {
    return res.status(403).json({ error: 'Tiket belum aktif', code: 'TICKET_NOT_ACTIVE' })
  }

  // Fetch thread_id
  const { data: thread } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('ticket_request_id', id)
    .maybeSingle()

  const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId)
  const holderName = user?.user?.user_metadata?.name || user?.user?.email || 'Unknown'

  const result = {
    id: ticket.id,
    event_id: ticket.event_id,
    event_title: ticket.events?.title || '',
    event_date: ticket.events?.date || '',
    event_location: ticket.events?.location || '',
    event_banner: ticket.events?.banner_url || '',
    event_category: ticket.events?.category || '',
    event_location_lat: ticket.events?.location_lat || null,
    event_location_lng: ticket.events?.location_lng || null,
    event_gallery_urls: ticket.events?.gallery_urls || [],
    holder_name: holderName,
    tier_name: ticket.tier_name || 'Regular',
    status: ticket.status,
    is_checked_in: ticket.is_checked_in || false,
    checked_in_at: ticket.checked_in_at || null,
    qr_data: ticket.id,
    thread_id: thread?.id || null
  }

  res.json({ ticket: result })
})

router.put('/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  if (!status || !['confirmed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Status harus "confirmed" atau "cancelled"' })
  }

  const { data: ticket, error: fetchError } = await supabaseAdmin
    .from('ticket_requests')
    .select(`
      *,
      events!inner(title, creator_id)
    `)
    .eq('id', id)
    .single()

  if (fetchError || !ticket) {
    return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  }

  // Only the event creator or the admin who claimed this ticket can change status
  if (ticket.events.creator_id !== req.user.id && ticket.claimed_by !== req.user.id) {
    return res.status(403).json({ error: 'Hanya kreator atau admin yang menangani tiket ini yang dapat mengubah status' })
  }

  if (ticket.status !== 'pending') {
    return res.status(400).json({ error: 'Tiket sudah diproses sebelumnya' })
  }

  // Require payment proof before allowing confirmation
  if (status === 'confirmed') {
    try {
      const { data: existingInvoice } = await supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('ticket_request_id', id)
        .maybeSingle()

      if (!existingInvoice || !existingInvoice.proof_image_url || existingInvoice.proof_image_url.trim() === '') {
        return res.status(400).json({ error: 'Bukti pembayaran wajib diunggah oleh pembeli sebelum tiket dapat dikonfirmasi' })
      }
    } catch (e) {
      logger.error('TICKETS-STATUS', 'Failed to validate invoice before confirm', { requestId: req.requestId, ticketId: id, error: e?.message || String(e) })
      return res.status(500).json({ error: 'Gagal memvalidasi data invoice' })
    }
  }

  if (status === 'confirmed') {
    const { error: confirmError } = await supabaseAdmin.rpc('confirm_ticket_request', { _ticket_id: id })
    if (confirmError) {
      logger.error('TICKETS-STATUS', 'Failed to atomically confirm ticket', {
        requestId: req.requestId,
        ticketId: id,
        error: confirmError.message
      })
      return res.status(500).json({ error: 'Gagal mengonfirmasi tiket' })
    }
  } else {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('ticket_requests')
      .update({ status })
      .eq('id', id)
      .eq('status', 'pending')

    if (updateError) {
      logger.error('TICKETS-STATUS', 'Failed to update ticket status', {
        requestId: req.requestId,
        ticketId: id,
        status,
        error: updateError.message
      })
      return res.status(500).json({ error: 'Gagal memperbarui status tiket' })
    }

    if (!updated || (Array.isArray(updated) && updated.length === 0)) {
      return res.status(400).json({ error: 'Tiket sudah diproses sebelumnya' })
    }
  }

  // Handle invoice generation + global purchase ticker when status becomes confirmed
  if (status === 'confirmed') {
    let buyerName = 'Unknown'
    try {
      const { data: buyerUser } = await supabaseAdmin.auth.admin.getUserById(ticket.user_id)
      buyerName = buyerUser?.user?.user_metadata?.name || buyerUser?.user?.email?.split('@')[0] || 'Unknown'

      const { data: tier } = await supabaseAdmin
        .from('ticket_tiers')
        .select('price')
        .eq('event_id', ticket.event_id)
        .eq('name', ticket.tier_name)
        .single()

      const price = tier ? tier.price : 0

      // Calculate sequential invoice number: INV-{EVENT_CODE}-{YYYYMMDD}-{SEQUENTIAL}
      const eventCode = ticket.events.title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X')
      const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '')

      const { count } = await supabaseAdmin
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', ticket.event_id)

      const seq = (count + 1).toString().padStart(4, '0')
      const invoiceNumber = `INV-${eventCode}-${yyyymmdd}-${seq}`

      await supabaseAdmin
        .from('invoices')
        .insert({
          ticket_request_id: id,
          invoice_number: invoiceNumber,
          event_id: ticket.event_id,
          buyer_name: buyerName,
          ticket_type: ticket.tier_name,
          quantity: 1,
          unit_price: price,
          total_amount: price,
          payment_date: new Date().toISOString(),
          payment_method: 'Manual Transfer',
          status: 'paid',
          approved_by: req.user.id,
          approved_at: new Date().toISOString(),
          approval_note: 'Auto-generated upon confirmation'
        })
    } catch (invoiceErr) {
      logger.error('TICKETS-INVOICE', 'Failed to create invoice upon confirmation', {
        requestId: req.requestId,
        ticketId: id,
        error: invoiceErr.message
      })
    }

    // Insert admin approval system message into chat thread (for traceability)
    try {
      const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(req.user.id)
      const adminName = adminUser?.user?.user_metadata?.name || adminUser?.user?.email || 'Admin'
      const { data: approvalThread } = await supabaseAdmin
        .from('chat_threads')
        .select('id')
        .eq('ticket_request_id', id)
        .maybeSingle()

      if (approvalThread) {
        await supabaseAdmin
          .from('chat_messages')
          .insert({
            thread_id: approvalThread.id,
            sender_id: req.user.id,
            message_type: 'system',
            content: `Pembayaran diverifikasi dan disetujui oleh ${adminName}.`
          })
      }
    } catch (e) {
      logger.warn('TICKETS-INVOICE', 'Failed to insert admin approval message', { requestId: req.requestId, ticketId: id, error: e?.message || String(e) })
    }

    const io = req.app.get('io')
    if (io) {
      io.emit('purchase:new', {
        buyer_name: buyerName,
        tier_name: ticket.tier_name,
        event_title: ticket.events.title,
        created_at: new Date().toISOString()
      })
    }
  }

  // Set chat thread is_active to false when status changes to confirmed or cancelled
  const { data: thread } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('ticket_request_id', id)
    .maybeSingle()

  if (thread) {
    await supabaseAdmin
      .from('chat_threads')
      .update({ is_active: false })
      .eq('id', thread.id)
  }

  const io = req.app.get('io')
  if (io) {
    io.to(`event:${ticket.event_id}:queue`).emit('queue:status_changed', { id, status })
    if (status === 'confirmed') {
      io.to(`event:${ticket.event_id}:attendance`).emit('attendance:update')
    }
  }

  if (status === 'confirmed') {
    try { recordEvent('tickets_confirmed') } catch {}
    await createNotification(
      ticket.user_id,
      'ticket_confirmed',
      'Tiket Dikonfirmasi',
      `Tiket ${ticket.tier_name} untuk ${ticket.events.title} telah dikonfirmasi`,
      ticket.event_id,
      'event'
    )
    await logEventRoleActivity(ticket.event_id, req.user.id, 'confirm_ticket', { ticket_request_id: id, status: 'confirmed' })
    await logAdminAction({ eventId: ticket.event_id, actorId: req.user.id, action: 'confirm_ticket', targetId: id })
  } else if (status === 'cancelled') {
    try { recordEvent('tickets_cancelled') } catch {}
    await createNotification(
      ticket.user_id,
      'ticket_cancelled',
      'Tiket Dibatalkan',
      `Tiket ${ticket.tier_name} untuk ${ticket.events.title} telah dibatalkan`,
      ticket.event_id,
      'event'
    )
    await logEventRoleActivity(ticket.event_id, req.user.id, 'cancel_ticket', { ticket_request_id: id, status: 'cancelled' })
    await logAdminAction({ eventId: ticket.event_id, actorId: req.user.id, action: 'cancel_ticket', targetId: id })
  }

  logger.info('TICKETS-STATUS', 'Ticket status updated', {
    requestId: req.requestId,
    ticketId: id,
    status
  })

  res.json({ message: `Tiket berhasil ${status === 'confirmed' ? 'dikonfirmasi' : 'dibatalkan'}` })
})

async function verifyEventAccess(eventId, userId) {
  const { data: event, error } = await supabaseAdmin
    .from('events')
    .select('creator_id')
    .eq('id', eventId)
    .single()

  if (error || !event) return null

  if (event.creator_id === userId) return event

  const { data: adminRole } = await supabaseAdmin
    .from('event_roles')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()

  if (adminRole) return event
  return null
}

router.get('/event/:eventId', requireAuth, async (req, res) => {
  const { eventId } = req.params

  const event = await verifyEventAccess(eventId, req.user.id)
  if (!event) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  const { data: tickets, error } = await supabaseAdmin
    .from('ticket_requests')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('TICKETS-EVENT', 'Failed to fetch event tickets', {
      requestId: req.requestId,
      eventId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil data tiket' })
  }

  const userIds = [...new Set([...tickets.map(t => t.user_id), ...tickets.map(t => t.claimed_by)].filter(Boolean))]
  const profileMap = {}
  await Promise.all(userIds.map(async (uid) => {
    try {
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(uid)
      if (user?.user) {
        profileMap[uid] = {
          name: user.user.user_metadata?.name || user.user.email?.split('@')[0] || '',
          email: user.user.email || ''
        }
      }
    } catch {
      profileMap[uid] = { name: 'Unknown', email: '' }
    }
  }))

  const enriched = tickets.map(t => ({
    ...t,
    profiles: t.user_id ? (profileMap[t.user_id] || { name: 'Unknown', email: '' }) : null,
    claimed_by_profile: t.claimed_by ? (profileMap[t.claimed_by] || null) : null
  }))

  res.json({ tickets: enriched })
})

router.patch('/:id/claim', requireAuth, async (req, res) => {
  const { id } = req.params
  const { claim } = req.body

  const { data: ticket, error: fetchError } = await supabaseAdmin
    .from('ticket_requests')
    .select('event_id, user_id, claimed_by')
    .eq('id', id)
    .single()

  if (fetchError || !ticket) {
    return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  }

  const event = await verifyEventAccess(ticket.event_id, req.user.id)
  if (!event) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  if (claim) {
    if (ticket.claimed_by && ticket.claimed_by !== req.user.id) {
      return res.status(409).json({ error: 'Tiket sudah diambil admin lain' })
    }
    await supabaseAdmin
      .from('ticket_requests')
      .update({ claimed_by: req.user.id, claimed_at: new Date().toISOString() })
      .eq('id', id)

    const { data: user } = await supabaseAdmin.auth.admin.getUserById(req.user.id)
    const adminName = user?.user?.user_metadata?.name || user?.user?.email?.split('@')[0] || 'Admin'

    const io = req.app.get('io')
    if (io) {
      io.to(`event:${ticket.event_id}:queue`).emit('queue:claimed', {
        id,
        claimed_by: req.user.id,
        claimed_by_profile: { name: adminName, email: user?.user?.email || '' }
      })
    }

    // Insert audit log for claim
    logAudit({ requestId: id, actorId: req.user.id, actorRole: 'admin', action: 'claim_ticket', metadata: { event_id: ticket.event_id } })
    await logAdminAction({ eventId: ticket.event_id, actorId: req.user.id, action: 'claim_ticket', targetId: id })

    // Ensure chat thread exists and insert a short system message template
    try {
      const { data: thread } = await supabaseAdmin
        .from('chat_threads')
        .select('id')
        .eq('ticket_request_id', id)
        .maybeSingle()

      let threadId = thread?.id
      if (!threadId) {
        const { data: newThread } = await supabaseAdmin
          .from('chat_threads')
          .insert({ ticket_request_id: id, is_active: true })
          .select('id')
          .maybeSingle()
        threadId = newThread?.id
      }

      if (threadId) {
        // Fetch event settings for claim message template
        const { data: eventSettings } = await supabaseAdmin
          .from('events')
          .select('claim_message_template_enabled, claim_message_template')
          .eq('id', ticket.event_id)
          .single()

        if (eventSettings?.claim_message_template_enabled && eventSettings?.claim_message_template) {
          const personalized = eventSettings.claim_message_template.replace(/\{admin\}/g, adminName)
          await supabaseAdmin
            .from('chat_messages')
            .insert({
              thread_id: threadId,
              sender_id: req.user.id,
              message_type: 'text',
              content: personalized
            })
        } else {
          const sysMessage = `Admin ${adminName} mengambil alih penanganan. Silakan kirim bukti transfer jika belum.`
          await supabaseAdmin
            .from('chat_messages')
            .insert({ thread_id: threadId, sender_id: req.user.id, message_type: 'system', content: sysMessage })
        }
      }
    } catch (e) {
      logger.warn('TICKETS-CLAIM', 'Failed to post claim system message', { requestId: id, error: e?.message || String(e) })
    }
  } else {
    if (ticket.claimed_by !== req.user.id) {
      return res.status(403).json({ error: 'Bukan claim kamu' })
    }
    await supabaseAdmin
      .from('ticket_requests')
      .update({ claimed_by: null, claimed_at: null })
      .eq('id', id)

    const io = req.app.get('io')
    if (io) {
      io.to(`event:${ticket.event_id}:queue`).emit('queue:released', { id })
    }

    // Audit release
    logAudit({ requestId: id, actorId: req.user.id, actorRole: 'admin', action: 'release_ticket', metadata: { event_id: ticket.event_id } })
    await logAdminAction({ eventId: ticket.event_id, actorId: req.user.id, action: 'release_ticket', targetId: id })
  }

  res.json({ message: claim ? 'Tiket diambil' : 'Tiket dilepaskan' })
})

// Simple message transcript (lightweight) for a ticket request
router.get('/:id/transcript', requireAuth, async (req, res) => {
  const { id } = req.params

  // Access control: only buyer, claiming admin, or creator can view transcript
  const { data: ticketReq } = await supabaseAdmin
    .from('ticket_requests')
    .select('user_id, claimed_by, event_id')
    .eq('id', id)
    .single()

  if (!ticketReq) {
    return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  }

  const isBuyer = ticketReq.user_id === req.user.id
  const isClaimer = ticketReq.claimed_by === req.user.id

  if (!isBuyer && !isClaimer) {
    const { data: ev } = await supabaseAdmin
      .from('events')
      .select('creator_id')
      .eq('id', ticketReq.event_id)
      .single()
    if (!ev || ev.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Akses ditolak' })
    }
  }

  const { data: thread } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('ticket_request_id', id)
    .maybeSingle()

  if (!thread) {
    return res.json({ transcript: [] })
  }

  const { data: messages, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id, thread_id, sender_id, message_type, content, image_url, created_at')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true })

  if (error) {
    logger.warn('TRANSCRIPT', 'Failed to fetch transcript', { requestId: id, error: error.message })
    return res.status(500).json({ error: 'Gagal mengambil transkrip pesan' })
  }

  // Fetch profile data for all unique senders
  const senderIds = [...new Set((messages || []).map(m => m.sender_id).filter(Boolean))]
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, avatar_url, name')
    .in('id', senderIds)
  const profileMap = {}
  if (profiles) {
    profiles.forEach(p => { profileMap[p.id] = p })
  }

  const simplified = (messages || []).map(m => ({
    id: m.id,
    sender: m.message_type === 'system' ? 'system' : (m.sender_id === req.user.id ? 'you' : 'other'),
    type: m.message_type,
    content: m.content,
    at: m.created_at,
    image_url: m.image_url || null,
    avatar_url: m.message_type === 'system' ? null : (profileMap[m.sender_id]?.avatar_url || null),
    sender_name: m.message_type === 'system' ? null : (profileMap[m.sender_id]?.name || null)
  }))

  res.json({ transcript: simplified })
})

// Analytics endpoint for event: basic counts and per-tier sold
router.get('/event/:eventId/analytics', requireAuth, async (req, res) => {
  const { eventId } = req.params
  const event = await verifyEventAccess(eventId, req.user.id)
  if (!event) return res.status(403).json({ error: 'Akses ditolak' })

  try {
    const [{ data: requests }, { data: perTier }] = await Promise.all([
      supabaseAdmin.from('ticket_requests').select('status, tier_name').eq('event_id', eventId),
      supabaseAdmin.from('ticket_tiers').select('name, price, sold_count, quota').eq('event_id', eventId)
    ])

    const statusCounts = { confirmed: 0, pending: 0, cancelled: 0 }
    let totalSold = 0
    let totalRevenue = 0

    if (requests) {
      for (const r of requests) {
        const s = r.status || 'pending'
        if (s === 'confirmed' || s === 'completed' || s === 'owned') {
          statusCounts.confirmed++
          totalSold++
          const tier = (perTier || []).find(t => t.name === r.tier_name)
          if (tier) {
            totalRevenue += Number(tier.price || 0)
          }
        } else if (s === 'cancelled' || s === 'expired') {
          statusCounts.cancelled++
        } else {
          statusCounts.pending++
        }
      }
    }

    res.json({
      tiers: perTier || [],
      status_counts: statusCounts,
      total_sold: totalSold,
      total_revenue: totalRevenue
    })
  } catch (e) {
    logger.error('ANALYTICS', 'Failed to compute analytics', { eventId, error: e?.message || String(e) })
    res.status(500).json({ error: 'Gagal menghitung analytics' })
  }
})

router.patch('/:id/validate', requireAuth, async (req, res) => {
  const { id } = req.params
  const { event_id, scan_secret } = req.body

  if (!event_id) {
    return res.status(400).json({ error: 'event_id wajib dikirim' })
  }

  const { data: ticket, error: fetchError } = await supabaseAdmin
    .from('ticket_requests')
    .select(`
      *,
      events!inner(id, title, creator_id)
    `)
    .eq('id', id)
    .single()

  if (fetchError || !ticket) {
    return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  }

  if (ticket.event_id !== event_id) {
    return res.status(400).json({ error: 'Tiket bukan untuk acara ini' })
  }

  if (scan_secret) {
    const { data: ev } = await supabaseAdmin
      .from('events')
      .select('scan_secret')
      .eq('id', event_id)
      .single()

    if (!ev || ev.scan_secret !== scan_secret) {
      return res.status(403).json({ error: 'Kunci scanner tidak valid' })
    }
  }

  if (ticket.status !== 'confirmed') {
    return res.status(400).json({ error: 'Tiket belum dikonfirmasi' })
  }

  // Enforce attendance only during event runtime (configurable via ENV EVENT_DURATION_HOURS)
  try {
    const { data: ev } = await supabaseAdmin
      .from('events')
      .select('date')
      .eq('id', ticket.event_id)
      .maybeSingle()

    if (ev && ev.date) {
      const start = new Date(ev.date)
      const durationHours = parseInt(process.env.EVENT_DURATION_HOURS) || 8
      const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)
      const now = new Date()
      if (now < start || now > end) {
        return res.status(400).json({ error: 'Check-in hanya bisa dilakukan saat acara berlangsung' })
      }
    }
  } catch (e) {
    logger.warn('TICKETS-VALIDATE', 'Failed to verify event time window', { requestId: req.requestId, error: e?.message || String(e) })
  }

  if (ticket.is_checked_in) {
    return res.status(409).json({ error: 'Tiket sudah digunakan untuk check-in' })
  }

  const event = await verifyEventAccess(ticket.event_id, req.user.id)
  if (!event) {
    return res.status(403).json({ error: 'Hanya admin acara yang dapat melakukan check-in' })
  }

  let holderName = 'Unknown'
  try {
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(ticket.user_id)
    if (user?.user) {
      holderName = user.user.user_metadata?.name || user.user.email?.split('@')[0] || 'Unknown'
    }
  } catch {
    holderName = 'Unknown'
  }

  const { error: updateError } = await supabaseAdmin
    .from('ticket_requests')
    .update({
      is_checked_in: true,
      checked_in_at: new Date().toISOString(),
      checked_in_by: req.user.id
    })
    .eq('id', id)

  if (updateError) {
    logger.error('TICKETS-VALIDATE', 'Failed to validate ticket', {
      requestId: req.requestId,
      ticketId: id,
      error: updateError.message
    })
    return res.status(500).json({ error: 'Gagal melakukan check-in' })
  }

  const io = req.app.get('io')
  if (io) {
    io.to(`event:${ticket.event_id}:attendance`).emit('attendance:checkin', {
      id: ticket.id,
      holder_name: holderName,
      tier_name: ticket.tier_name,
      checked_in_at: new Date().toISOString()
    })
  }

  logger.info('TICKETS-VALIDATE', 'Ticket validated', {
    requestId: req.requestId,
    ticketId: id,
    userId: req.user.id
  })

  res.json({
    message: 'Check-in berhasil',
    ticket: {
      id: ticket.id,
      holder_name: holderName,
      tier_name: ticket.tier_name,
      event_title: ticket.events.title
    }
  })
})

router.get('/:id/identify', requireAuth, async (req, res) => {
  const { id } = req.params
  const { event_id, scan_secret } = req.query

  if (!event_id) {
    return res.status(400).json({ error: 'event_id wajib dikirim' })
  }

  const { data: ticket, error: fetchError } = await supabaseAdmin
    .from('ticket_requests')
    .select(`
      *,
      events!inner(id, title, creator_id)
    `)
    .eq('id', id)
    .single()

  if (fetchError || !ticket) {
    return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  }

  if (ticket.event_id !== event_id) {
    return res.status(400).json({ error: 'Tiket bukan untuk acara ini' })
  }

  if (scan_secret) {
    const { data: ev } = await supabaseAdmin
      .from('events')
      .select('scan_secret')
      .eq('id', event_id)
      .single()

    if (!ev || ev.scan_secret !== scan_secret) {
      return res.status(403).json({ error: 'Kunci scanner tidak valid' })
    }
  }

  let holderName = 'Unknown'
  let holderEmail = ''
  try {
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(ticket.user_id)
    if (user?.user) {
      holderName = user.user.user_metadata?.name || user.user.email?.split('@')[0] || 'Unknown'
      holderEmail = user.user.email || ''
    }
  } catch {
    holderName = 'Unknown'
  }

  let seatInfo = null
  const { data: seat } = await supabaseAdmin
    .from('venue_seats')
    .select('seat_code, tier_id, status')
    .eq('reserved_by', id)
    .maybeSingle()
  if (seat) seatInfo = seat

  logger.info('TICKETS-IDENTIFY', 'Ticket identified', {
    requestId: req.requestId,
    ticketId: id,
    userId: req.user.id
  })

  res.json({
    ticket: {
      id: ticket.id,
      event_title: ticket.events.title,
      holder_name: holderName,
      holder_email: holderEmail,
      tier_name: ticket.tier_name || 'Regular',
      status: ticket.status,
      is_checked_in: ticket.is_checked_in || false,
      checked_in_at: ticket.checked_in_at || null,
      seat: seatInfo
    }
  })
})

// Buyer cancellations
router.patch('/:id/cancel-buyer', requireAuth, async (req, res) => {
  const { id } = req.params

  const { data: ticket, error: fetchError } = await supabaseAdmin
    .from('ticket_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !ticket) {
    return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  }

  if (ticket.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  if (ticket.status !== 'pending') {
    return res.status(400).json({ error: 'Hanya tiket pending yang dapat dibatalkan' })
  }

  const { error: updateError } = await supabaseAdmin
    .from('ticket_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)

  if (updateError) {
    return res.status(500).json({ error: 'Gagal membatalkan tiket' })
  }

  // Close the chat thread
  const { data: thread } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('ticket_request_id', id)
    .maybeSingle()

  if (thread) {
    await supabaseAdmin
      .from('chat_threads')
      .update({ is_active: false })
      .eq('id', thread.id)

    await supabaseAdmin
      .from('chat_messages')
      .insert({
        thread_id: thread.id,
        sender_id: req.user.id,
        message_type: 'system',
        content: 'Pesanan dibatalkan oleh pembeli.'
      })
  }

  const io = req.app.get('io')
  if (io) {
    io.to(`event:${ticket.event_id}:queue`).emit('queue:status_changed', { id, status: 'cancelled' })
  }

  res.json({ message: 'Tiket berhasil dibatalkan' })
})

// Creator can disable a confirmed ticket (special action only available to event creator)
router.patch('/:id/disable', requireAuth, async (req, res) => {
  const { id } = req.params

  const { data: ticket, error: fetchError } = await supabaseAdmin
    .from('ticket_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' })

  const { data: ev } = await supabaseAdmin
    .from('events')
    .select('creator_id')
    .eq('id', ticket.event_id)
    .maybeSingle()

  if (!ev || ev.creator_id !== req.user.id) return res.status(403).json({ error: 'Hanya kreator acara yang dapat menonaktifkan tiket' })

  if (ticket.status !== 'confirmed') return res.status(400).json({ error: 'Hanya tiket yang sudah dikonfirmasi yang dapat dinonaktifkan' })

  const { error: updateError } = await supabaseAdmin
    .from('ticket_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)

  if (updateError) return res.status(500).json({ error: 'Gagal menonaktifkan tiket' })

  // Automatically insert a refund request in the refund queue
  try {
    await supabaseAdmin
      .from('refund_requests')
      .insert({
        ticket_id: id,
        buyer_id: ticket.user_id,
        reason: 'Dibatalkan oleh Kreator Acara',
        status: 'pending'
      })
  } catch (refErr) {
    logger.error('REFUNDS-TRIGGER', 'Failed to trigger refund creation', { ticketId: id, error: refErr.message })
  }

  // Insert system message and keep the chat thread active for buyer-creator communication
  const { data: thread } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('ticket_request_id', id)
    .maybeSingle()

  if (thread) {
    // Keep chat thread active for buyer-creator chat
    await supabaseAdmin
      .from('chat_threads')
      .update({ is_active: true })
      .eq('id', thread.id)

    await supabaseAdmin.from('chat_messages').insert([
      {
        thread_id: thread.id,
        sender_id: req.user.id,
        message_type: 'system',
        content: 'Tiket dinonaktifkan oleh kreator acara.'
      },
      {
        thread_id: thread.id,
        sender_id: req.user.id,
        message_type: 'system',
        content: 'Permintaan refund telah diajukan secara otomatis. Anda sekarang berada di antrean refund.'
      }
    ])
  }

  // Log in admin audit log
  await logAdminAction({
    eventId: ticket.event_id,
    actorId: req.user.id,
    action: 'cancel_ticket_trigger_refund',
    targetId: id
  })

  const io = req.app.get('io')
  if (io) io.to(`event:${ticket.event_id}:queue`).emit('queue:status_changed', { id, status: 'cancelled' })

  res.json({ message: 'Tiket berhasil dinonaktifkan dan masuk antrean refund' })
})

// Admin extend deadline
router.patch('/:id/extend-deadline', requireAuth, async (req, res) => {
  const { id } = req.params

  const { data: ticket, error: fetchError } = await supabaseAdmin
    .from('ticket_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !ticket) {
    return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  }

  const event = await verifyEventAccess(ticket.event_id, req.user.id)
  if (!event) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  if (ticket.status !== 'pending') {
    return res.status(400).json({ error: 'Hanya tiket pending yang dapat diperpanjang' })
  }

  // Calculate new deadline (+30 minutes)
  const currentDeadline = new Date(ticket.payment_deadline || Date.now())
  const newDeadline = new Date(currentDeadline.getTime() + 30 * 60 * 1000).toISOString()

  const { error: updateError } = await supabaseAdmin
    .from('ticket_requests')
    .update({ payment_deadline: newDeadline })
    .eq('id', id)

  if (updateError) {
    return res.status(500).json({ error: 'Gagal memperpanjang batas waktu' })
  }

  // Insert system message into chat
  const { data: thread } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('ticket_request_id', id)
    .maybeSingle()

  if (thread) {
    await supabaseAdmin
      .from('chat_messages')
      .insert({
        thread_id: thread.id,
        sender_id: req.user.id,
        message_type: 'system',
        content: 'Batas waktu pembayaran diperpanjang selama 30 menit.'
      })
  }

  res.json({ message: 'Batas waktu pembayaran berhasil diperpanjang', payment_deadline: newDeadline })
})

// Buyer submits transfer proof
router.put('/:id/proof', requireAuth, async (req, res) => {
  const { id } = req.params
  const { transfer_reference, sender_bank, transfer_amount, proof_image_url } = req.body

  const reference = normalizeString(transfer_reference, MAX_REFERENCE_LENGTH)
  const bankName = normalizeString(sender_bank, MAX_BANK_NAME_LENGTH)
  const amount = Number(transfer_amount)

  if (!reference) {
    return res.status(400).json({ error: 'Nomor referensi wajib diisi' })
  }
  if (!bankName) {
    return res.status(400).json({ error: 'Bank/e-wallet tujuan wajib diisi' })
  }
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Jumlah transfer wajib diisi' })
  }
  if (!proof_image_url || !proof_image_url.trim()) {
    return res.status(400).json({ error: 'Bukti transfer (gambar) wajib diunggah' })
  }
  if (!isValidCloudinaryUrl(proof_image_url.trim())) {
    return res.status(400).json({ error: 'URL bukti transfer tidak valid' })
  }

  const { data: ticket, error: fetchError } = await supabaseAdmin
    .from('ticket_requests')
    .select(`
      *,
      events!inner(title, creator_id)
    `)
    .eq('id', id)
    .single()

  if (fetchError || !ticket) {
    return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  }

  if (ticket.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  if (ticket.status !== 'pending') {
    return res.status(400).json({ error: 'Hanya tiket pending yang dapat dikirim bukti transfer' })
  }

  // Get tier price for amount validation
  const { data: tier } = await supabaseAdmin
    .from('ticket_tiers')
    .select('price')
    .eq('event_id', ticket.event_id)
    .eq('name', ticket.tier_name)
    .maybeSingle()

  const tierPrice = tier?.price || 0
  if (transfer_amount < tierPrice) {
    return res.status(400).json({ error: `Jumlah transfer minimal Rp ${tierPrice.toLocaleString('id-ID')}`, code: 'AMOUNT_MISMATCH' })
  }

  // Upsert invoice record with proof data
  const { data: existingInvoice } = await supabaseAdmin
    .from('invoices')
    .select('id')
    .eq('ticket_request_id', id)
    .maybeSingle()

  if (existingInvoice) {
    const { error: updateErr } = await supabaseAdmin
      .from('invoices')
      .update({
        transfer_reference: transfer_reference.trim(),
        sender_bank,
        transfer_amount,
        proof_image_url: proof_image_url || ''
      })
      .eq('id', existingInvoice.id)

    if (updateErr) {
      logger.error('PROOF-UPDATE', 'Failed to update invoice for payment proof', { requestId: req.requestId, ticketId: id, error: updateErr.message })
      return res.status(500).json({ error: 'Gagal menyimpan bukti transfer' })
    }
  } else {
    let buyerName = 'Buyer'
    try {
      const { data: buyerUser } = await supabaseAdmin.auth.admin.getUserById(ticket.user_id)
      if (buyerUser?.user) {
        buyerName = buyerUser.user.user_metadata?.name
          || buyerUser.user.user_metadata?.full_name
          || buyerUser.user.email?.split('@')[0]
          || 'Buyer'
      }
    } catch (e) {
      logger.warn('PROOF-BUYER', 'Failed to fetch buyer name', { ticketId: id })
    }

    const eventCode = ticket.events.title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X')
    const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const { count } = await supabaseAdmin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', ticket.event_id)
    const seq = (count + 1).toString().padStart(4, '0')
    const invoiceNumber = `INV-${eventCode}-${yyyymmdd}-${seq}`

    const { error: insertErr } = await supabaseAdmin
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        ticket_request_id: id,
        event_id: ticket.event_id,
        buyer_name: buyerName,
        ticket_type: ticket.tier_name,
        quantity: 1,
        unit_price: tierPrice,
        total_amount: tierPrice,
        transfer_reference: transfer_reference.trim(),
        sender_bank,
        transfer_amount,
        proof_image_url: proof_image_url || '',
        status: 'paid'
      })

    if (insertErr) {
      logger.error('PROOF-INSERT', 'Failed to insert invoice for payment proof', { requestId: req.requestId, ticketId: id, error: insertErr.message })
      return res.status(500).json({ error: 'Gagal menyimpan bukti transfer' })
    }
  }

  res.json({ message: 'Bukti transfer berhasil dikirim' })
})

// Fetch invoices for event
router.get('/event/:eventId/invoices', requireAuth, async (req, res) => {
  const { eventId } = req.params

  const event = await verifyEventAccess(eventId, req.user.id)
  if (!event) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (error) {
    return res.status(500).json({ error: 'Gagal mengambil data invoice' })
  }

  // Resolve approved_by UUIDs to user-friendly names when present
  const approvedIds = [...new Set((invoices || []).map(i => i.approved_by).filter(Boolean))]
  const approverMap = {}
  await Promise.all(approvedIds.map(async (uid) => {
    try {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid)
      approverMap[uid] = u?.user?.user_metadata?.name || u?.user?.email || ''
    } catch {
      approverMap[uid] = ''
    }
  }))

  const enriched = (invoices || []).map(inv => ({
    ...inv,
    approved_by: inv.approved_by ? (approverMap[inv.approved_by] || inv.approved_by) : '',
    approval_note: inv.approval_note || ''
  }))

  res.json({ invoices: enriched })
})

// Export invoices
router.get('/event/:eventId/export/invoices', requireAuth, async (req, res) => {
  const { eventId } = req.params
  const { format } = req.query

  const event = await verifyEventAccess(eventId, req.user.id)
  if (!event) return res.status(403).json({ error: 'Akses ditolak' })

  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: 'Gagal mengambil data export' })

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Invoices')
    worksheet.columns = [
      { header: 'No. Invoice', key: 'invoice_number', width: 25 },
      { header: 'Nama Pembeli', key: 'buyer_name', width: 25 },
      { header: 'Tipe Tiket', key: 'ticket_type', width: 15 },
      { header: 'Jumlah', key: 'quantity', width: 10 },
      { header: 'Harga Satuan (IDR)', key: 'unit_price', width: 20 },
      { header: 'Total Bayar (IDR)', key: 'total_amount', width: 20 },
      { header: 'Tanggal Pembayaran', key: 'payment_date', width: 25 },
      { header: 'Metode Pembayaran', key: 'payment_method', width: 20 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Disetujui Oleh', key: 'approved_by', width: 25 },
      { header: 'Tanggal Persetujuan', key: 'approved_at', width: 25 }
    ]

    invoices.forEach(inv => {
      worksheet.addRow({
        invoice_number: inv.invoice_number,
        buyer_name: inv.buyer_name,
        ticket_type: inv.ticket_type,
        quantity: inv.quantity,
        unit_price: Number(inv.unit_price),
        total_amount: Number(inv.total_amount),
        payment_date: inv.payment_date ? new Date(inv.payment_date).toLocaleString('id-ID') : '',
        payment_method: inv.payment_method,
        status: inv.status,
        approved_by: inv.approved_by || '',
        approved_at: inv.approved_at ? new Date(inv.approved_at).toLocaleString('id-ID') : ''
      })
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=invoices-${eventId}.xlsx`)
    await workbook.xlsx.write(res)
    res.end()
  } else {
    let csv = 'No. Invoice,Nama Pembeli,Tipe Tiket,Jumlah,Harga Satuan (IDR),Total Bayar (IDR),Tanggal Pembayaran,Metode Pembayaran,Status,Disetujui Oleh,Tanggal Persetujuan\n'
    invoices.forEach(inv => {
      csv += `"${inv.invoice_number}","${inv.buyer_name}","${inv.ticket_type}",${inv.quantity},${inv.unit_price},${inv.total_amount},"${inv.payment_date ? new Date(inv.payment_date).toLocaleString('id-ID') : ''}","${inv.payment_method}","${inv.status}","${inv.approved_by || ''}","${inv.approved_at ? new Date(inv.approved_at).toLocaleString('id-ID') : ''}"\n`
    })
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename=invoices-${eventId}.csv`)
    res.send(csv)
  }
})

// Export attendance
router.get('/event/:eventId/export/attendance', requireAuth, async (req, res) => {
  const { eventId } = req.params
  const { format } = req.query

  const event = await verifyEventAccess(eventId, req.user.id)
  if (!event) return res.status(403).json({ error: 'Akses ditolak' })

  const { data: tickets, error } = await supabaseAdmin
    .from('ticket_requests')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: 'Gagal mengambil data export' })

  const userIds = [...new Set(tickets.map(t => t.user_id).filter(Boolean))]
  const profileMap = {}
  await Promise.all(userIds.map(async (uid) => {
    try {
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(uid)
      if (user?.user) {
        profileMap[uid] = {
          name: user.user.user_metadata?.name || user.user.email?.split('@')[0] || '',
          email: user.user.email || ''
        }
      }
    } catch {
      profileMap[uid] = { name: 'Unknown', email: '' }
    }
  }))

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Attendance')
    worksheet.columns = [
      { header: 'Nama Lengkap', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Tipe Tiket', key: 'ticket_type', width: 15 },
      { header: 'Status Kehadiran', key: 'status', width: 20 },
      { header: 'Waktu Check-in', key: 'checkin_time', width: 25 }
    ]

    tickets.forEach(t => {
      const profile = profileMap[t.user_id] || { name: 'Unknown', email: '' }
      worksheet.addRow({
        name: profile.name,
        email: profile.email,
        ticket_type: t.tier_name,
        status: t.is_checked_in ? 'Hadir' : 'Belum Hadir',
        checkin_time: t.checked_in_at ? new Date(t.checked_in_at).toLocaleString('id-ID') : ''
      })
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=attendance-${eventId}.xlsx`)
    await workbook.xlsx.write(res)
    res.end()
  } else {
    let csv = 'Nama Lengkap,Email,Tipe Tiket,Status Kehadiran,Waktu Check-in\n'
    tickets.forEach(t => {
      const profile = profileMap[t.user_id] || { name: 'Unknown', email: '' }
      csv += `"${profile.name}","${profile.email}","${t.tier_name}","${t.is_checked_in ? 'Hadir' : 'Belum Hadir'}","${t.checked_in_at ? new Date(t.checked_in_at).toLocaleString('id-ID') : ''}"\n`
    })
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename=attendance-${eventId}.csv`)
    res.send(csv)
  }
})

export default router

// Admin: approve invoice (mark as paid) and record approver metadata
// This is separated from ticket confirmation to allow manual review of proofs.
router.patch('/:id/approve-invoice', requireAuth, async (req, res) => {
  const { id } = req.params
  const { note, mark_confirmed } = req.body // optional approval note, optional also confirm ticket

  const { data: ticket, error: ticketErr } = await supabaseAdmin
    .from('ticket_requests')
    .select('*, events!inner(creator_id)')
    .eq('id', id)
    .maybeSingle()

  if (ticketErr || !ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan' })

  // verify admin access
  const event = await verifyEventAccess(ticket.event_id, req.user.id)
  if (!event) return res.status(403).json({ error: 'Akses ditolak' })

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('ticket_request_id', id)
    .maybeSingle()

  if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan untuk tiket ini' })

  // Enforce payment proof requirement
  if (!invoice.proof_image_url || invoice.proof_image_url.trim() === '') {
    return res.status(400).json({ error: 'Bukti pembayaran wajib diunggah oleh pembeli sebelum invoice dapat disetujui' })
  }

  // mark as paid and record approver
  const approvedAt = new Date().toISOString()
  const { error: updateErr } = await supabaseAdmin
    .from('invoices')
    .update({ status: 'paid', approved_by: req.user.id, approved_at: approvedAt, approval_note: note || 'Diverifikasi oleh admin' })
    .eq('id', invoice.id)

  if (updateErr) {
    logger.error('INVOICES-APPROVE', 'Failed to mark invoice paid', { requestId: req.requestId, invoiceId: invoice.id, error: updateErr.message })
    return res.status(500).json({ error: 'Gagal memproses persetujuan invoice' })
  }

  // Log to admin audit log
  await logAdminAction({
    eventId: ticket.event_id,
    actorId: req.user.id,
    action: 'approve_invoice',
    targetId: id,
    metadata: { note, invoice_id: invoice.id }
  })

  // insert chat message for audit trail
  try {
    const { data: thread } = await supabaseAdmin
      .from('chat_threads')
      .select('id')
      .eq('ticket_request_id', id)
      .maybeSingle()

    if (thread) {
      await supabaseAdmin.from('chat_messages').insert({
        thread_id: thread.id,
        sender_id: req.user.id,
        message_type: 'system',
        content: `Pembayaran diverifikasi dan disetujui oleh ${req.user.id}. ${note || ''}`
      })
    }
  } catch (e) {
    logger.warn('INVOICES-APPROVE', 'Failed to insert approval chat message', { requestId: req.requestId, error: e?.message || String(e) })
  }

  // Optionally confirm the ticket as well
  if (mark_confirmed) {
    try {
      await supabaseAdmin
        .from('ticket_requests')
        .update({ status: 'confirmed' })
        .eq('id', id)

      // emit realtime and notif
      const io = req.app.get('io')
      if (io) io.to(`event:${ticket.event_id}:queue`).emit('queue:status_changed', { id, status: 'confirmed' })

      await createNotification(
        ticket.user_id,
        'ticket_confirmed',
        'Tiket Dikonfirmasi',
        `Tiket ${ticket.tier_name} untuk ${ticket.events.title} telah dikonfirmasi`,
        ticket.event_id,
        'event'
      )
    } catch (e) {
      logger.error('INVOICES-APPROVE', 'Failed to confirm ticket after approval', { requestId: req.requestId, ticketId: id, error: e?.message || String(e) })
    }
  }

  res.json({ message: 'Invoice disetujui' })
})

// GET /api/tickets/event/:eventId/refunds — Retrieve all refund requests for an event
router.get('/event/:eventId/refunds', requireAuth, async (req, res) => {
  const { eventId } = req.params

  const event = await verifyEventAccess(eventId, req.user.id)
  if (!event) return res.status(403).json({ error: 'Akses ditolak' })

  try {
    // Get all ticket request IDs for this event
    const { data: tickets, error: ticketError } = await supabaseAdmin
      .from('ticket_requests')
      .select('id')
      .eq('event_id', eventId)

    if (ticketError) {
      return res.status(500).json({ error: 'Gagal mengambil data tiket' })
    }

    if (!tickets || tickets.length === 0) {
      return res.json({ refunds: [] })
    }

    const ticketIds = tickets.map(t => t.id)

    const { data: refunds, error: refundError } = await supabaseAdmin
      .from('refund_requests')
      .select('*')
      .in('ticket_id', ticketIds)
      .order('requested_at', { ascending: false })

    if (refundError) {
      logger.error('REFUNDS-GET', 'Failed to fetch refunds', { error: refundError.message, eventId })
      return res.status(500).json({ error: 'Gagal mengambil antrean refund' })
    }

    // Enrich refund requests
    const enriched = await Promise.all((refunds || []).map(async (ref) => {
      const { data: ticket } = await supabaseAdmin
        .from('ticket_requests')
        .select('tier_name, status, user_id')
        .eq('id', ref.ticket_id)
        .single()

      const { data: invoice } = await supabaseAdmin
        .from('invoices')
        .select('total_amount, proof_image_url, transfer_reference, sender_bank')
        .eq('ticket_request_id', ref.ticket_id)
        .maybeSingle()

      const { data: user } = await supabaseAdmin.auth.admin.getUserById(ref.buyer_id)
      const buyerProfile = user?.user ? {
        name: user.user.user_metadata?.name || user.user.email?.split('@')[0] || 'Unknown',
        email: user.user.email || ''
      } : { name: 'Unknown', email: '' }

      const { data: thread } = await supabaseAdmin
        .from('chat_threads')
        .select('id')
        .eq('ticket_request_id', ref.ticket_id)
        .maybeSingle()

      return {
        ...ref,
        buyer_profile: buyerProfile,
        ticket_tier: ticket?.tier_name || 'Regular',
        ticket_status: ticket?.status || '',
        invoice: invoice || null,
        thread_id: thread?.id || null
      }
    }))

    res.json({ refunds: enriched })
  } catch (err) {
    logger.error('REFUNDS-GET', 'Unexpected error', { error: err.message, eventId })
    res.status(500).json({ error: 'Gagal mengambil antrean refund' })
  }
})

// PATCH /api/tickets/refunds/:id/approve — Creator approves refund request
router.patch('/refunds/:id/approve', requireAuth, async (req, res) => {
  const { id } = req.params
  const { note } = req.body

  try {
    const { data: refund, error: fetchError } = await supabaseAdmin
      .from('refund_requests')
      .select('*, ticket_requests!inner(event_id, tier_name, user_id)')
      .eq('id', id)
      .single()

    if (fetchError || !refund) return res.status(404).json({ error: 'Permintaan refund tidak ditemukan' })

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('creator_id')
      .eq('id', refund.ticket_requests.event_id)
      .single()

    if (eventError || !event || event.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Hanya kreator acara yang dapat menyetujui refund' })
    }

    if (refund.status !== 'pending') {
      return res.status(400).json({ error: 'Permintaan refund sudah diproses' })
    }

    // Update refund status
    const { error: updateErr } = await supabaseAdmin
      .from('refund_requests')
      .update({
        status: 'approved',
        reviewed_by: req.user.id,
        review_note: note || 'Refund disetujui',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateErr) return res.status(500).json({ error: 'Gagal menyetujui refund' })

    // Decrement sold_count on the ticket tier (automatically incrementing available inventory by +1)
    const { error: decError } = await supabaseAdmin.rpc('decrement_tier_sold_count', {
      _event_id: refund.ticket_requests.event_id,
      _tier_name: refund.ticket_requests.tier_name
    })

    if (decError) {
      logger.error('REFUNDS-APPROVE', 'Failed to decrement sold count', { error: decError.message })
    }

    // Set invoices status to refunded
    await supabaseAdmin
      .from('invoices')
      .update({ status: 'refunded' })
      .eq('ticket_request_id', refund.ticket_id)

    // Close the chat thread associated with this ticket
    const { data: thread } = await supabaseAdmin
      .from('chat_threads')
      .select('id')
      .eq('ticket_request_id', refund.ticket_id)
      .maybeSingle()

    if (thread) {
      await supabaseAdmin
        .from('chat_threads')
        .update({ is_active: false })
        .eq('id', thread.id)

      await supabaseAdmin.from('chat_messages').insert({
        thread_id: thread.id,
        sender_id: req.user.id,
        message_type: 'system',
        content: `Proses refund telah selesai disetujui oleh Kreator Acara. Note: ${note || ''}`
      })
    }

    // Log admin audit action
    await logAdminAction({
      eventId: refund.ticket_requests.event_id,
      actorId: req.user.id,
      action: 'approve_refund',
      targetId: id,
      metadata: { ticket_id: refund.ticket_id, note }
    })

    // Notify buyer
    await createNotification(
      refund.buyer_id,
      'refund_approved',
      'Refund Disetujui',
      `Permintaan refund Anda telah disetujui oleh kreator acara`,
      refund.ticket_requests.event_id,
      'event'
    )

    res.json({ message: 'Refund berhasil disetujui' })
  } catch (err) {
    logger.error('REFUNDS-APPROVE', 'Unexpected error', { error: err.message, refundId: id })
    res.status(500).json({ error: 'Gagal menyetujui refund' })
  }
})

// PATCH /api/tickets/refunds/:id/reject — Creator rejects refund request
router.patch('/refunds/:id/reject', requireAuth, async (req, res) => {
  const { id } = req.params
  const { note } = req.body

  try {
    const { data: refund, error: fetchError } = await supabaseAdmin
      .from('refund_requests')
      .select('*, ticket_requests!inner(event_id)')
      .eq('id', id)
      .single()

    if (fetchError || !refund) return res.status(404).json({ error: 'Permintaan refund tidak ditemukan' })

    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('creator_id')
      .eq('id', refund.ticket_requests.event_id)
      .single()

    if (eventError || !event || event.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Hanya kreator acara yang dapat menolak refund' })
    }

    if (refund.status !== 'pending') {
      return res.status(400).json({ error: 'Permintaan refund sudah diproses' })
    }

    const { error: updateErr } = await supabaseAdmin
      .from('refund_requests')
      .update({
        status: 'rejected',
        reviewed_by: req.user.id,
        review_note: note || 'Refund ditolak',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateErr) return res.status(500).json({ error: 'Gagal menolak refund' })

    // Insert chat system message
    const { data: thread } = await supabaseAdmin
      .from('chat_threads')
      .select('id')
      .eq('ticket_request_id', refund.ticket_id)
      .maybeSingle()

    if (thread) {
      await supabaseAdmin.from('chat_messages').insert({
        thread_id: thread.id,
        sender_id: req.user.id,
        message_type: 'system',
        content: `Permintaan refund ditolak oleh Kreator Acara. Alasan: ${note || ''}`
      })
    }

    // Log admin audit action
    await logAdminAction({
      eventId: refund.ticket_requests.event_id,
      actorId: req.user.id,
      action: 'reject_refund',
      targetId: id,
      metadata: { ticket_id: refund.ticket_id, note }
    })

    // Notify buyer
    await createNotification(
      refund.buyer_id,
      'refund_rejected',
      'Refund Ditolak',
      `Permintaan refund Anda ditolak oleh kreator acara. Alasan: ${note || ''}`,
      refund.ticket_requests.event_id,
      'event'
    )

    res.json({ message: 'Refund berhasil ditolak' })
  } catch (err) {
    logger.error('REFUNDS-REJECT', 'Unexpected error', { error: err.message, refundId: id })
    res.status(500).json({ error: 'Gagal menolak refund' })
  }
})
