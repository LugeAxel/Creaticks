export function clientError(res, status = 400, message = 'Bad request', code = null) {
  const body = { error: message }
  if (code) body.code = code
  return res.status(status).json(body)
}

export function internalError(logger, label, req, res, err, clientMsg = 'Internal server error') {
  try {
    logger.error(label, clientMsg, { requestId: req?.requestId, error: err?.message || String(err) })
  } catch (_) {
    console.error('Logger failed in internalError:', _)
  }
  return res.status(500).json({ error: clientMsg })
}

export function sanitizeDbError(err) {
  // Map common Postgres / Supabase errors to safe client codes/messages if needed
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('not_enough_tickets')) return { code: 'NOT_ENOUGH_TICKETS', message: 'Not enough tickets' }
  if (msg.includes('tier_not_found')) return { code: 'TIER_NOT_FOUND', message: 'Ticket tier not found' }
  return null
}
