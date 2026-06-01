import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { verifyCaptcha } from '../middleware/captcha.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'

const MAX_NAME_LENGTH = 100
const MAX_PHONE_LENGTH = 20

const router = Router()

router.get('/me', requireAuth, async (req, res) => {
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(
    req.headers.authorization.split(' ')[1]
  )

  if (error || !user) {
    logger.error('AUTH-ME', 'User not found', { requestId: req.requestId, error: error?.message })
    return res.status(404).json({ error: 'User not found' })
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name || '',
    phone: user.user_metadata?.phone || '',
    role: user.user_metadata?.role || 'buyer',
    avatar_url: user.user_metadata?.avatar_url || '',
    email_verified: user.email_confirmed_at != null
  })
})

router.put('/profile', requireAuth, verifyCaptcha, async (req, res) => {
  const { name, phone, avatar_url } = req.body
  const token = req.headers.authorization.split(' ')[1]

  if (name && name.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: `Nama maksimal ${MAX_NAME_LENGTH} karakter` })
  }
  if (phone && phone.length > MAX_PHONE_LENGTH) {
    return res.status(400).json({ error: `Nomor telepon maksimal ${MAX_PHONE_LENGTH} karakter` })
  }

  const metadata = {}
  if (name !== undefined) metadata.name = name
  if (phone !== undefined) metadata.phone = phone
  if (avatar_url !== undefined) metadata.avatar_url = avatar_url

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
    req.user.id,
    { user_metadata: metadata }
  )

  if (error) {
    logger.error('PROFILE-UPDATE', 'Failed to update profile', {
      requestId: req.requestId,
      error: error.message
    })
    return res.status(400).json({ error: 'Gagal memperbarui profil' })
  }

  logger.info('PROFILE-UPDATE', 'Profile updated', {
    requestId: req.requestId,
    userId: req.user.id
  })

  res.json({
    id: data.user.id,
    email: data.user.email,
    name: data.user.user_metadata?.name || '',
    phone: data.user.user_metadata?.phone || '',
    role: data.user.user_metadata?.role || 'buyer',
    avatar_url: data.user.user_metadata?.avatar_url || ''
  })
})

export default router
