import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'
import { createNotification } from './notifications.js'
import ExcelJS from 'exceljs'

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

  if (ticket.events.creator_id !== req.user.id) {
    const { data: adminRole } = await supabaseAdmin
      .from('event_roles')
      .select('id')
      .eq('event_id', ticket.event_id)
      .eq('user_id', req.user.id)
      .eq('status', 'accepted')
      .maybeSingle()

    if (!adminRole) {
      return res.status(403).json({ error: 'Hanya kreator atau admin acara yang dapat mengubah status tiket' })
    }
  }

  if (ticket.status !== 'pending') {
    return res.status(400).json({ error: 'Tiket sudah diproses sebelumnya' })
  }

  // Serialize confirm path to avoid race updating sold_count
  const lockKey = `event:${ticket.event_id}:tier:${ticket.tier_name}`
  try {
    await withLock(lockKey, async () => {
      const { error: updateError } = await supabaseAdmin
        .from('ticket_requests')
        .update({ status })
        .eq('id', id)

      if (updateError) {
        logger.error('TICKETS-STATUS', 'Failed to update ticket status', {
          requestId: req.requestId,
          ticketId: id,
          status,
          error: updateError.message
        })
        throw new Error('update_failed')
      }

      // When confirming, increment sold_count in ticket_tiers and mark seats as owned
      if (status === 'confirmed') {
        try {
          const { data: tier } = await supabaseAdmin
            .from('ticket_tiers')
            .select('id, sold_count')
            .eq('event_id', ticket.event_id)
            .eq('name', ticket.tier_name)
            .maybeSingle()

          if (tier && tier.id) {
            const newSold = (tier.sold_count || 0) + 1
            await supabaseAdmin
              .from('ticket_tiers')
              .update({ sold_count: newSold })
              .eq('id', tier.id)
          }
        } catch (e) {
          logger.error('TICKETS-STATUS', 'Failed to increment sold_count', { requestId: req.requestId, error: e?.message || String(e) })
        }

        // Update venue_seats from reserved to owned
        try {
          await supabaseAdmin
            .from('venue_seats')
            .update({ status: 'owned', reserved_until: null })
            .eq('reserved_by', id)
            .eq('status', 'reserved')

          const io = req.app.get('io')
          if (io) {
            const { data: updatedSeats } = await supabaseAdmin
              .from('venue_seats')
              .select('id')
              .eq('reserved_by', id)
              .eq('status', 'owned')

            if (updatedSeats) {
              updatedSeats.forEach(s => {
                io.to(`event:${ticket.event_id}:seats`).emit('SEAT_UPDATE', {
                  seatId: s.id,
                  status: 'owned'
                })
              })
            }
          }
        } catch (e) {
          logger.error('TICKETS-STATUS', 'Failed to update seat status', { requestId: req.requestId, error: e?.message || String(e) })
        }
      }
    })
  } catch (err) {
    if (err.message === 'update_failed') return res.status(500).json({ error: 'Gagal memperbarui status tiket' })
    logger.error('TICKETS-STATUS', 'Error updating status', { requestId: req.requestId, error: err?.message || String(err) })
    return res.status(500).json({ error: 'Gagal memperbarui status tiket' })
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
          status: 'paid'
        })
    } catch (invoiceErr) {
      logger.error('TICKETS-INVOICE', 'Failed to create invoice upon confirmation', {
        requestId: req.requestId,
        ticketId: id,
        error: invoiceErr.message
      })
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
    await createNotification(
      ticket.user_id,
      'ticket_confirmed',
      'Tiket Dikonfirmasi',
      `Tiket ${ticket.tier_name} untuk ${ticket.events.title} telah dikonfirmasi`,
      ticket.event_id,
      'event'
    )
  } else if (status === 'cancelled') {
    await createNotification(
      ticket.user_id,
      'ticket_cancelled',
      'Tiket Dibatalkan',
      `Tiket ${ticket.tier_name} untuk ${ticket.events.title} telah dibatalkan`,
      ticket.event_id,
      'event'
    )
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
  }

  res.json({ message: claim ? 'Tiket diambil' : 'Tiket dilepaskan' })
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

  if (!transfer_reference || !transfer_reference.trim()) {
    return res.status(400).json({ error: 'Nomor referensi wajib diisi' })
  }
  if (!sender_bank) {
    return res.status(400).json({ error: 'Bank/e-wallet tujuan wajib diisi' })
  }
  if (!transfer_amount || transfer_amount <= 0) {
    return res.status(400).json({ error: 'Jumlah transfer wajib diisi' })
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
    await supabaseAdmin
      .from('invoices')
      .update({
        transfer_reference: transfer_reference.trim(),
        sender_bank,
        transfer_amount,
        proof_image_url: proof_image_url || ''
      })
      .eq('id', existingInvoice.id)
  } else {
    await supabaseAdmin
      .from('invoices')
      .insert({
        ticket_request_id: id,
        event_id: ticket.event_id,
        buyer_name: 'Buyer',
        ticket_type: ticket.tier_name,
        quantity: 1,
        unit_price: tierPrice,
        total_amount: tierPrice,
        transfer_reference: transfer_reference.trim(),
        sender_bank,
        transfer_amount,
        proof_image_url: proof_image_url || '',
        status: 'unpaid'
      })
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

  res.json({ invoices })
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
      { header: 'Status', key: 'status', width: 12 }
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
        status: inv.status
      })
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=invoices-${eventId}.xlsx`)
    await workbook.xlsx.write(res)
    res.end()
  } else {
    let csv = 'No. Invoice,Nama Pembeli,Tipe Tiket,Jumlah,Harga Satuan (IDR),Total Bayar (IDR),Tanggal Pembayaran,Metode Pembayaran,Status\n'
    invoices.forEach(inv => {
      csv += `"${inv.invoice_number}","${inv.buyer_name}","${inv.ticket_type}",${inv.quantity},${inv.unit_price},${inv.total_amount},"${inv.payment_date ? new Date(inv.payment_date).toLocaleString('id-ID') : ''}","${inv.payment_method}","${inv.status}"\n`
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
