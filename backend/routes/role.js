import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { logger } from '../logger.js'
import supabaseAdmin from '../lib/supabase.js'

const router = Router()

router.put('/', requireAuth, async (req, res) => {
  const { role } = req.body

  if (!role || !['creator', 'buyer'].includes(role)) {
    logger.warn('ROLE', 'Invalid role value', {
      requestId: req.requestId,
      userId: req.user.id,
      role
    })
    return res.status(400).json({ error: 'Role harus "creator" atau "buyer"' })
  }

  const token = req.headers.authorization.split(' ')[1]

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(
    req.user.id,
    { user_metadata: { role } }
  )

  if (authError) {
    logger.error('ROLE', 'Failed to update user metadata', {
      requestId: req.requestId,
      userId: req.user.id,
      error: authError.message
    })
    return res.status(500).json({ error: 'Gagal memperbarui role' })
  }

  const { error: dbError } = await supabaseAdmin
    .from('profiles')
    .update({ role })
    .eq('id', req.user.id)

  if (dbError) {
    logger.error('ROLE', 'Failed to update profile', {
      requestId: req.requestId,
      userId: req.user.id,
      error: dbError.message
    })
    return res.status(500).json({ error: 'Gagal memperbarui profil' })
  }

  logger.info('ROLE', 'Role set successfully', {
    requestId: req.requestId,
    userId: req.user.id,
    role
  })

  res.json({
    id: req.user.id,
    role,
    message: `Akun berhasil didaftarkan sebagai ${role}`
  })
})

export default router
