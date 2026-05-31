import supabaseAdmin from './supabase.js'
import { logger } from '../logger.js'

export async function logAdminAction({ eventId, actorId, action, targetId = '', metadata = {} }) {
  try {
    const { error } = await supabaseAdmin
      .from('admin_audit_log')
      .insert({
        event_id: eventId,
        actor_id: actorId,
        action,
        target_id: String(targetId),
        metadata
      })

    if (error) {
      logger.warn('ADMIN-AUDIT', 'Failed to insert admin audit log', { error: error.message, eventId, action })
    }
  } catch (e) {
    logger.warn('ADMIN-AUDIT', 'Failed to write admin audit log', { error: e?.message || String(e), eventId, action })
  }
}
