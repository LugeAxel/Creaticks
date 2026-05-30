import { Router } from 'express'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'

const router = Router()

router.get('/', async (req, res) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count: recentSales } = await supabaseAdmin
      .from('ticket_requests')
      .select('id', { count: 'exact', head: true })
      .in('status', ['confirmed', 'completed'])
      .gte('updated_at', oneHourAgo)

    const { data: tiers } = await supabaseAdmin
      .from('ticket_tiers')
      .select('sold_count')
    const totalSold = (tiers || []).reduce((s, t) => s + (t.sold_count || 0), 0)

    const { data: checkedIn } = await supabaseAdmin
      .from('ticket_requests')
      .select('event_id')
      .eq('is_checked_in', true)

    const checkedInCount = checkedIn?.length || 0
    const eventCount = new Set((checkedIn || []).map(r => r.event_id)).size

    res.json({
      recent_sales_1h: recentSales || 0,
      total_sold: totalSold,
      checked_in_count: checkedInCount,
      event_count: eventCount
    })
  } catch (err) {
    logger.error('STATS-GLOBAL', 'Failed to fetch global stats', { error: err.message })
    res.status(500).json({ error: 'Gagal mengambil data statistik' })
  }
})

export default router
