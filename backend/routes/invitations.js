import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'
import { createNotification } from './notifications.js'

const router = Router()

const VALID_ROLES = ['attendance', 'support', 'secretary']

function logActivity(roleId, action, performedBy, metadata = {}) {
  return supabaseAdmin
    .from('event_role_activity')
    .insert({
      event_role_id: roleId,
      action,
      performed_by: performedBy,
      metadata
    })
}

router.post('/search', requireAuth, async (req, res) => {
  const { query } = req.body

  if (!query || query.trim().length < 2) {
    logger.warn('INVITATION-SEARCH', 'Search query too short', {
      requestId: req.requestId,
      userId: req.user.id
    })
    return res.status(400).json({ error: 'Minimal 2 karakter untuk pencarian' })
  }

  const searchTerm = query.trim().toLowerCase()

  try {
    const { data: profiles, error } = await supabaseAdmin
      .from('profiles')
      .select('id, name, avatar_url')
      .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
      .neq('id', req.user.id)
      .limit(20)

    if (error) {
      logger.error('INVITATION-SEARCH', 'Failed to search profiles', {
        requestId: req.requestId,
        error: error.message
      })
      return res.status(500).json({ error: 'Pencarian gagal' })
    }

    logger.info('INVITATION-SEARCH', 'User search completed', {
      requestId: req.requestId,
      userId: req.user.id,
      query: searchTerm,
      results: profiles.length
    })

    // Return only non-sensitive profile fields to reduce enumeration risk
    res.json({ users: profiles })
  } catch (err) {
    logger.error('INVITATION-SEARCH', 'Search failed', {
      requestId: req.requestId,
      error: err.message
    })
    res.status(500).json({ error: 'Pencarian gagal' })
  }
})

