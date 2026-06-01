import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cron from 'node-cron'
import supabaseAdmin from './lib/supabase.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

const main = async () => {
  const [{ default: express }, { default: cors }, { default: helmet }, { default: rateLimit }, { logger }] = await Promise.all([
    import('express'),
    import('cors'),
    import('helmet'),
    import('express-rate-limit'),
    import('./logger.js')
  ])

  const [{ default: authRoutes }, { default: uploadRoutes }, { default: roleRoutes }, { default: invitationRoutes }, { default: eventRoutes }, { default: ticketRoutes }, { default: notificationRoutes }, { default: chatRoutes }, { default: ticketDesignRoutes }, { default: seatRoutes }, { default: statsRoutes }] = await Promise.all([
    import('./routes/auth.js'),
    import('./routes/upload.js'),
    import('./routes/role.js'),
    import('./routes/invitations.js'),
    import('./routes/events.js'),
    import('./routes/tickets.js'),
    import('./routes/notifications.js'),
    import('./routes/chat.js'),
    import('./routes/ticketDesigns.js'),
    import('./routes/seats.js'),
    import('./routes/stats.js')
  ])

  const app = express()
  const PORT = process.env.PORT || 2301

  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
  app.use(express.json({ limit: '10mb' }))
  app.use(logger.request)
  app.use(logger.response)

  // Simple metrics middleware
  const { metricsMiddleware, metricsHandler } = await import('./monitoring/metrics.js')
  app.use(metricsMiddleware)
  app.get('/api/metrics', metricsHandler)

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1200,
    standardHeaders: true,
    legacyHeaders: false
  })
  app.use(limiter)

  const searchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Terlalu banyak permintaan pencarian' }
  })

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { error: 'Terlalu banyak upload' }
  })

  app.use('/api/invitations/search', searchLimiter)
  app.use('/api/upload', uploadLimiter)

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/upload', uploadRoutes)
  app.use('/api/auth/role', roleRoutes)
  app.use('/api/invitations', invitationRoutes)
  app.use('/api/events', eventRoutes)
  app.use('/api/tickets', ticketRoutes)
  app.use('/api/notifications', notificationRoutes)
  app.use('/api/chat', chatRoutes)
  app.use('/api', seatRoutes)
  app.use('/api/stats', statsRoutes)
  app.use('/api/ticket-designs', ticketDesignRoutes)

  const { internalError } = await import('./lib/errorHelper.js')
  app.use((err, _req, res, _next) => {
    return internalError(logger, 'SERVER', _req, res, err, 'Internal server error')
  })

  process.on('unhandledRejection', (reason) => {
    logger.error('SERVER', 'Unhandled promise rejection', { error: reason?.message || String(reason) })
  })

  // Create HTTP server wrapping Express
  const server = createServer(app)

  // Configure Socket.IO
  const io = new Server(server, {
    cors: {
      origin: [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:4173'].filter(Boolean),
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
    }
  })

  app.set('io', io)

  const authorizeSocket = async (socket) => {
    const authToken = socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization?.startsWith('Bearer ')
        ? socket.handshake.headers.authorization.split(' ')[1]
        : null)

    if (!authToken) {
      return false
    }

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(authToken)
    if (error || !user) {
      return false
    }

    socket.data.user = user
    return true
  }

  const userHasRoomAccess = async (room, user) => {
    const roomMatch = /^event:([0-9a-fA-F-]+):(queue|admins|attendance|seats)$/.exec(room)
    if (!roomMatch) return false

    const eventId = roomMatch[1]
    const channel = roomMatch[2]

    const { data: event } = await supabaseAdmin
      .from('events')
      .select('creator_id, status')
      .eq('id', eventId)
      .maybeSingle()

    if (!event) return false
    const isCreator = event.creator_id === user.id

    if (isCreator) return true

    const { data: role } = await supabaseAdmin
      .from('event_roles')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .eq('status', 'accepted')
      .maybeSingle()

    const isAdmin = !!role
    if (['queue', 'admins', 'attendance'].includes(channel)) {
      return isAdmin
    }

    if (channel === 'seats') {
      if (isAdmin || event.status === 'published') return true
      const { data: ticket } = await supabaseAdmin
        .from('ticket_requests')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .maybeSingle()
      return !!ticket
    }

    return false
  }

  io.use(async (socket, next) => {
    try {
      const authorized = await authorizeSocket(socket)
      if (!authorized) {
        return next(new Error('Unauthorized'))
      }
      next()
    } catch (e) {
      logger.warn('SOCKET', 'Socket auth failure', { error: e?.message || String(e) })
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    logger.debug('SOCKET', 'Client connected', { socketId: socket.id, userId: socket.data.user?.id })

    socket.on('join:room', async ({ room }) => {
      if (!room || typeof room !== 'string') return
      const allowed = await userHasRoomAccess(room, socket.data.user)
      if (!allowed) {
        logger.warn('SOCKET', 'Unauthorized room join attempt', { socketId: socket.id, room, userId: socket.data.user?.id })
        return
      }
      socket.join(room)
      logger.debug('SOCKET', `Client joined room: ${room}`, { socketId: socket.id, userId: socket.data.user?.id })
    })

    socket.on('leave:room', ({ room }) => {
      if (!room || typeof room !== 'string') return
      socket.leave(room)
      logger.debug('SOCKET', `Client left room: ${room}`, { socketId: socket.id, userId: socket.data.user?.id })
    })

    socket.on('disconnect', () => {
      logger.debug('SOCKET', 'Client disconnected', { socketId: socket.id, userId: socket.data.user?.id })
    })
  })

  // Seat lock cleanup — every 60 seconds: release expired reservations
  cron.schedule('* * * * *', async () => {
    const { data: expiredSeats, error: seatsError } = await supabaseAdmin
      .from('venue_seats')
      .select('id, event_id')
      .eq('status', 'reserved')
      .lt('reserved_until', new Date().toISOString())

    if (seatsError) {
      logger.error('CRON-SEATS', 'Failed to fetch expired seat locks', { error: seatsError.message })
    } else if (expiredSeats && expiredSeats.length > 0) {
      for (const seat of expiredSeats) {
        const { error: releaseError } = await supabaseAdmin
          .from('venue_seats')
          .update({
            status: 'available',
            reserved_by: null,
            reserved_until: null
          })
          .eq('id', seat.id)

        if (releaseError) {
          logger.error('CRON-SEATS', `Failed to release seat ${seat.id}`, { error: releaseError.message })
        } else {
          logger.info('CRON-SEATS', `Auto-released seat ${seat.id}`)
          io.to(`event:${seat.event_id}:seats`).emit('SEAT_UPDATE', {
            seatId: seat.id,
            status: 'available',
            reservedUntil: null
          })
        }
      }
    }
  })

  // Configure node-cron scheduler running every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    try {
      const nowStr = new Date().toISOString()
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

      // 1. Configurable auto-release of claimed queue items
    const { data: activeClaims, error: claimsError } = await supabaseAdmin
      .from('ticket_requests')
      .select('id, event_id, claimed_by, claimed_at, events!inner(auto_release_claims_enabled, auto_release_claims_timeout)')
      .eq('status', 'pending')
      .not('claimed_by', 'is', null)

    if (claimsError) {
      logger.error('CRON-CLAIMS', 'Failed to fetch active claims', { error: claimsError.message })
    } else if (activeClaims && activeClaims.length > 0) {
      const now = Date.now()
      for (const req of activeClaims) {
        const settings = req.events
        if (!settings || !settings.auto_release_claims_enabled) continue

        const timeoutMins = Number(settings.auto_release_claims_timeout) || 15
        const timeoutMs = timeoutMins * 60 * 1000
        const claimedTime = new Date(req.claimed_at).getTime()

        if (now - claimedTime > timeoutMs) {
          const { error: updateError } = await supabaseAdmin
            .from('ticket_requests')
            .update({ claimed_by: null, claimed_at: null })
            .eq('id', req.id)

          if (updateError) {
            logger.error('CRON-CLAIMS', `Failed to release claim for request ${req.id}`, { error: updateError.message })
          } else {
            logger.info('CRON-CLAIMS', `Auto-released claim for request ${req.id} due to ${timeoutMins} min inactivity`)
            io.to(`event:${req.event_id}:queue`).emit('queue:released', { id: req.id })

            // Post system message in chat
            try {
              const { data: thread } = await supabaseAdmin
                .from('chat_threads')
                .select('id')
                .eq('ticket_request_id', req.id)
                .maybeSingle()

              if (thread) {
                await supabaseAdmin.from('chat_messages').insert({
                  thread_id: thread.id,
                  sender_id: req.claimed_by,
                  message_type: 'system',
                  content: `Klaim penanganan dilepas otomatis karena tidak ada aktivitas selama ${timeoutMins} menit.`
                })
              }
            } catch (chatErr) {
              logger.error('CRON-CLAIMS', 'Failed to post auto-release message', { error: chatErr.message })
            }
          }
        }
      }
    }

    // 2. Auto-cancel unpaid tickets: payment_deadline < NOW() and status = 'pending'
    // Step 2a: fetch expired pending tickets with event setting
    const { data: expiredPayments, error: paymentsError } = await supabaseAdmin
      .from('ticket_requests')
      .select('id, event_id, user_id, events(id, payment_deadline_minutes)')
      .eq('status', 'pending')
      .lt('payment_deadline', nowStr)

    if (paymentsError) {
      logger.error('CRON-PAYMENTS', 'Failed to fetch expired payments', { error: paymentsError.message })
    } else if (expiredPayments && expiredPayments.length > 0) {
      // Step 2b: exclude tickets that already have payment proof
      const ids = expiredPayments.map(r => r.id)
      const { data: paidInvoices } = await supabaseAdmin
        .from('invoices')
        .select('ticket_request_id')
        .in('ticket_request_id', ids)
        .not('proof_image_url', 'is', null)
      const paidIds = new Set((paidInvoices || []).map(i => i.ticket_request_id))

      for (const req of expiredPayments) {
        if (paidIds.has(req.id)) continue // skip already-paid tickets

        const { error: updateError } = await supabaseAdmin
          .from('ticket_requests')
          .update({ status: 'cancelled' })
          .eq('id', req.id)

        if (updateError) {
          logger.error('CRON-PAYMENTS', `Failed to auto-cancel request ${req.id}`, { error: updateError.message })
        } else {
          const ev = Array.isArray(req.events) ? req.events[0] : req.events
          const deadlineMins = ev?.payment_deadline_minutes ?? 30
          logger.info('CRON-PAYMENTS', `Auto-cancelled request ${req.id} due to payment deadline expiry`)

          // Delete the chat thread (hard-delete, cascade removes all messages)
          const { data: thread } = await supabaseAdmin
            .from('chat_threads')
            .select('id')
            .eq('ticket_request_id', req.id)
            .maybeSingle()

          if (thread) {
            await supabaseAdmin
              .from('chat_threads')
              .delete()
              .eq('id', thread.id)
          }

          // Emit real-time status update to queue room
          io.to(`event:${req.event_id}:queue`).emit('queue:status_changed', { id: req.id, status: 'cancelled' })
        }
      }
    }

    // 3. Remove cancelled tickets from queue after 20 minutes and post a system message once
    try {
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString()
      const { data: cancelledOld, error: cancelledErr } = await supabaseAdmin
        .from('ticket_requests')
        .select('id, event_id, user_id')
        .eq('status', 'cancelled')
        .lt('updated_at', twentyMinsAgo)

      if (cancelledErr) {
        logger.error('CRON-QUEUE-CLEAN', 'Failed to fetch old cancelled requests', { error: cancelledErr.message })
      } else if (cancelledOld && cancelledOld.length > 0) {
        for (const req of cancelledOld) {
          try {
            const { data: thread } = await supabaseAdmin
              .from('chat_threads')
              .select('id')
              .eq('ticket_request_id', req.id)
              .maybeSingle()

            // If thread exists, only insert one system message marker to avoid reprocessing
            let alreadyPosted = false
            if (thread) {
              const { data: existingMsg, error: msgErr } = await supabaseAdmin
                .from('chat_messages')
                .select('id')
                .eq('thread_id', thread.id)
                .ilike('content', '%dihapus dari antrian%')
                .limit(1)
                .maybeSingle()

              if (!msgErr && existingMsg) alreadyPosted = true
            }

            if (!alreadyPosted) {
              if (thread) {
                await supabaseAdmin
                  .from('chat_messages')
                  .insert({
                    thread_id: thread.id,
                    sender_id: req.user_id,
                    message_type: 'system',
                    content: 'Tiket dihapus dari antrian setelah 20 menit pembatalan.'
                  })

                await supabaseAdmin
                  .from('chat_threads')
                  .update({ is_active: false })
                  .eq('id', thread.id)
              }

              // Notify realtime clients to remove from queue
              io.to(`event:${req.event_id}:queue`).emit('queue:released', { id: req.id })
              logger.info('CRON-QUEUE-CLEAN', `Removed cancelled request ${req.id} from queue after 20 minutes`)
            }
          } catch (e) {
            logger.error('CRON-QUEUE-CLEAN', `Failed processing cancelled request ${req.id}`, { error: e?.message || String(e) })
          }
        }
      }
    } catch (e) {
      logger.error('CRON-QUEUE-CLEAN', 'Unexpected error', { error: e?.message || String(e) })
    }

    // 4. Auto-close confirmed tickets after configurable timeout
    try {
      const { data: confirmedTickets, error: confirmErr } = await supabaseAdmin
        .from('ticket_requests')
        .select('id, event_id, confirmed_at, events!inner(auto_close_ticket_enabled, auto_close_ticket_timeout)')
        .eq('status', 'confirmed')
        .not('confirmed_at', 'is', null)

      if (confirmErr) {
        logger.error('CRON-AUTOCLOSE', 'Failed to fetch confirmed tickets', { error: confirmErr.message })
      } else if (confirmedTickets && confirmedTickets.length > 0) {
        const now = Date.now()
        for (const req of confirmedTickets) {
          const settings = req.events
          if (!settings || !settings.auto_close_ticket_enabled) continue

          const timeoutMins = Number(settings.auto_close_ticket_timeout) || 1440
          const timeoutMs = timeoutMins * 60 * 1000
          const confirmedTime = new Date(req.confirmed_at).getTime()

          if (now - confirmedTime > timeoutMs) {
            const { error: updateError } = await supabaseAdmin
              .from('ticket_requests')
              .update({ status: 'completed' })
              .eq('id', req.id)

            if (updateError) {
              logger.error('CRON-AUTOCLOSE', `Failed to close ticket ${req.id}`, { error: updateError.message })
            } else {
              logger.info('CRON-AUTOCLOSE', `Auto-closed ticket ${req.id} after ${timeoutMins} min`)

              // Close chat thread
              try {
                const { data: thread } = await supabaseAdmin
                  .from('chat_threads')
                  .select('id')
                  .eq('ticket_request_id', req.id)
                  .maybeSingle()

                if (thread) {
                  await supabaseAdmin.from('chat_messages').insert({
                    thread_id: thread.id,
                    sender_id: req.event_id,
                    message_type: 'system',
                    content: `Tiket ditutup otomatis karena sudah melebihi ${timeoutMins} menit sejak dikonfirmasi.`
                  })

                  await supabaseAdmin
                    .from('chat_threads')
                    .update({ is_active: false })
                    .eq('id', thread.id)
                }
              } catch (chatErr) {
                logger.error('CRON-AUTOCLOSE', 'Failed to post auto-close chat message', { error: chatErr.message })
              }

              io.to(`event:${req.event_id}:queue`).emit('queue:status_changed', { id: req.id, status: 'completed' })
            }
          }
        }
      }
    } catch (e) {
      logger.error('CRON-AUTOCLOSE', 'Unexpected error', { error: e?.message || String(e) })
    }
    } catch (cronErr) {
      logger.error('CRON', 'Unhandled error in 2-min cron cycle', { error: cronErr?.message || String(cronErr) })
    }
  })

  server.listen(PORT, () => {
    logger.info('SERVER', `Creaticks backend running on port ${PORT}`)
  })

  server.on('error', (err) => {
    logger.error('SERVER', 'Server error', { error: err?.message || String(err) })
    process.exit(1)
  })
}

main().catch(e => {
  logger.error('SERVER', 'Startup failed', { error: e?.message || String(e) })
  process.exit(1)
})
