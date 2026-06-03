import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { verifyCaptcha } from '../middleware/captcha.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'
import { logAdminAction } from '../lib/audit.js'

const MAX_TITLE_LENGTH = 200
const MAX_DESC_LENGTH = 5000
const MAX_LOCATION_LENGTH = 200
const MAX_LOCATION_DETAIL_LENGTH = 500
const MAX_TIER_NAME_LENGTH = 100
const MAX_TIER_DESC_LENGTH = 500

const router = Router()

const VALID_CATEGORIES = ['Teknologi', 'Musik', 'Seni', 'Workshop', 'Olahraga', 'Bisnis', 'Lainnya']

const EVENT_SELECT = `
  *,
  ticket_tiers(id, name, price, quota, description, color, seat_tier, sold_count)
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

router.get('/creator-stats', requireAuth, async (req, res) => {
  const userId = req.user.id

  const { data: events, error } = await supabaseAdmin
    .from('events')
    .select(`*,
      ticket_tiers(id, name, price, quota, sold_count)
    `)
    .eq('creator_id', userId)
    .order('date', { ascending: false })

  if (error) {
    logger.error('CREATOR-STATS', 'Failed to fetch creator stats', {
      requestId: req.requestId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil data statistik' })
  }

  // Get accurate sold counts per event from actual ticket_requests rows
  const { data: soldCounts } = await supabaseAdmin
    .from('ticket_requests')
    .select('event_id, tier_name')
    .in('status', ['confirmed', 'completed', 'owned'])
    .in('event_id', (events || []).map(e => e.id))

  const soldCountMap = {}
  if (soldCounts) {
    for (const tr of soldCounts) {
      const key = tr.event_id
      soldCountMap[key] = (soldCountMap[key] || 0) + 1
    }
  }

  let totalSold = 0
  let totalRevenue = 0
  const activeEvents = (events || []).filter(e => e.status === 'published' || e.status === 'draft').map(e => {
    const tiers = e.ticket_tiers || []
    const sold = soldCountMap[e.id] || 0
    const rev = tiers.reduce((s, t) => s + (t.sold_count || 0) * (t.price || 0), 0)
    totalSold += sold
    totalRevenue += rev
    const quota = tiers.reduce((s, t) => s + (t.quota || 0), 0)
    const pct = quota > 0 ? Math.round((sold / quota) * 100) : 0
    return { ...e, ticketSold: sold, ticketQuota: quota, soldPct: pct, revenue: rev }
  })

  // Get today's scan count
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { count: todayScans } = await supabaseAdmin
    .from('ticket_requests')
    .select('id', { count: 'exact', head: true })
    .eq('is_checked_in', true)
    .gte('updated_at', todayStart.toISOString())
    .in('event_id', (events || []).map(e => e.id))

  // Recent activity
  const { data: recentActivity } = await supabaseAdmin
    .from('event_role_activity')
    .select('*, profiles!performed_by(name, avatar_url)')
    .in('event_role_id', (
      await supabaseAdmin.from('event_roles').select('id').eq('invited_by', userId)
    ).data?.map(r => r.id) || [])
    .order('created_at', { ascending: false })
    .limit(5)

  res.json({
    totalEvents: (events || []).length,
    totalSold,
    totalRevenue,
    todayScans: todayScans || 0,
    activeEvents,
    recentActivity: (recentActivity || []).map(a => ({
      id: a.id,
      action: a.action,
      performer: a.profiles?.name || 'Admin',
      performerAvatar: a.profiles?.avatar_url || null,
      createdAt: a.created_at
    }))
  })
})

router.get('/published', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 8))
  const offset = (page - 1) * limit
  const search = (req.query.search || '').trim()
  const category = (req.query.category || '').trim()

  let query = supabaseAdmin
    .from('events')
    .select(EVENT_SELECT, { count: 'exact' })
    .eq('status', 'published')
    .eq('visibility', 'public')

  if (category) {
    query = query.eq('category', category)
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,location.ilike.%${search}%`)
  }

  const { data: events, error, count } = await query
    .order('date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    logger.error('EVENTS-PUBLISHED', 'Failed to fetch published events', {
      requestId: req.requestId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil daftar acara' })
  }

  res.json({ events, total: count, page, limit })
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

