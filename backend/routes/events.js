import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'

const router = Router()

const VALID_CATEGORIES = ['Teknologi', 'Musik', 'Seni', 'Workshop', 'Olahraga', 'Bisnis', 'Lainnya']

const EVENT_SELECT = `
  *,
  ticket_tiers(id, name, price, quota, description, color, seat_tier)
`

router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select(EVENT_SELECT)
    .eq('creator_id', userId)
    .order('date', { ascending: false })

  if (error) {
    logger.error('EVENTS-LIST', 'Failed to fetch events', {
      requestId: req.requestId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil daftar acara' })
  }

  res.json({ events })
})

router.get('/published', async (req, res) => {
  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select(EVENT_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .order('date', { ascending: false })

  if (error) {
    logger.error('EVENTS-PUBLISHED', 'Failed to fetch published events', {
      requestId: req.requestId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil daftar acara' })
  }

  res.json({ events })
})

router.get('/admin', requireAuth, async (req, res) => {
  const userId = req.user.id

  const { data: roles, error: rolesError } = await supabaseAdmin
    .from('event_roles')
    .select('event_id')
    .eq('user_id', userId)
    .eq('status', 'accepted')

  if (rolesError) {
    logger.error('EVENTS-ADMIN', 'Failed to fetch admin roles', {
      requestId: req.requestId,
      error: rolesError.message
    })
    return res.status(500).json({ error: 'Gagal mengambil acara' })
  }

  if (!roles || roles.length === 0) {
    return res.json({ events: [] })
  }

  const eventIds = roles.map(r => r.event_id)

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select(EVENT_SELECT)
    .in('id', eventIds)
    .order('date', { ascending: false })

  if (error) {
    logger.error('EVENTS-ADMIN', 'Failed to fetch events', {
      requestId: req.requestId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil acara' })
  }

  res.json({ events })
})

router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', id)
    .single()

  if (error || !event) {
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  const isPublic = event.status === 'published' && event.visibility === 'public'

  if (isPublic) {
    return res.json({ event })
  }

  if (userId === event.creator_id) {
    return res.json({ event })
  }

  const { data: adminRole } = await supabaseAdmin
    .from('event_roles')
    .select('id, roles')
    .eq('event_id', id)
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()

  if (adminRole) {
    return res.json({ event, adminRole: adminRole.roles })
  }

  return res.status(403).json({ error: 'Acara tidak ditemukan' })
})

router.post('/', requireAuth, async (req, res) => {
  const { title, description, banner_url, date, location, location_lat, location_lng, location_detail, category, event_format, visibility, status, gallery_urls, ticket_tiers, invited_admins, seat_map } = req.body

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Nama acara wajib diisi' })
  }

  if (!date) {
    return res.status(400).json({ error: 'Tanggal acara wajib diisi' })
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Kategori tidak valid. Pilih: ${VALID_CATEGORIES.join(', ')}` })
  }

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .insert({
      creator_id: req.user.id,
      title: title.trim(),
      description: description || '',
      banner_url: banner_url || '',
      date,
      location: location || '',
      location_lat: location_lat != null ? location_lat : null,
      location_lng: location_lng != null ? location_lng : null,
      location_detail: location_detail || '',
      category: category || '',
      event_format: event_format || 'offline',
      visibility: visibility || 'public',
      status: status || 'draft',
      gallery_urls: gallery_urls || [],
      seat_map: seat_map || null
    })
    .select()
    .single()

  if (error) {
    logger.error('EVENTS-CREATE', 'Failed to create event', {
      requestId: req.requestId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal membuat acara' })
  }

  if (ticket_tiers && Array.isArray(ticket_tiers) && ticket_tiers.length > 0) {
    const tierRows = ticket_tiers.map(t => ({
      event_id: event.id,
      name: t.name || 'Regular',
      price: t.price || 0,
      quota: t.limit || t.quota || 0,
      description: t.description || '',
      color: t.color || '#6C63FF',
      seat_tier: t.seat_tier || false
    }))

    const { error: tierError } = await supabaseAdmin
      .from('ticket_tiers')
      .insert(tierRows)

    if (tierError) {
      logger.error('EVENTS-CREATE', 'Failed to create ticket tiers', {
        requestId: req.requestId,
        eventId: event.id,
        error: tierError.message
      })
    }
  }

  if (invited_admins && Array.isArray(invited_admins) && invited_admins.length > 0) {
    const roleRows = invited_admins.map(a => ({
      event_id: event.id,
      user_id: a.userId,
      roles: a.roles || [],
      status: 'pending',
      invited_by: req.user.id
    }))

    const { error: roleError } = await supabaseAdmin
      .from('event_roles')
      .insert(roleRows)

    if (roleError) {
      logger.error('EVENTS-CREATE', 'Failed to create event roles', {
        requestId: req.requestId,
        eventId: event.id,
        error: roleError.message
      })
    }
  }

  const { data: fullEvent } = await supabaseAdmin
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', event.id)
    .single()

  logger.info('EVENTS-CREATE', 'Event created', {
    requestId: req.requestId,
    eventId: event.id,
    title: event.title
  })

  res.status(201).json({ event: fullEvent })
})

router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { title, description, banner_url, date, location, location_lat, location_lng, location_detail, category, event_format, visibility, status, gallery_urls, ticket_tiers } = req.body

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('events')
    .select('creator_id')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  if (existing.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Hanya kreator yang dapat mengubah acara' })
  }

  const updates = {}
  if (title !== undefined) updates.title = title.trim()
  if (description !== undefined) updates.description = description
  if (banner_url !== undefined) updates.banner_url = banner_url
  if (date !== undefined) updates.date = date
  if (location !== undefined) updates.location = location
  if (location_lat !== undefined) updates.location_lat = location_lat
  if (location_lng !== undefined) updates.location_lng = location_lng
  if (location_detail !== undefined) updates.location_detail = location_detail
  if (category !== undefined) updates.category = category
  if (event_format !== undefined) updates.event_format = event_format
  if (visibility !== undefined) updates.visibility = visibility
  if (status !== undefined) updates.status = status
  if (gallery_urls !== undefined) updates.gallery_urls = gallery_urls
  if (req.body.seat_map !== undefined) updates.seat_map = req.body.seat_map
  updates.updated_at = new Date().toISOString()

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    logger.error('EVENTS-UPDATE', 'Failed to update event', {
      requestId: req.requestId,
      eventId: id,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal memperbarui acara' })
  }

  if (ticket_tiers !== undefined && Array.isArray(ticket_tiers)) {
    const { error: deleteError } = await supabaseAdmin
      .from('ticket_tiers')
      .delete()
      .eq('event_id', id)

    if (deleteError) {
      logger.error('EVENTS-UPDATE', 'Failed to delete old ticket tiers', {
        requestId: req.requestId,
        eventId: id,
        error: deleteError.message
      })
    }

    if (ticket_tiers.length > 0) {
      const tierRows = ticket_tiers.map(t => ({
        event_id: id,
        name: t.name || 'Regular',
        price: t.price || 0,
        quota: t.limit || t.quota || 0,
        description: t.description || '',
        color: t.color || '#6C63FF',
        seat_tier: t.seat_tier || false
      }))

      const { error: insertError } = await supabaseAdmin
        .from('ticket_tiers')
        .insert(tierRows)

      if (insertError) {
        logger.error('EVENTS-UPDATE', 'Failed to insert new ticket tiers', {
          requestId: req.requestId,
          eventId: id,
          error: insertError.message
        })
      }
    }
  }

  const { data: fullEvent } = await supabaseAdmin
    .from('events')
    .select(EVENT_SELECT)
    .eq('id', id)
    .single()

  logger.info('EVENTS-UPDATE', 'Event updated', {
    requestId: req.requestId,
    eventId: id
  })

  res.json({ event: fullEvent })
})

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('events')
    .select('creator_id, title')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  if (existing.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Hanya kreator yang dapat menghapus acara' })
  }

  const { count: activeTickets, error: countError } = await supabaseAdmin
    .from('ticket_requests')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .not('status', 'in', '("cancelled","completed")')

  if (!countError && activeTickets && activeTickets > 0) {
    logger.warn('EVENTS-DELETE', 'Cannot delete event with active tickets', {
      requestId: req.requestId,
      eventId: id,
      activeTickets
    })
    return res.status(409).json({
      error: `Tidak dapat menghapus acara karena ${activeTickets} tiket masih aktif. Batalkan acara sebagai gantinya.`
    })
  }

  const { error } = await supabaseAdmin
    .from('events')
    .delete()
    .eq('id', id)

  if (error) {
    logger.error('EVENTS-DELETE', 'Failed to delete event', {
      requestId: req.requestId,
      eventId: id,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal menghapus acara' })
  }

  logger.info('EVENTS-DELETE', 'Event deleted', {
    requestId: req.requestId,
    eventId: id
  })

  res.json({ message: 'Acara berhasil dihapus' })
})

export default router
