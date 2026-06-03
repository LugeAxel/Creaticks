const store = new Map()
const TTL = 24 * 60 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key)
  }
}, 10 * 60 * 1000)

function idempotencyMiddleware(req, res, next) {
  const key = req.headers['idempotency-key']
  if (!key) return next()

  const existing = store.get(key)
  if (existing) {
    if (existing.status === 'processing') {
      return res.status(409).json({ error: 'Request sedang diproses', code: 'CONCURRENT_REQUEST' })
    }
    return res.status(existing.status).json(existing.body)
  }

  store.set(key, { status: 'processing', expiresAt: Date.now() + TTL })

  const originalJson = res.json.bind(res)
  res.json = function (body) {
    store.set(key, { status: res.statusCode, body, expiresAt: Date.now() + TTL })
    return originalJson(body)
  }

  next()
}

function clearStore() {
  store.clear()
}

export { idempotencyMiddleware, clearStore }