// GET /api/events/audience — overall check-in stats across all events
router.get('/audience', requireAuth, async (req, res) => {
  try {
    const { data: distinctEvents, error: distinctError } = await supabaseAdmin
      .from('ticket_requests')
      .select('event_id')
      .eq('is_checked_in', true)
      .not('event_id', 'is', null)

    if (distinctError) {
      logger.error('AUDIENCE', 'Failed to fetch checked-in data', { requestId: req.requestId, error: distinctError.message })
      return res.status(500).json({ error: 'Gagal mengambil data penonton' })
    }

    const uniqueEventIds = new Set((distinctEvents || []).map(r => r.event_id))
    const checkedInCount = distinctEvents?.length || 0
    const eventCount = uniqueEventIds.size

    res.json({ checked_in_count: checkedInCount, event_count: eventCount })
  } catch (err) {
    logger.error('AUDIENCE', 'Unexpected error', { requestId: req.requestId, error: err.message })
    res.status(500).json({ error: 'Gagal mengambil data penonton' })
  }
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

  // Creator always gets full access regardless of visibility
  if (userId === event.creator_id) {
    return res.json({ event })
  }

  // Admin check — must happen before isPublic so admins get adminRole
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

  if (isPublic) {
    return res.json({ event })
  }

  const { data: ticket } = await supabaseAdmin
    .from('ticket_requests')
    .select('id')
    .eq('event_id', id)
    .eq('user_id', userId)
    .in('status', ['confirmed', 'completed'])
    .maybeSingle()

  if (ticket) {
    return res.json({ event, isTicketHolder: true })
  }

  return res.json({ event, isTicketHolder: false })
})

