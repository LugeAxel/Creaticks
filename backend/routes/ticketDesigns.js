import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'

const router = Router()

router.get('/:eventId', requireAuth, async (req, res) => {
  const { eventId } = req.params

  const { data, error } = await supabaseAdmin
    .from('ticket_designs')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) {
    logger.error('DESIGN-GET', 'Failed to fetch ticket design', {
      requestId: req.requestId,
      eventId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal mengambil desain tiket' })
  }

  res.json({ design: data })
})

router.put('/:eventId', requireAuth, async (req, res) => {
  const { eventId } = req.params
  const { layout, font, accent_color, bg_color, text_color, artwork_url } = req.body

  const { data: event, error: eventError } = await supabaseAdmin
    .from('events')
    .select('creator_id')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError || !event) {
    logger.error('DESIGN-SAVE', 'Event not found', {
      requestId: req.requestId,
      eventId,
      error: eventError?.message
    })
    return res.status(404).json({ error: 'Acara tidak ditemukan' })
  }

  if (event.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Hanya creator yang dapat mengubah desain tiket' })
  }

  const payload = {
    layout: layout || 'classic',
    font: font || 'syne',
    accent_color: accent_color || '#6C63FF',
    bg_color: bg_color || '#1a1a2e',
    text_color: text_color || '#ffffff',
    artwork_url: artwork_url || null,
    updated_at: new Date().toISOString()
  }

  const { data, error } = await supabaseAdmin
    .from('ticket_designs')
    .upsert({ event_id: eventId, ...payload }, { onConflict: 'event_id' })
    .select()
    .single()

  if (error) {
    logger.error('DESIGN-SAVE', 'Failed to save ticket design', {
      requestId: req.requestId,
      eventId,
      error: error.message
    })
    return res.status(500).json({ error: 'Gagal menyimpan desain tiket' })
  }

  logger.info('DESIGN-SAVE', 'Ticket design saved', {
    requestId: req.requestId,
    eventId,
    designId: data.id
  })

  res.json({ design: data })
})

export default router
