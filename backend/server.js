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

  const [{ default: authRoutes }, { default: uploadRoutes }, { default: roleRoutes }, { default: invitationRoutes }, { default: eventRoutes }, { default: ticketRoutes }, { default: notificationRoutes }, { default: chatRoutes }, { default: ticketDesignRoutes }, { default: seatRoutes }] = await Promise.all([
    import('./routes/auth.js'),
    import('./routes/upload.js'),
    import('./routes/role.js'),
    import('./routes/invitations.js'),
    import('./routes/events.js'),
    import('./routes/tickets.js'),
    import('./routes/notifications.js'),
    import('./routes/chat.js'),
    import('./routes/ticketDesigns.js'),
    import('./routes/seats.js')
  ])

  const app = express()
  const PORT = process.env.PORT || 3001

  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
  app.use(express.json({ limit: '10mb' }))
  app.use(logger.request)
  app.use(logger.response)

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
  app.use(limiter)

  const searchLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'Terlalu banyak permintaan pencarian' }
  })

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
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
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']
    }
  })

  app.set('io', io)

  io.on('connection', (socket) => {
    logger.debug('SOCKET', 'Client connected', { socketId: socket.id })

    socket.on('join:room', ({ room }) => {
      socket.join(room)
      logger.debug('SOCKET', `Client joined room: ${room}`, { socketId: socket.id })
    })

    socket.on('leave:room', ({ room }) => {
      socket.leave(room)
      logger.debug('SOCKET', `Client left room: ${room}`, { socketId: socket.id })
    })

    socket.on('disconnect', () => {
      logger.debug('SOCKET', 'Client disconnected', { socketId: socket.id })
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
    const nowStr = new Date().toISOString()
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

    // 1. Auto-release claimed locks after 15 minutes of inactivity (based on claimed_at)
    const { data: expiredClaims, error: claimsError } = await supabaseAdmin
      .from('ticket_requests')
      .select('id, event_id, claimed_by')
      .eq('status', 'pending')
      .not('claimed_by', 'is', null)
      .lt('claimed_at', fifteenMinsAgo)

    if (claimsError) {
      logger.error('CRON-CLAIMS', 'Failed to fetch expired claims', { error: claimsError.message })
    } else if (expiredClaims && expiredClaims.length > 0) {
      for (const req of expiredClaims) {
        const { error: updateError } = await supabaseAdmin
          .from('ticket_requests')
          .update({ claimed_by: null, claimed_at: null })
          .eq('id', req.id)

        if (updateError) {
          logger.error('CRON-CLAIMS', `Failed to release claim for request ${req.id}`, { error: updateError.message })
        } else {
          logger.info('CRON-CLAIMS', `Auto-released claim for request ${req.id} due to 15 min inactivity`)
          io.to(`event:${req.event_id}:queue`).emit('queue:released', { id: req.id })
        }
      }
    }

    // 2. Auto-cancel unpaid tickets: payment_deadline < NOW() and status = 'pending'
    const { data: expiredPayments, error: paymentsError } = await supabaseAdmin
      .from('ticket_requests')
      .select('id, event_id, user_id')
      .eq('status', 'pending')
      .lt('payment_deadline', nowStr)

    if (paymentsError) {
      logger.error('CRON-PAYMENTS', 'Failed to fetch expired payments', { error: paymentsError.message })
    } else if (expiredPayments && expiredPayments.length > 0) {
      for (const req of expiredPayments) {
        const { error: updateError } = await supabaseAdmin
          .from('ticket_requests')
          .update({ status: 'cancelled' })
          .eq('id', req.id)

        if (updateError) {
          logger.error('CRON-PAYMENTS', `Failed to auto-cancel request ${req.id}`, { error: updateError.message })
        } else {
          logger.info('CRON-PAYMENTS', `Auto-cancelled request ${req.id} due to payment deadline expiry`)

          // Retrieve chat thread
          const { data: thread } = await supabaseAdmin
            .from('chat_threads')
            .select('id')
            .eq('ticket_request_id', req.id)
            .maybeSingle()

          if (thread) {
            // Insert system message indicating auto-cancellation
            await supabaseAdmin
              .from('chat_messages')
              .insert({
                thread_id: thread.id,
                sender_id: req.user_id,
                message_type: 'system',
                content: 'Pesanan dibatalkan karena melebihi batas waktu pembayaran 30 menit.'
              })

            await supabaseAdmin
              .from('chat_threads')
              .update({ is_active: false })
              .eq('id', thread.id)
          }

          // Emit real-time status update to queue room
          io.to(`event:${req.event_id}:queue`).emit('queue:status_changed', { id: req.id, status: 'cancelled' })
        }
      }
    }
  })

  server.listen(PORT, () => {
    logger.info('SERVER', `Creaticks backend running on port ${PORT}`)
  })
}

main()
