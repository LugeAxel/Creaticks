import { supabase } from '@/lib/supabase'
import { useToast } from '@/composables/useToast'

function redirectToLogin() {
  if (window.location.pathname === '/login') return
  const { showToast } = useToast()
  showToast('Sesi berakhir, silakan login ulang', 'warning')
  setTimeout(() => { window.location.href = '/login?expired=1' }, 800)
}

let cachedToken: string | null = null
let tokenPromise: Promise<string | null> | null = null

async function getAccessToken(): Promise<string | null> {
  if (cachedToken) return cachedToken
  if (tokenPromise) return tokenPromise
  tokenPromise = (async () => {
    const { data } = await supabase.auth.getSession()
    cachedToken = data.session?.access_token || null
    tokenPromise = null
    return cachedToken
  })()
  return tokenPromise
}

async function refreshAndRetry(url: string, opts: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.refreshSession()
  if (data.session?.access_token) {
    cachedToken = data.session.access_token
    const newOpts: RequestInit = {
      ...opts,
      headers: {
        ...opts.headers as Record<string, string>,
        Authorization: `Bearer ${data.session.access_token}`
      }
    }
    const retryRes = await fetch(url, newOpts)
    if (retryRes.status === 401) {
      redirectToLogin()
      return retryRes
    }
    return retryRes
  }
  redirectToLogin()
  const errRes = new Response(null, { status: 401, statusText: 'Unauthorized' })
  return errRes
}

export async function fetchWithRetry(url: string, opts: RequestInit = {}, retries = 3, backoff = 300) {
  const token = await getAccessToken()
  const authOpts: RequestInit = {
    ...opts,
    headers: {
      ...opts.headers as Record<string, string>,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  }

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, authOpts)
      if (res.status === 401) {
        return await refreshAndRetry(url, authOpts)
      }
      if (!res.ok) return res
      return res
    } catch (err) {
      const lastErr = err
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, backoff * (i + 1)))
      } else {
        const { showToast } = useToast()
        showToast('Koneksi terputus, periksa koneksi internet Anda', 'error')
        throw lastErr
      }
    }
  }

  const { showToast } = useToast()
  showToast('Koneksi terputus, periksa koneksi internet Anda', 'error')
  throw new Error('Request failed after retries')
}

export async function fetchWithoutAuth(url: string, opts: RequestInit = {}, retries = 3, backoff = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, opts)
      if (!res.ok) return res
      return res
    } catch (err) {
      const lastErr = err
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, backoff * (i + 1)))
      } else {
        const { showToast } = useToast()
        showToast('Koneksi terputus, periksa koneksi internet Anda', 'error')
        throw lastErr
      }
    }
  }
  throw new Error('Request failed after retries')
}
