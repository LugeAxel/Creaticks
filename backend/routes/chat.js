import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { verifyAdminScope } from '../middleware/adminScope.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'

const router = Router()

async function canAccessThread(threadId, userId) {
  const { data: thread, error } = await supabaseAdmin
    .from('chat_threads')
    .select('*, events!inner(creator_id)')
    .eq('id', threadId)
    .single()

  if (error || !thread) return null

  if (thread.buyer_id === userId) return thread
  if (thread.events.creator_id === userId) return thread

  const adminRole = await verifyAdminScope(thread.event_id, userId)
  if (adminRole) return thread

  return null
}

router.get('/event/:eventId', requireAuth, async (req, res) => {
  const { eventId } = req.params

  const adminRole = await verifyAdminScope(eventId, req.user.id)
  if (!adminRole) {
    const { data: event } = await supabaseAdmin
      .from('events')
      .select('creator_id')
      .eq('id', eventId)
      .single()

    if (!event || event.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Akses ditolak' })
    }
  }

  const { data: threads, error } = await supabaseAdmin
    .from('chat_threads')
    .select(`
      *,
      ticket_request:ticket_request_id (tier_name, status)
    `)
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })

  if (error) {
    logger.error('CHAT-LIST', 'Failed to fetch threads', {
      requestId: req.requestId,
      eventId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil chat' })
  }

  const buyerIds = [...new Set((threads || []).map((t) => t.buyer_id).filter(Boolean))]
  const buyerProfiles = {}

  await Promise.all(buyerIds.map(async (buyerId) => {
    try {
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(buyerId)
      if (user?.user) {
        buyerProfiles[buyerId] = {
          name: user.user.user_metadata?.name || user.user.email?.split('@')[0] || 'Unknown',
          email: user.user.email || ''
        }
      }
    } catch {
      buyerProfiles[buyerId] = { name: 'Unknown', email: '' }
    }
  }))

  const enriched = await Promise.all((threads || []).map(async (t) => {
    const { data: lastMsg } = await supabaseAdmin
      .from('chat_messages')
      .select('content, created_at, sender_id')
      .eq('thread_id', t.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { count } = await supabaseAdmin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', t.id)
      .neq('sender_id', req.user.id)

    const buyerProfile = buyerProfiles[t.buyer_id] || { name: 'Unknown', email: '' }

    return {
      ...t,
      last_message: lastMsg || null,
      unread_count: count || 0,
      buyer_name: buyerProfile.name,
      ticket_tier: t.ticket_request?.tier_name || 'Regular',
      ticket_status: t.ticket_request?.status || 'pending'
    }
  }))

  res.json({ threads: enriched })
})

router.get('/me', requireAuth, async (req, res) => {
  const { eventId } = req.query

  let query = supabaseAdmin
    .from('chat_threads')
    .select(`
      *,
      ticket_request:ticket_request_id (tier_name, status),
      events!inner(title, date, banner_url)
    `)
    .eq('buyer_id', req.user.id)
    .order('updated_at', { ascending: false })

  if (eventId) {
    query = query.eq('event_id', eventId)
  }

  const { data: threads, error } = await query

  if (error) {
    logger.error('CHAT-ME', 'Failed to fetch buyer threads', {
      requestId: req.requestId,
      userId: req.user.id,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil chat' })
  }

  const enriched = await Promise.all((threads || []).map(async (t) => {
    const { data: lastMsg } = await supabaseAdmin
      .from('chat_messages')
      .select('content, created_at, sender_id')
      .eq('thread_id', t.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { count } = await supabaseAdmin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', t.id)
      .neq('sender_id', req.user.id)

    return {
      ...t,
      event_name: t.events?.title || 'Acara',
      ticket_tier: t.ticket_request?.tier_name || 'Regular',
      ticket_status: t.ticket_request?.status || 'pending',
      last_message: lastMsg || null,
      unread_count: count || 0
    }
  }))

  res.json({ threads: enriched })
})

router.get('/thread/:threadId', requireAuth, async (req, res) => {
  const { threadId } = req.params

  const thread = await canAccessThread(threadId, req.user.id)
  if (!thread) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  const { data: messages, error } = await supabaseAdmin
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (error) {
    logger.error('CHAT-MESSAGES', 'Failed to fetch messages', {
      requestId: req.requestId,
      threadId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil pesan' })
  }

  const { data: user } = await supabaseAdmin.auth.admin.getUserById(req.user.id)
  const currentUserName = user?.user?.user_metadata?.name || user?.user?.email || 'Unknown'

  res.json({
    thread,
    messages,
    current_user: { id: req.user.id, name: currentUserName }
  })
})

router.post('/thread/:threadId/messages', requireAuth, async (req, res) => {
  const { threadId } = req.params
  const { content, message_type, image_url } = req.body

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Pesan tidak boleh kosong' })
  }

  const thread = await canAccessThread(threadId, req.user.id)
  if (!thread) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  if (!thread.is_active) {
    return res.status(400).json({ error: 'Thread ini sudah ditutup' })
  }

  const { data: message, error } = await supabaseAdmin
    .from('chat_messages')
    .insert({
      thread_id: threadId,
      sender_id: req.user.id,
      content: content.trim(),
      message_type: message_type || 'text',
      image_url: image_url || null
    })
    .select()
    .single()

  if (error) {
    logger.error('CHAT-SEND', 'Failed to send message', {
      requestId: req.requestId,
      threadId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengirim pesan' })
  }

  await supabaseAdmin
    .from('chat_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', threadId)

  res.status(201).json({ message })
})

router.post('/event/:eventId/thread', requireAuth, async (req, res) => {
  const { eventId } = req.params
  const { ticket_request_id, buyer_id } = req.body

  if (!ticket_request_id || !buyer_id) {
    return res.status(400).json({ error: 'ticket_request_id dan buyer_id wajib diisi' })
  }

  const { data: existing } = await supabaseAdmin
    .from('chat_threads')
    .select('id')
    .eq('ticket_request_id', ticket_request_id)
    .maybeSingle()

  if (existing) {
    return res.json({ thread: existing })
  }

  const { data: thread, error } = await supabaseAdmin
    .from('chat_threads')
    .insert({
      ticket_request_id,
      event_id: eventId,
      buyer_id
    })
    .select()
    .single()

  if (error) {
    logger.error('CHAT-THREAD', 'Failed to create thread', {
      requestId: req.requestId,
      ticketRequestId: ticket_request_id,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal membuat thread chat' })
  }

  res.status(201).json({ thread })
})

export default router
