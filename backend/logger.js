import crypto from 'crypto'

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }

function _log(level, label, msg, meta = {}) {
  const requestId = meta.requestId || crypto.randomUUID()
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    label,
    message: msg,
    requestId,
    ...meta
  }

  const out = JSON.stringify(entry)

  if (level === 'error') console.error(out)
  else if (level === 'warn') console.warn(out)
  else console.log(out)
}

export const logger = {
  debug: (label, msg, meta) => _log('debug', label, msg, meta),
  info: (label, msg, meta) => _log('info', label, msg, meta),
  warn: (label, msg, meta) => _log('warn', label, msg, meta),
  error: (label, msg, meta) => _log('error', label, msg, meta),
  request: (req, _res, next) => {
    req.requestId = crypto.randomUUID()
    _log('info', 'HTTP', `${req.method} ${req.originalUrl}`, {
      requestId: req.requestId,
      ip: req.ip
    })
    next()
  },
  response: (req, res, next) => {
    const originalEnd = res.end.bind(res)
    res.end = function (...args) {
      _log('info', 'HTTP-RESP', `${req.method} ${req.originalUrl} ${res.statusCode}`, {
        requestId: req.requestId
      })
      return originalEnd(...args)
    }
    next()
  }
}
