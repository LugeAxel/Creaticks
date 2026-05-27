import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'

const router = Router()

export async function createNotification(userId, type, title, body = null, referenceId = null, referenceType = null) {
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        body,
        reference_id: referenceId,
        reference_type: referenceType
      })

    if (error) {
      logger.error('NOTIFICATION-CREATE', 'Failed to create notification', {
        userId,
        type,
        error: error.message
      })
      return { error: error.message }
    }

    return { error: null }
  } catch (err) {
    logger.error('NOTIFICATION-CREATE', 'Exception creating notification', {
      userId,
      type,
      error: err.message
    })
    return { error: err.message }
  }
}

router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id

  try {
    const { data: notificationRows, error: notifError } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (notifError) {
      logger.error('NOTIFICATION-LIST', 'Failed to fetch notifications', {
        requestId: req.requestId,
        userId,
        error: notifError.message
      })
      return res.status(500).json({ error: 'Gagal mengambil notifikasi' })
    }

    const { data: pendingInvites, error: inviteError } = await supabaseAdmin
      .from('event_roles')
      .select(`
        id,
        event_id,
        user_id,
        roles,
        status,
        invited_by,
        created_at,
        events:event_id (title)
      `)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (inviteError) {
      logger.error('NOTIFICATION-LIST', 'Failed to fetch pending invites', {
        requestId: req.requestId,
        userId,
        error: inviteError.message
      })
      return res.status(500).json({ error: 'Gagal mengambil undangan' })
    }

    const inviteNotifications = (pendingInvites || []).map(inv => ({
      id: `invite_${inv.id}`,
      user_id: inv.user_id,
      type: 'invite',
      title: 'Undangan Admin Baru',
      body: `Anda diundang sebagai admin di ${inv.events?.title || 'Acara'}`,
      reference_id: inv.event_id,
      reference_type: 'event',
      is_read: false,
      created_at: inv.created_at
    }))

    const items = [...inviteNotifications, ...(notificationRows || [])]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const unreadCount = items.filter(n => !n.is_read).length

    res.json({ notifications: items, unread_count: unreadCount })
  } catch (err) {
    logger.error('NOTIFICATION-LIST', 'Exception fetching notifications', {
      requestId: req.requestId,
      userId,
      error: err.message
    })
    res.status(500).json({ error: 'Gagal mengambil notifikasi' })
  }
})

router.put('/:id/read', requireAuth, async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  if (id.startsWith('invite_')) {
    return res.json({ message: 'Undangan ditandai dibaca' })
  }

  try {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('id, user_id')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Notifikasi tidak ditemukan' })
    }

    if (existing.user_id !== userId) {
      return res.status(403).json({ error: 'Bukan notifikasi milik Anda' })
    }

    const { error: updateError } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)

    if (updateError) {
      logger.error('NOTIFICATION-READ', 'Failed to mark as read', {
        requestId: req.requestId,
        notificationId: id,
        error: updateError.message
      })
      return res.status(500).json({ error: 'Gagal memperbarui notifikasi' })
    }

    res.json({ message: 'Notifikasi ditandai dibaca' })
  } catch (err) {
    logger.error('NOTIFICATION-READ', 'Exception marking notification as read', {
      requestId: req.requestId,
      notificationId: id,
      error: err.message
    })
    res.status(500).json({ error: 'Gagal memperbarui notifikasi' })
  }
})

export default router
