import { v2 as cloudinary } from 'cloudinary'
import multer from 'multer'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

const storage = multer.memoryStorage()

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Format file tidak didukung. Gunakan JPG, PNG, WebP, atau GIF.'))
    }
  }
})

export function validateFileMagic(req, res, next) {
  if (!req.file) return next()

  const buf = req.file.buffer
  const magicSignatures = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'image/gif': [[0x47, 0x49, 0x46, 0x38]],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]]
  }

  const signatures = magicSignatures[req.file.mimetype]
  if (!signatures) return next()

  const matches = signatures.some(sig =>
    sig.length <= buf.length && sig.every((byte, i) => buf[i] === byte)
  )

  if (!matches) {
    return res.status(400).json({ error: 'Konten file tidak sesuai dengan format yang diklaim' })
  }

  next()
}

export async function uploadToCloudinary(buffer, folder = 'creaticks') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }]
      },
      (error, result) => {
        if (error) reject(error)
        else resolve({ url: result.secure_url, publicId: result.public_id })
      }
    )
    stream.end(buffer)
  })
}

export { cloudinary }
