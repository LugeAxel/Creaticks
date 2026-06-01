import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { verifyAdminScope } from '../middleware/adminScope.js'
import { idempotencyMiddleware } from '../utils/idempotency.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'
import { logAdminAction } from '../lib/audit.js'

const MAX_CONTENT_LENGTH = 5000

const router = Router()

async function canAccessThread(threadId, userId) {
  const { data: thread, error } = await supabaseAdmin
    .from('chat_threads')
    .select('*, events!inner(creator_id), ticket_request:ticket_request_id!inner(claimed_by)')
    .eq('id', threadId)
    .single()

  if (error || !thread) return null

  // Buyer of the thread can access
  if (thread.buyer_id === userId) return thread
  // Event creator can access
  if (thread.events.creator_id === userId) return thread
  // Admin who claimed this specific ticket can access
  if (thread.ticket_request.claimed_by === userId) return thread

  return null
}

async function enrichUnreadCount(threads, userId) {
  if (!threads.length) return threads

  const threadIds = threads.map(t => t.id)

  const { data: enrichments } = await supabaseAdmin
    .rpc('get_chat_enrichments', { p_thread_ids: threadIds, p_user_id: userId })

  const enrichMap = {}
  if (enrichments) {
    for (const row of enrichments) {
      enrichMap[row.thread_id] = {
        last_message: row.last_message?.content ? row.last_message : null,
        unread_count: Number(row.unread_count)
      }
    }
  }

  // Also batch fetch read receipts for the calling endpoint to use directly
  const { data: receiptData } = await supabaseAdmin
    .from('chat_read_receipts')
    .select('thread_id, last_read_at')
    .in('thread_id', threadIds)
    .eq('user_id', userId)

  const receiptMap = {}
  if (receiptData) {
    for (const r of receiptData) {
      receiptMap[r.thread_id] = r.last_read_at
    }
  }

  return threads.map(t => ({
    ...t,
    last_message: enrichMap[t.id]?.last_message || null,
    unread_count: enrichMap[t.id]?.unread_count || 0,
    last_read_at: receiptMap[t.id] || null
  }))
}

router.get('/event/:eventId', requireAuth, async (req, res) => {
  const { eventId } = req.params

  // Check if user is creator or has admin scope
  const { data: event } = await supabaseAdmin
    .from('events')
    .select('creator_id')
    .eq('id', eventId)
    .single()

  const isCreator = event && event.creator_id === req.user.id

  if (!isCreator) {
    const adminRole = await verifyAdminScope(eventId, req.user.id)
    if (!adminRole) {
      return res.status(403).json({ error: 'Akses ditolak' })
    }
  }

  let query = supabaseAdmin
    .from('chat_threads')
    .select(`
      *,
      ticket_request:ticket_request_id (tier_name, status)
    `)
    .eq('event_id', eventId)

  // Non-creator admins only see threads they claimed
  if (!isCreator) {
    const { data: claimedTickets } = await supabaseAdmin
      .from('ticket_requests')
      .select('id')
      .eq('event_id', eventId)
      .eq('claimed_by', req.user.id)

    const claimedIds = (claimedTickets || []).map(t => t.id)
    query = query.in('ticket_request_id', claimedIds.length > 0 ? claimedIds : ['_none_'])
  }

  query = query.order('updated_at', { ascending: false })

  const { data: threads, error } = await query

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

  const enriched = await enrichUnreadCount(threads || [], req.user.id)

  return res.json({
    threads: enriched.map((t) => {
      const buyerProfile = buyerProfiles[t.buyer_id] || { name: 'Unknown', email: '' }
      return {
        ...t,
        buyer_name: buyerProfile.name,
        ticket_tier: t.ticket_request?.tier_name || 'Regular',
        ticket_status: t.ticket_request?.status || 'pending'
      }
    })
  })
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

  const enriched = await enrichUnreadCount(threads || [], req.user.id)

  res.json({
    threads: enriched.map((t) => ({
      ...t,
      event_name: t.events?.title || 'Acara',
      ticket_tier: t.ticket_request?.tier_name || 'Regular',
      ticket_status: t.ticket_request?.status || 'pending'
    }))
  })
})

router.get('/thread/:threadId', requireAuth, async (req, res) => {
  const { threadId } = req.params
  const limit = Math.min(parseInt(req.query.limit) || 50, 100)
  const before = req.query.before

  const thread = await canAccessThread(threadId, req.user.id)
  if (!thread) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  let query = supabaseAdmin
    .from('chat_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data: messages, error } = await query

  if (error) {
    logger.error('CHAT-MESSAGES', 'Failed to fetch messages', {
      requestId: req.requestId,
      threadId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil pesan' })
  }

  const hasMore = messages && messages.length >= limit
  const currentUserName = req.user.user_metadata?.name || req.user.email || 'Unknown'

  res.json({
    thread,
    messages: messages ? messages.reverse() : [],
    current_user: { id: req.user.id, name: currentUserName },
    has_more: !!hasMore
  })
})

router.put('/thread/:threadId/read', requireAuth, async (req, res) => {
  const { threadId } = req.params

  const thread = await canAccessThread(threadId, req.user.id)
  if (!thread) {
    return res.status(403).json({ error: 'Akses ditolak' })
  }

  const { error } = await supabaseAdmin
    .from('chat_read_receipts')
    .upsert({
      thread_id: threadId,
      user_id: req.user.id,
      last_read_at: new Date().toISOString()
    }, {
      onConflict: 'thread_id,user_id'
    })

  if (error) {
    logger.error('CHAT-READ', 'Failed to mark as read', {
      requestId: req.requestId,
      threadId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal menandai telah dibaca' })
  }

  res.json({ ok: true })
})

router.post('/thread/:threadId/messages', idempotencyMiddleware, requireAuth, async (req, res) => {
  const { threadId } = req.params
  const { content, message_type, image_url } = req.body

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Pesan tidak boleh kosong' })
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ error: `Pesan maksimal ${MAX_CONTENT_LENGTH} karakter` })
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

  // Log in admin audit log if sender is not the buyer (is admin or creator)
  if (thread.buyer_id !== req.user.id) {
    await logAdminAction({
      eventId: thread.event_id,
      actorId: req.user.id,
      action: 'send_message',
      targetId: message.id,
      metadata: { thread_id: threadId }
    })
  }

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
