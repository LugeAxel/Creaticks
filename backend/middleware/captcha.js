import { logger } from '../logger.js'

export async function verifyCaptcha(req, res, next) {
  const token = req.body.captchaToken || req.headers['x-captcha-token']

  if (!token) {
    return res.status(400).json({ error: 'Token captcha diperlukan' })
  }

  try {
    const formData = new URLSearchParams()
    formData.append('secret', process.env.HCAPTCHA_SECRET_KEY)
    formData.append('response', token)

    const verifyRes = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      body: formData
    })
    const data = await verifyRes.json()

    if (!data.success) {
      logger.warn('CAPTCHA', 'Verification failed', { requestId: req.requestId, error: data['error-codes'] })
      return res.status(403).json({ error: 'Verifikasi keamanan gagal' })
    }

    next()
  } catch (err) {
    logger.error('CAPTCHA', 'Verification error', { requestId: req.requestId, error: err.message })
    return res.status(500).json({ error: 'Gagal memverifikasi captcha' })
  }
}