router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id

  const { data, error } = await supabaseAdmin
    .from('event_roles')
    .select(`
      *,
      events:event_id (title, date, status, banner_url, creator_id)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('INVITATION-LIST', 'Failed to fetch invitations', {
      requestId: req.requestId,
      userId: req.user.id,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil undangan' })
  }

  const invitedByIds = [...new Set(data.map(r => r.invited_by).filter(Boolean))]
  const invitedByMap = {}

  await Promise.all(invitedByIds.map(async (uid) => {
    try {
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(uid)
      if (user?.user) {
        invitedByMap[uid] = { id: user.user.id, name: user.user.user_metadata?.name || '', avatar_url: user.user.user_metadata?.avatar_url || '' }
      }
    } catch {
      invitedByMap[uid] = { id: uid, email: '' }
    }
  }))

  const invitations = data.map(r => ({
    ...r,
    invited_by_user: r.invited_by ? (invitedByMap[r.invited_by] || null) : null
  }))

  res.json({ invitations })
})

router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { status } = req.body

  if (!status || !['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status harus "accepted" atau "rejected"' })
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('event_roles')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    logger.warn('INVITATION-UPDATE', 'Invitation not found', {
      requestId: req.requestId,
      invitationId: id,
      userId: req.user.id
    })
    return res.status(404).json({ error: 'Undangan tidak ditemukan' })
  }

  if (existing.user_id !== req.user.id) {
    logger.warn('INVITATION-UPDATE', 'User does not own this invitation', {
      requestId: req.requestId,
      invitationId: id,
      userId: req.user.id,
      ownerId: existing.user_id
    })
    return res.status(403).json({ error: 'Bukan undangan milik Anda' })
  }

  if (existing.status !== 'pending') {
    return res.status(400).json({ error: 'Undangan sudah diproses sebelumnya' })
  }

  const updateData = {
    status,
    ...(status === 'accepted' ? { accepted_at: new Date().toISOString() } : {})
  }

  const { error: updateError } = await supabaseAdmin
    .from('event_roles')
    .update(updateData)
    .eq('id', id)

  if (updateError) {
    logger.error('INVITATION-UPDATE', 'Failed to update invitation', {
      requestId: req.requestId,
      invitationId: id,
      error: updateError.message
    })
    return res.status(500).json({ error: 'Gagal memperbarui undangan' })
  }

  await logActivity(id, status, req.user.id, {
    previous_status: existing.status,
    roles: existing.roles
  })

  logger.info('INVITATION-UPDATE', `Invitation ${status}`, {
    requestId: req.requestId,
    invitationId: id,
    userId: req.user.id,
    status
  })

  res.json({ message: status === 'accepted' ? 'Undangan diterima' : 'Undangan ditolak' })
})

router.post('/', requireAuth, async (req, res) => {
  const { event_id, user_id, roles } = req.body

  if (!event_id || !user_id) {
    return res.status(400).json({ error: 'event_id dan user_id wajib diisi' })
  }

  if (!roles || !Array.isArray(roles) || roles.length === 0) {
    return res.status(400).json({ error: 'Minimal satu role harus dipilih' })
  }

  const invalidRoles = roles.filter(r => !VALID_ROLES.includes(r))
  if (invalidRoles.length > 0) {
    return res.status(400).json({
      error: `Role tidak valid: ${invalidRoles.join(', ')}. Valid: ${VALID_ROLES.join(', ')}`
    })
  }

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('creator_id, title')
    .eq('id', event_id)
    .single()

  if (eventError || !event) {
    logger.warn('INVITATION-CREATE', 'Event not found', {
      requestId: req.requestId,
      eventId: event_id
    })
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  if (event.creator_id !== req.user.id) {
    logger.warn('INVITATION-CREATE', 'User is not the event creator', {
      requestId: req.requestId,
      userId: req.user.id,
      eventId: event_id,
      creatorId: event.creator_id
    })
    return res.status(403).json({ error: 'Hanya kreator acara yang dapat mengundang admin' })
  }

  if (event.creator_id === user_id) {
    logger.warn('INVITATION-CREATE', 'Creator tried to invite themselves', {
      requestId: req.requestId,
      userId: req.user.id,
      eventId: event_id
    })
    return res.status(400).json({ error: 'Kreator tidak bisa mengundang diri sendiri' })
  }

  const { data: existing } = await supabaseAdmin
    .from('event_roles')
    .select('id, status')
    .eq('event_id', event_id)
    .eq('user_id', user_id)
    .maybeSingle()

  if (existing) {
    logger.warn('INVITATION-CREATE', 'User already has a role for this event', {
      requestId: req.requestId,
      eventId: event_id,
      userId: user_id,
      existingStatus: existing.status
    })
    return res.status(409).json({
      error: 'Pengguna sudah memiliki undangan atau peran di acara ini',
      existing_status: existing.status
    })
  }

  const { data: invitation, error: insertError } = await supabaseAdmin
    .from('event_roles')
    .insert({
      event_id,
      user_id,
      roles,
      invited_by: req.user.id,
      status: 'pending'
    })
    .select()
    .single()

  if (insertError) {
    logger.error('INVITATION-CREATE', 'Failed to create invitation', {
      requestId: req.requestId,
      error: insertError.message
    })
    return res.status(500).json({ error: 'Gagal membuat undangan' })
  }

  await logActivity(invitation.id, 'invited', req.user.id, {
    event_title: event.title,
    roles
  })

  await createNotification(
    user_id,
    'invite',
    'Undangan Admin Baru',
    `Anda diundang sebagai admin di ${event.title}`,
    event_id,
    'event'
  )

  logger.info('INVITATION-CREATE', 'Invitation created', {
    requestId: req.requestId,
    invitationId: invitation.id,
    eventId: event_id,
    userId: user_id,
    roles
  })

  res.status(201).json({ invitation })
})

router.get('/event/:eventId', requireAuth, async (req, res) => {
  const { eventId } = req.params

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('creator_id')
    .eq('id', eventId)
    .single()

  if (eventError || !event) {
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  if (event.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Hanya kreator acara yang dapat melihat tim' })
  }

  const { data: roles, error: rolesError } = await supabaseAdmin
    .from('event_roles')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (rolesError) {
    logger.error('INVITATION-EVENT', 'Failed to fetch event roles', {
      requestId: req.requestId,
      eventId,
      error: rolesError.message
    })
    return res.status(500).json({ error: 'Gagal mengambil data tim' })
  }

  const roleIds = roles.map(r => r.id)
  let activity = []
  if (roleIds.length > 0) {
    const { data: activityData } = await supabaseAdmin
      .from('event_role_activity')
      .select('*')
      .in('event_role_id', roleIds)
      .order('created_at', { ascending: false })

    activity = activityData || []
  }

  const allUserIds = new Set()
  roles.forEach(r => { allUserIds.add(r.user_id); if (r.invited_by) allUserIds.add(r.invited_by) })
  activity.forEach(a => { if (a.performed_by) allUserIds.add(a.performed_by) })

  const userMap = {}
  await Promise.all([...allUserIds].map(async (uid) => {
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(uid)
    if (user?.user) {
      userMap[uid] = {
        id: user.user.id,
        name: user.user.user_metadata?.name || '',
        avatar_url: user.user.user_metadata?.avatar_url || ''
      }
    }
  }))

  const enrichedRoles = roles.map(r => ({
    ...r,
    user: r.user_id ? (userMap[r.user_id] || null) : null,
    invited_by_user: r.invited_by ? (userMap[r.invited_by] || null) : null
  }))

  const enrichedActivity = activity.map(a => ({
    ...a,
    performed_by_user: a.performed_by ? (userMap[a.performed_by] || null) : null
  }))

  logger.info('INVITATION-EVENT', 'Event roles fetched', {
    requestId: req.requestId,
    eventId,
    rolesCount: roles.length
  })

  res.json({ roles: enrichedRoles, activity: enrichedActivity })
})

router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  const { data, error } = await supabaseAdmin
    .from('event_roles')
    .select(`
      *,
      events:event_id (title, date, status, banner_url, creator_id)
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    return res.status(404).json({ error: 'Undangan tidak ditemukan' })
  }

  if (data.user_id !== userId) {
    return res.status(403).json({ error: 'Bukan undangan milik Anda' })
  }

  const invitedByIds = data.invited_by ? [data.invited_by] : []
  const invitedByMap = {}
  await Promise.all(invitedByIds.map(async (uid) => {
    try {
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(uid)
      if (user?.user) {
        invitedByMap[uid] = { id: user.user.id, email: user.user.email || '' }
      }
    } catch {
      invitedByMap[uid] = { id: uid, email: '' }
    }
  }))

  const invitation = {
    ...data,
    invited_by_user: data.invited_by ? (invitedByMap[data.invited_by] || null) : null
  }

  res.json({ invitation })
})

