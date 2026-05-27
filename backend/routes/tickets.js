import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'
import { createNotification } from './notifications.js'
import ExcelJS from 'exceljs'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id

  const { data: tickets, error } = await supabaseAdmin
    .from('ticket_requests')
    .select(`
      *,
      events!inner(title, date, location, banner_url)
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

  const result = tickets.map(t => ({
    id: t.id,
    event_id: t.event_id,
    event_name: t.events?.title || '',
    event_date: t.events?.date || '',
    event_location: t.events?.location || '',
    tier_name: t.tier_name || 'Regular',
    status: t.status || 'pending',
    qr_data: t.id
  }))

  res.json({ tickets: result })
})

router.post('/', requireAuth, async (req, res) => {
  const { event_id, items } = req.body

  if (!event_id) {
    return res.status(400).json({ error: 'event_id wajib diisi' })
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Minimal satu tiket harus dipilih' })
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id, creator_id, title, date, status')
    .eq('id', event_id)
    .single()

  if (eventError || !event) {
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  if (event.creator_id === req.user.id) {
    logger.warn('TICKETS-CREATE', 'Creator tried to request own ticket', {
      requestId: req.requestId,
      userId: req.user.id,
      eventId: event_id
    })
    return res.status(403).json({ error: 'Kreator tidak bisa memesan tiket di acara sendiri' })
  }

  if (event.status !== 'published') {
    return res.status(400).json({
      error: 'Acara belum dipublikasikan atau sudah tidak aktif',
      code: 'EVENT_NOT_ACTIVE'
    })
  }

  if (new Date(event.date) < new Date()) {
    return res.status(400).json({
      error: 'Acara sudah berlalu, tidak bisa memesan tiket',
      code: 'EVENT_NOT_ACTIVE'
    })
  }

  const tierNames = [...new Set(items.map(i => i.tier_name))]
  const { data: tiers, error: tiersError } = await supabaseAdmin
    .from('ticket_tiers')
    .select('*')
    .eq('event_id', event_id)
    .in('name', tierNames)

  if (tiersError || !tiers || tiers.length === 0) {
    return res.status(400).json({ error: 'Tiket yang dipilih tidak tersedia' })
  }

  const tierMap = Object.fromEntries(tiers.map(t => [t.name, t]))

  const invalidItems = items.filter(i => !tierMap[i.tier_name])
  if (invalidItems.length > 0) {
    return res.status(400).json({
      error: `Tiket tidak ditemukan: ${invalidItems.map(i => i.tier_name).join(', ')}`
    })
  }

  const created = []

  for (const item of items) {
    const tier = tierMap[item.tier_name]
    const quantity = item.quantity || 1

    if (tier.quota > 0) {
      const { count: existingCount, error: countError } = await supabaseAdmin
        .from('ticket_requests')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event_id)
        .eq('tier_name', item.tier_name)
        .not('status', 'in', '("cancelled","completed")')

      if (!countError && existingCount !== null) {
        const available = tier.quota - existingCount
        if (available < quantity) {
          logger.warn('TICKETS-CREATE', 'Not enough tickets available', {
            requestId: req.requestId,
            tierName: item.tier_name,
            requested: quantity,
            available: Math.max(0, available)
          })
          return res.status(409).json({
            error: `Tiket ${item.tier_name} tidak mencukupi. Sisa: ${Math.max(0, available)}`,
            code: 'NOT_ENOUGH_TICKETS',
            available: Math.max(0, available)
          })
        }
      }
    }

    const { data: existingRequest } = await supabaseAdmin
      .from('ticket_requests')
      .select('id, status')
      .eq('event_id', event_id)
      .eq('user_id', req.user.id)
      .eq('tier_name', item.tier_name)
      .not('status', 'in', '("cancelled","completed")')
      .maybeSingle()

    if (existingRequest) {
      logger.warn('TICKETS-CREATE', 'Duplicate ticket request', {
        requestId: req.requestId,
        userId: req.user.id,
        tierName: item.tier_name
      })
      return res.status(409).json({
        error: `Kamu sudah memiliki permintaan tiket ${item.tier_name} yang aktif untuk acara ini`,
        code: 'DUPLICATE_REQUEST',
        existing_status: existingRequest.status
      })
    }

    for (let i = 0; i < quantity; i++) {
      const isFree = tier.price === 0
      const { data: ticket, error: insertError } = await supabaseAdmin
        .from('ticket_requests')
        .insert({
          event_id,
          user_id: req.user.id,
          tier_name: item.tier_name,
          status: isFree ? 'confirmed' : 'pending',
          payment_deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString()
        })
        .select()
        .single()

      if (insertError) {
        logger.error('TICKETS-CREATE', 'Failed to create ticket request', {
          requestId: req.requestId,
          error: insertError.message
        })
        return res.status(500).json({ error: 'Gagal membuat permintaan tiket' })
      }

      created.push(ticket)
    }
  }

  const { data: requesterUser } = await supabaseAdmin.auth.admin.getUserById(req.user.id)
  const requesterName = requesterUser?.user?.user_metadata?.name || requesterUser?.user?.email || 'Seseorang'
  const requesterProfile = {
    name: requesterName,
    email: requesterUser?.user?.email || ''
  }

  const io = req.app.get('io')
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

  logger.info('TICKETS-CREATE', 'Ticket requests created', {
    requestId: req.requestId,
    userId: req.user.id,
    eventId: event_id,
    count: created.length
  })

  res.status(201).json({ tickets: created })
})

router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  const { data: ticket, error } = await supabaseAdmin
    .from('ticket_requests')
    .select(`
      *,
      events!inner(title, date, location, banner_url)
    `)
    .eq('id', id)
    .single()

  if (error || !ticket) {
    return res.status(404).json({ error: 'Tiket tidak ditemukan' })
  }

  if (ticket.user_id !== userId) {
    return res.status(403).json({ error: 'Bukan tiket kamu' })
  }

  const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId)
  const holderName = user?.user?.user_metadata?.name || user?.user?.email || 'Unknown'

  const result = {
    id: ticket.id,
    event_title: ticket.events?.title || '',
    event_date: ticket.events?.date || '',
    event_location: ticket.events?.location || '',
    event_banner: ticket.events?.banner_url || '',
    holder_name: holderName,
    tier_name: ticket.tier_name || 'Regular',
    qr_data: ticket.id
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
    return res.status(500).json({ error: 'Gagal memperbarui status tiket' })
  }

  // Handle invoice generation when status becomes confirmed
  if (status === 'confirmed') {
    try {
      const { data: buyerUser } = await supabaseAdmin.auth.admin.getUserById(ticket.user_id)
      const buyerName = buyerUser?.user?.user_metadata?.name || buyerUser?.user?.email?.split('@')[0] || 'Unknown'

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
