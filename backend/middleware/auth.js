import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    logger.warn('AUTH', 'Missing or invalid Authorization header', { requestId: req.requestId })
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = header.split(' ')[1]

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

    if (error || !user) {
      logger.warn('AUTH', 'Invalid token', { requestId: req.requestId, error: error?.message })
      return res.status(401).json({ error: 'Unauthorized' })
    }

    req.user = user
    next()
  } catch (err) {
    logger.error('AUTH', 'Auth middleware error', { requestId: req.requestId, error: err.message })
    return res.status(500).json({ error: 'Unauthorized' })
  }
}
