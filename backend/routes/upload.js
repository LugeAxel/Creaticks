import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { upload, uploadToCloudinary } from '../middleware/upload.js'
import { logger } from '../logger.js'

const router = Router()

const humanError = (err) => {
  if (err.code === 'LIMIT_FILE_SIZE') return 'Ukuran file maksimal 5MB'
  if (err.message && err.message.includes('Unexpected field')) return 'Field file tidak dikenali'
  return err.message || 'Gagal mengunggah file'
}

router.post('/', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      logger.error('UPLOAD', 'Upload failed', { requestId: req.requestId, error: err.message })
      return res.status(400).json({ error: humanError(err) })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada file yang diunggah' })
    }

    try {
      const allowedFolders = ['creaticks', 'banners', 'avatars', 'payment-proofs', 'ticket-designs']
      const requestedFolder = req.body.folder || 'creaticks'
      const folder = allowedFolders.includes(requestedFolder) ? requestedFolder : 'creaticks'
      const result = await uploadToCloudinary(req.file.buffer, folder)

      logger.info('UPLOAD', 'File uploaded', {
        requestId: req.requestId,
        userId: req.user.id,
        publicId: result.publicId
      })

      res.json(result)
    } catch (uploadErr) {
      logger.error('UPLOAD', 'Cloudinary upload failed', {
        requestId: req.requestId,
        error: uploadErr.message
      })
      res.status(500).json({ error: 'Gagal mengunggah file' })
    }
  })
})

export default router