router.put('/:id/roles', requireAuth, async (req, res) => {
  const { id } = req.params
  const { roles } = req.body

  if (!roles || !Array.isArray(roles) || roles.length === 0) {
    return res.status(400).json({ error: 'Minimal satu role harus dipilih' })
  }

  const invalidRoles = roles.filter(r => !VALID_ROLES.includes(r))
  if (invalidRoles.length > 0) {
    return res.status(400).json({
      error: `Role tidak valid: ${invalidRoles.join(', ')}. Valid: ${VALID_ROLES.join(', ')}`
    })
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('event_roles')
    .select(`
      *,
      events!inner(creator_id)
    `)
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Role tidak ditemukan' })
  }

  if (existing.events.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Hanya kreator yang dapat mengubah role' })
  }

  if (existing.user_id === req.user.id) {
    return res.status(400).json({ error: 'Kreator tidak bisa mengubah role diri sendiri' })
  }

  const previousRoles = existing.roles

  const { error: updateError } = await supabaseAdmin
    .from('event_roles')
    .update({ roles })
    .eq('id', id)

  if (updateError) {
    logger.error('INVITATION-ROLES', 'Failed to update roles', {
      requestId: req.requestId,
      invitationId: id,
      error: updateError.message
    })
    return res.status(500).json({ error: 'Gagal memperbarui role' })
  }

  await logActivity(id, 'roles_updated', req.user.id, {
    previous: previousRoles,
    updated: roles
  })

  logger.info('INVITATION-ROLES', 'Roles updated', {
    requestId: req.requestId,
    invitationId: id,
    from: previousRoles,
    to: roles
  })

  res.json({ message: 'Role berhasil diperbarui', roles })
})

router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('event_roles')
    .select(`
      *,
      events!inner(creator_id, title)
    `)
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return res.status(404).json({ error: 'Role tidak ditemukan' })
  }

  if (existing.events.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Hanya kreator yang dapat menghapus admin' })
  }

  await logActivity(id, 'removed', req.user.id, {
    event_title: existing.events.title,
    roles: existing.roles,
    removed_user: existing.user_id
  })

  const { error: deleteError } = await supabaseAdmin
    .from('event_roles')
    .delete()
    .eq('id', id)

  if (deleteError) {
    logger.error('INVITATION-DELETE', 'Failed to remove admin', {
      requestId: req.requestId,
      invitationId: id,
      error: deleteError.message
    })
    return res.status(500).json({ error: 'Gagal menghapus admin' })
  }

  logger.info('INVITATION-DELETE', 'Admin removed', {
    requestId: req.requestId,
    invitationId: id,
    userId: existing.user_id
  })

  res.json({ message: 'Admin berhasil dihapus' })
})

export default router
