import http from 'http'

const HOST = process.env.HOST || 'localhost'
// Allow passing port as CLI arg for cross-shell compatibility: `node smoke_test.js 2301`
const PORT = process.env.PORT || process.argv[2] || 2301

async function fetch(path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: HOST, port: PORT, path, method: 'GET' }, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function run() {
  try {
    console.log('Checking /api/health')
    const h = await fetch('/api/health')
    console.log('status', h.status)

    console.log('Checking /api/metrics')
    const m = await fetch('/api/metrics')
    console.log('status', m.status)

    if (h.status === 200 && m.status === 200) {
      console.log('Smoke test passed')
      process.exit(0)
    }
    console.error('Smoke test failed')
    process.exit(2)
  } catch (e) {
    console.error('Smoke test error', e?.message || e)
    process.exit(2)
  }
}

run()
