const counters = {
  requests: 0,
  errors: 0,
  tickets_confirmed: 0,
  tickets_cancelled: 0
}

export function metricsMiddleware(req, res, next) {
  counters.requests += 1
  const originalEnd = res.end.bind(res)
  res.end = function (...args) {
    if (res.statusCode >= 500) counters.errors += 1
    return originalEnd(...args)
  }
  next()
}

export function recordEvent(key) {
  if (counters[key] !== undefined) counters[key] += 1
}

export function metricsHandler(req, res) {
  res.json({ metrics: counters, timestamp: new Date().toISOString() })
}
