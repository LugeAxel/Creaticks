import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { verifyAdminScope } from '../middleware/adminScope.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'
import { createNotification } from './notifications.js'

const router = Router()

async function verifyEventAccess(eventId, userId) {
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('creator_id')
    .eq('id', eventId)
    .single()

  if (!event) return null
  if (event.creator_id === userId) return event

  const adminRole = await verifyAdminScope(eventId, userId)
  if (adminRole) return event

  return null
}

// List all seats for an event
router.get('/events/:eventId/seats', requireAuth, async (req, res) => {
  const { eventId } = req.params

  const event = await verifyEventAccess(eventId, req.user.id)
  if (!event) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  const { data: seats, error } = await supabaseAdmin
    .from('venue_seats')
    .select('*')
    .eq('event_id', eventId)
    .order('y', { ascending: true })
    .order('x', { ascending: true })

  if (error) {
    logger.error('SEATS-LIST', 'Failed to fetch seats', {
      requestId: req.requestId,
      eventId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil data kursi' })
  }

  res.json({ seats })
})

// Public seat listing (for buyer view — no auth required for published events)
router.get('/events/:eventId/seats/public', async (req, res) => {
  const { eventId } = req.params

  const { data: event } = await supabaseAdmin
    .from('events')
    .select('id, status, visibility')
    .eq('id', eventId)
    .single()

  if (!event || event.status !== 'published') {
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  const { data: seats, error } = await supabaseAdmin
    .from('venue_seats')
    .select('id, seat_code, tier_id, x, y, status')
    .eq('event_id', eventId)
    .order('y', { ascending: true })
    .order('x', { ascending: true })

  if (error) {
    return res.status(500).json({ error: 'Gagal mengambil data kursi' })
  }

  res.json({ seats })
})

// Overview seats with owner info (for manage panel)
router.get('/events/:eventId/seats/overview', requireAuth, async (req, res) => {
  const { eventId } = req.params

  const event = await verifyEventAccess(eventId, req.user.id)
  if (!event) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  const { data: seats, error } = await supabaseAdmin
    .from('venue_seats')
    .select(`
      id, seat_code, tier_id, x, y, status,
      ticket_requests(user_id)
    `)
    .eq('event_id', eventId)
    .order('y', { ascending: true })
    .order('x', { ascending: true })

  if (error) {
    logger.error('SEATS-OVERVIEW', 'Failed to fetch seats', {
      requestId: req.requestId,
      eventId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil data kursi' })
  }

  // Enrich with owner names
  const enriched = await Promise.all(seats.map(async (s) => {
    let owner_name = null
    const tr = s.ticket_requests
    const userId = Array.isArray(tr) ? tr[0]?.user_id : tr?.user_id
    if (userId) {
      try {
        const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId)
        owner_name = user?.user?.user_metadata?.name || user?.user?.email?.split('@')[0] || null
      } catch {}
    }
    return { id: s.id, seat_code: s.seat_code, tier_id: s.tier_id, x: s.x, y: s.y, status: s.status, owner_name }
  }))

  res.json({ seats: enriched })
})

// Lock a seat (atomic, FOR UPDATE NOWAIT)
router.post('/seat-locks', requireAuth, async (req, res) => {
  const { seatId, ticketTypeId, sessionId } = req.body

  if (!seatId || !sessionId) {
    return res.status(400).json({ error: 'seatId dan sessionId wajib diisi' })
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('lock_seat', {
      _seat_id: seatId,
      _session_id: sessionId,
      _lock_minutes: 10
    })

    if (error) {
      const msg = (error.message || '').toUpperCase()

      if (msg.includes('NOWAIT') || msg.includes('could not obtain lock')) {
        return res.status(409).json({
          error: 'Kursi sedang diproses pengguna lain, coba lagi',
          code: 'SEAT_LOCK_CONTENTION'
        })
      }

      logger.error('SEATS-LOCK', 'RPC lock_seat failed', {
        requestId: req.requestId,
        seatId,
        error: error.message
      })
      return res.status(500).json({ error: 'Gagal mengunci kursi' })
    }

    const result = Array.isArray(data) ? data[0] : data

    if (!result || !result.success) {
      return res.status(409).json({
        error: 'Kursi sudah tidak tersedia',
        code: 'SEAT_UNAVAILABLE'
      })
    }

    // Emit real-time update
    const io = req.app.get('io')
    if (io) {
      const { data: seat } = await supabaseAdmin
        .from('venue_seats')
        .select('event_id')
        .eq('id', seatId)
        .single()

      if (seat) {
        io.to(`event:${seat.event_id}:seats`).emit('SEAT_UPDATE', {
          seatId,
          status: 'reserved',
          reservedUntil: result.expires_at
        })
      }
    }

    res.json({
      message: 'Kursi berhasil dikunci',
      lock_expires_at: result.expires_at
    })
  } catch (e) {
    logger.error('SEATS-LOCK', 'Unexpected error', {
      requestId: req.requestId,
      seatId,
      error: e?.message || String(e)
    })
    return res.status(500).json({ error: 'Gagal mengunci kursi' })
  }
})

// Release a seat lock
router.delete('/seat-locks/:seatId', requireAuth, async (req, res) => {
  const { seatId } = req.params
  const { sessionId } = req.body

  try {
    const { data, error } = await supabaseAdmin.rpc('release_seat', {
      _seat_id: seatId,
      _session_id: sessionId || null
    })

    if (error) {
      logger.error('SEATS-RELEASE', 'RPC release_seat failed', {
        requestId: req.requestId,
        seatId,
        error: error.message
      })
      return res.status(500).json({ error: 'Gagal melepas kursi' })
    }

    if (!data) {
      return res.status(400).json({ error: 'Kursi tidak dapat dilepas — status tidak sesuai' })
    }

    const io = req.app.get('io')
    if (io) {
      const { data: seat } = await supabaseAdmin
        .from('venue_seats')
        .select('event_id')
        .eq('id', seatId)
        .single()

      if (seat) {
        io.to(`event:${seat.event_id}:seats`).emit('SEAT_UPDATE', {
          seatId,
          status: 'available',
          reservedUntil: null
        })
      }
    }

    res.json({ message: 'Kursi berhasil dilepas' })
  } catch (e) {
    logger.error('SEATS-RELEASE', 'Unexpected error', {
      requestId: req.requestId,
      seatId,
      error: e?.message || String(e)
    })
    return res.status(500).json({ error: 'Gagal melepas kursi' })
  }
})

// Generate seats from seat_map data (creator only)
router.post('/events/:eventId/seats/generate', requireAuth, async (req, res) => {
  const { eventId } = req.params
  const { gridX, gridY, seats } = req.body

  if (!gridX || !gridY || !seats || !Array.isArray(seats)) {
    return res.status(400).json({ error: 'gridX, gridY, dan seats wajib diisi' })
  }

  // Verify creator
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('creator_id')
    .eq('id', eventId)
    .single()

  if (!event || event.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Hanya kreator yang dapat generate kursi' })
  }

  // Check for booked seats — prevent data loss
  const { data: bookedSeats } = await supabaseAdmin
    .from('venue_seats')
    .select('id, seat_code, x, y, status, tier_id')
    .eq('event_id', eventId)
    .in('status', ['reserved', 'owned', 'checked_in'])

  if (bookedSeats && bookedSeats.length > 0) {
    return res.status(409).json({
      error: `${bookedSeats.length} kursi memiliki pemesanan aktif. Atur ulang posisi kursi tersebut atau lepaskan sebelum mengubah denah.`,
      code: 'BOOKED_SEATS_EXIST',
      bookedSeats
    })
  }

  // Delete existing seats for this event (re-generate)
  const { error: deleteError } = await supabaseAdmin
    .from('venue_seats')
    .delete()
    .eq('event_id', eventId)

  if (deleteError) {
    logger.error('SEATS-GENERATE', 'Failed to clear existing seats', {
      requestId: req.requestId,
      eventId,
      error: deleteError.message
    })
    return res.status(500).json({ error: 'Gagal generate kursi' })
  }

  // Build a map of tier name -> tier id
  const { data: tiers } = await supabaseAdmin
    .from('ticket_tiers')
    .select('id, name')
    .eq('event_id', eventId)

  const tierMap = {}
  if (tiers) {
    tiers.forEach(t => { tierMap[t.name] = t.id })
  }

  // Build seat rows
  const seatRows = seats.map(s => {
    let resolvedTierId = null
    if (s.tier) {
      resolvedTierId = tierMap[s.tier] || tierMap[Object.keys(tierMap).find(k => k.toLowerCase().trim() === s.tier.toLowerCase().trim())] || null
    }
    return {
      event_id: eventId,
      seat_code: s.seatCode || `${String.fromCharCode(65 + s.y)}${s.x + 1}`,
      tier_id: resolvedTierId,
      x: s.x,
      y: s.y,
      status: 'available'
    }
  })

  // Insert in batches
  const batchSize = 100
  let insertedCount = 0
  for (let i = 0; i < seatRows.length; i += batchSize) {
    const batch = seatRows.slice(i, i + batchSize)
    const { error: insertError } = await supabaseAdmin
      .from('venue_seats')
      .insert(batch)

    if (insertError) {
      logger.error('SEATS-GENERATE', 'Failed to insert seat batch', {
        requestId: req.requestId,
        eventId,
        batchStart: i,
        error: insertError.message
      })
      return res.status(500).json({ error: 'Gagal generate kursi' })
    }
    insertedCount += batch.length
  }

  // Auto-sync ticket tier quotas to match seat count per tier
  const seatsByTier = {}
  seatRows.forEach(s => {
    const key = s.tier_id || '__none'
    if (!seatsByTier[key]) seatsByTier[key] = 0
    seatsByTier[key]++
  })

  for (const [tierId, count] of Object.entries(seatsByTier)) {
    if (tierId === '__none') continue
    await supabaseAdmin
      .from('ticket_tiers')
      .update({ quota: count })
      .eq('id', tierId)
  }

  // Save seat_map to event
  await supabaseAdmin
    .from('events')
    .update({
      seat_map: JSON.stringify({ gridX, gridY }),
      updated_at: new Date().toISOString()
    })
    .eq('id', eventId)

  logger.info('SEATS-GENERATE', 'Seats generated', {
    requestId: req.requestId,
    eventId,
    count: insertedCount
  })

  res.json({
    message: `${insertedCount} kursi berhasil dibuat`,
    count: insertedCount
  })
})

// Reassign booked seat positions (after a layout change)
router.put('/events/:eventId/seats/reassign', requireAuth, async (req, res) => {
  const { eventId } = req.params
  const { seats } = req.body

  if (!seats || !Array.isArray(seats) || seats.length === 0) {
    return res.status(400).json({ error: 'Data kursi wajib diisi' })
  }

  // Verify creator
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('creator_id')
    .eq('id', eventId)
    .single()

  if (!event || event.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Hanya kreator yang dapat mengatur ulang kursi' })
  }

  const errors = []
  for (const s of seats) {
    if (!s.id || s.x === undefined || s.y === undefined) {
      errors.push({ seatId: s.id, error: 'id, x, y wajib diisi' })
      continue
    }

    // Generate new seat code based on new position
    const seatCode = `${String.fromCharCode(65 + s.y)}${s.x + 1}`

    const { error: updateError } = await supabaseAdmin
      .from('venue_seats')
      .update({ x: s.x, y: s.y, seat_code: seatCode })
      .eq('id', s.id)
      .eq('event_id', eventId)

    if (updateError) {
      errors.push({ seatId: s.id, error: updateError.message })
    }
  }

  if (errors.length > 0) {
    return res.status(500).json({ error: 'Beberapa kursi gagal diperbarui', errors })
  }

  // Notify buyers whose seats were reassigned
  try {
    const seatIds = seats.map(s => s.id)
    const { data: updatedSeats } = await supabaseAdmin
      .from('venue_seats')
      .select('id, seat_code, reserved_by')
      .in('id', seatIds)
      .not('reserved_by', 'is', null)

    const trIds = [...new Set((updatedSeats || []).map(s => s.reserved_by).filter(Boolean))]
    if (trIds.length > 0) {
      const { data: ticketRequests } = await supabaseAdmin
        .from('ticket_requests')
        .select('id, user_id, tier_name')
        .in('id', trIds)

      const requestMap = Object.fromEntries((ticketRequests || []).map(tr => [tr.id, tr]))
      for (const s of (updatedSeats || [])) {
        const tr = requestMap[s.reserved_by]
        if (!tr) continue
        await createNotification(
          tr.user_id,
          'seat_reassigned',
          'Kursi Berubah',
          `Kursi Anda telah dipindahkan ke posisi baru: ${s.seat_code}`,
          eventId,
          'event'
        )
      }
    }
  } catch (notifErr) {
    logger.warn('SEATS-REASSIGN', 'Failed to send reassign notifications', { eventId, error: notifErr?.message || String(notifErr) })
  }

  logger.info('SEATS-REASSIGN', 'Booked seats reassigned', {
    requestId: req.requestId,
    eventId,
    count: seats.length
  })

  res.json({ message: `${seats.length} kursi berhasil diperbarui` })
})

export default router
