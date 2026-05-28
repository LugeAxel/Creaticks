export async function fetchWithRetry(url: string, opts: RequestInit = {}, retries = 3, backoff = 300) {
  let lastErr
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, opts)
      if (!res.ok) return res
      return res
    } catch (err) {
      lastErr = err
      // network error: wait then retry
      await new Promise(r => setTimeout(r, backoff * (i + 1)))
    }
  }
  throw lastErr
}