router.post('/', requireAuth, verifyCaptcha, async (req, res) => {
  const { title, description, banner_url, date, location, location_lat, location_lng, location_detail, category, event_format, visibility, status, gallery_urls, ticket_tiers, invited_admins, seat_map, event_start_time, event_end_time, timezone } = req.body

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Nama acara wajib diisi' })
  }
  if (title.trim().length > MAX_TITLE_LENGTH) {
    return res.status(400).json({ error: `Nama acara maksimal ${MAX_TITLE_LENGTH} karakter` })
  }
  if (description && description.length > MAX_DESC_LENGTH) {
    return res.status(400).json({ error: `Deskripsi maksimal ${MAX_DESC_LENGTH} karakter` })
  }

  if (!date) {
    return res.status(400).json({ error: 'Tanggal acara wajib diisi' })
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Kategori tidak valid. Pilih: ${VALID_CATEGORIES.join(', ')}` })
  }

  if (location && location.length > MAX_LOCATION_LENGTH) {
    return res.status(400).json({ error: `Lokasi maksimal ${MAX_LOCATION_LENGTH} karakter` })
  }
  if (location_detail && location_detail.length > MAX_LOCATION_DETAIL_LENGTH) {
    return res.status(400).json({ error: `Detail lokasi maksimal ${MAX_LOCATION_DETAIL_LENGTH} karakter` })
  }

  if (ticket_tiers && Array.isArray(ticket_tiers)) {
    for (const tier of ticket_tiers) {
      if (tier.name && tier.name.length > MAX_TIER_NAME_LENGTH) {
        return res.status(400).json({ error: `Nama tiket tier maksimal ${MAX_TIER_NAME_LENGTH} karakter` })
      }
      if (tier.description && tier.description.length > MAX_TIER_DESC_LENGTH) {
        return res.status(400).json({ error: `Deskripsi tiket tier maksimal ${MAX_TIER_DESC_LENGTH} karakter` })
      }
    }
  }

  const isPublishing = status === 'published'

  if (isPublishing) {
    if (!banner_url) {
      return res.status(400).json({ error: 'Cover acara wajib diisi sebelum mempublikasikan' })
    }
    if (!ticket_tiers || !Array.isArray(ticket_tiers) || ticket_tiers.length === 0) {
      return res.status(400).json({ error: 'Tambahkan minimal satu tipe tiket sebelum mempublikasikan acara' })
    }
    const eventStart = new Date(date)
    const minPublishTime = new Date(Date.now() + 60 * 60 * 1000)
    if (eventStart < minPublishTime) {
      return res.status(400).json({ error: 'Waktu mulai acara sudah lewat. Ubah tanggal atau waktu acara' })
    }
  }

  if (event_start_time && event_end_time && event_start_time === event_end_time) {
    return res.status(400).json({ error: 'Waktu mulai dan selesai tidak boleh sama' })
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
      seat_map: seat_map || null,
      event_start_time: event_start_time || null,
      event_end_time: event_end_time || null,
      timezone: timezone || 'Asia/Jakarta'
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
      quota: Math.max(1, t.limit || t.quota || 1),
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
  const { title, description, banner_url, date, location, location_lat, location_lng, location_detail, category, event_format, visibility, status, gallery_urls, ticket_tiers, event_start_time, event_end_time, timezone } = req.body

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
  if (req.body.claim_message_template_enabled !== undefined) updates.claim_message_template_enabled = req.body.claim_message_template_enabled
  if (req.body.claim_message_template !== undefined) updates.claim_message_template = req.body.claim_message_template
  if (req.body.auto_release_claims_enabled !== undefined) updates.auto_release_claims_enabled = req.body.auto_release_claims_enabled
  if (req.body.auto_release_claims_timeout !== undefined) updates.auto_release_claims_timeout = Number(req.body.auto_release_claims_timeout)
  if (req.body.auto_close_ticket_enabled !== undefined) updates.auto_close_ticket_enabled = req.body.auto_close_ticket_enabled
  if (req.body.auto_close_ticket_timeout !== undefined) updates.auto_close_ticket_timeout = Number(req.body.auto_close_ticket_timeout)
  if (req.body.payment_deadline_minutes !== undefined) updates.payment_deadline_minutes = Number(req.body.payment_deadline_minutes)
  if (event_start_time !== undefined) updates.event_start_time = event_start_time
  if (event_end_time !== undefined) updates.event_end_time = event_end_time
  if (timezone !== undefined) updates.timezone = timezone
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

  // Log system edit in audit log
  await logAdminAction({
    eventId: id,
    actorId: req.user.id,
    action: 'update_event_settings',
    metadata: { updates }
  })

  if (ticket_tiers !== undefined && Array.isArray(ticket_tiers)) {
    // Fetch existing tiers by name to preserve UUIDs (avoids ON DELETE SET NULL on venue_seats.tier_id)
    const { data: existingTiers } = await supabaseAdmin
      .from('ticket_tiers')
      .select('id, name, sold_count')
      .eq('event_id', id)

    const existingByName = {}
    if (existingTiers) {
      for (const t of existingTiers) {
        existingByName[t.name] = t
      }
    }

    const processedNames = new Set()

    for (const t of ticket_tiers) {
      const name = t.name || 'Regular'
      processedNames.add(name)

      if (existingByName[name]) {
        // UPDATE preserves UUID — seat tier_id references stay intact
        const existing = existingByName[name]
        const { error: updateError } = await supabaseAdmin
          .from('ticket_tiers')
          .update({
            price: t.price || 0,
            quota: Math.max(1, t.limit || t.quota || 1),
            description: t.description || '',
            color: t.color || '#6C63FF',
            seat_tier: t.seat_tier || false,
            sold_count: existing.sold_count || 0
          })
          .eq('id', existing.id)

        if (updateError) {
          logger.error('EVENTS-UPDATE', 'Failed to update ticket tier', {
            requestId: req.requestId,
            eventId: id,
            tierName: name,
            error: updateError.message
          })
        }
      } else {
        // INSERT for new tiers
        const { error: insertError } = await supabaseAdmin
          .from('ticket_tiers')
          .insert({
            event_id: id,
            name,
            price: t.price || 0,
            quota: Math.max(1, t.limit || t.quota || 1),
            description: t.description || '',
            color: t.color || '#6C63FF',
            seat_tier: t.seat_tier || false
          })

        if (insertError) {
          logger.error('EVENTS-UPDATE', 'Failed to insert new ticket tier', {
            requestId: req.requestId,
            eventId: id,
            tierName: name,
            error: insertError.message
          })
        }
      }
    }

    // Remove tiers that were deleted by the creator (cascade will nullify venue_seats references — expected)
    for (const [name, existing] of Object.entries(existingByName)) {
      if (!processedNames.has(name)) {
        await supabaseAdmin
          .from('ticket_tiers')
          .delete()
          .eq('id', existing.id)
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

router.get('/:id/scan-secret', requireAuth, async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  const { data: event, error } = await supabaseAdmin
    .from('events')
    .select('creator_id, scan_secret')
    .eq('id', id)
    .single()

  if (error || !event) {
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  if (event.creator_id !== userId) {
    const { data: adminRole } = await supabaseAdmin
      .from('event_roles')
      .select('id')
      .eq('event_id', id)
      .eq('user_id', userId)
      .eq('status', 'accepted')
      .maybeSingle()

    if (!adminRole) {
      return res.status(403).json({ error: 'Akses ditolak' })
    }
  }

  res.json({ scan_secret: event.scan_secret })
})

// GET /api/events/:id/hype — social proof data
router.get('/:id/hype', async (req, res) => {
  const { id } = req.params

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('id, ticket_tiers(id, sold_count, quota)')
    .eq('id', id)
    .maybeSingle()

  if (eventError || !event) {
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  const totalSold = event.ticket_tiers?.reduce((s, t) => s + (t.sold_count || 0), 0) || 0
  const totalQuota = event.ticket_tiers?.reduce((s, t) => s + (t.quota || 0), 0) || 0

  // Recent sales (last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentSales } = await supabaseAdmin
    .from('ticket_requests')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .in('status', ['confirmed', 'completed'])
    .gte('updated_at', oneHourAgo)

  // Pending interest (people who requested but haven't paid yet)
  const { count: watchingCount } = await supabaseAdmin
    .from('ticket_requests')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .eq('status', 'pending')

  res.json({
    total_sold: totalSold,
    total_quota: totalQuota,
    recent_sales_1h: recentSales || 0,
    watching_count: watchingCount || 0,
    active_viewers: Math.max(3, Math.floor((totalSold * 1.5) + Math.random() * 10))
  })
})

// GET /api/events/:id/admin-audit-log — retrieve admin audit log for creator only
router.get('/:id/admin-audit-log', requireAuth, async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('creator_id')
    .eq('id', id)
    .single()

  if (eventError || !event) {
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  if (event.creator_id !== userId) {
    return res.status(403).json({ error: 'Akses ditolak. Hanya kreator acara yang dapat mengakses log audit.' })
  }

  const { data: logs, error: logsError } = await supabaseAdmin
    .from('admin_audit_log')
    .select('*')
    .eq('event_id', id)
    .order('created_at', { ascending: false })

  if (logsError) {
    logger.error('ADMIN-AUDIT-LOG', 'Failed to fetch logs', { error: logsError.message, eventId: id })
    return res.status(500).json({ error: 'Gagal mengambil log audit' })
  }

  const actorIds = [...new Set(logs.map(l => l.actor_id).filter(Boolean))]
  const actorProfiles = {}

  await Promise.all(actorIds.map(async (uid) => {
    try {
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(uid)
      if (user?.user) {
        actorProfiles[uid] = {
          name: user.user.user_metadata?.name || user.user.email?.split('@')[0] || 'Unknown',
          email: user.user.email || ''
        }
      }
    } catch {
      actorProfiles[uid] = { name: 'Unknown', email: '' }
    }
  }))

  const enriched = logs.map(l => ({
    ...l,
    actor_profile: l.actor_id ? (actorProfiles[l.actor_id] || { name: 'Unknown', email: '' }) : null
  }))

  res.json({ logs: enriched })
})

export default router
