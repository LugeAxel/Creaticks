import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'

export async function verifyAdminScope(eventId, userId, requiredRoles = null) {
  let query = supabaseAdmin
    .from('event_roles')
    .select('id, roles')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('status', 'accepted')

  const { data, error } = await query.maybeSingle()

  if (error || !data) return null

  if (requiredRoles && Array.isArray(requiredRoles) && requiredRoles.length > 0) {
    const hasRole = requiredRoles.some(r => data.roles.includes(r))
    if (!hasRole) return null
  }

  return data
}

export function requireAdminScope(requiredRoles = null) {
  return async (req, res, next) => {
    const eventId = req.params.eventId || req.body.event_id
    if (!eventId) {
      return res.status(400).json({ error: 'event_id diperlukan' })
    }

    const role = await verifyAdminScope(eventId, req.user.id, requiredRoles)
    if (!role) {
      logger.warn('ADMIN-SCOPE', 'Access denied', {
        requestId: req.requestId,
        userId: req.user.id,
        eventId,
        requiredRoles
      })
      return res.status(403).json({ error: 'Akses ditolak' })
    }

    req.adminRole = role
    next()
  }
}
