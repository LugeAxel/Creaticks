import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import type { User, Session, AuthError } from '@supabase/supabase-js'
import { useToast } from '@/composables/useToast'

const user = ref<User | null>(null)
const session = ref<Session | null>(null)
const loading = ref(true)
let isSigningOut = false

export function useAuth() {
  onMounted(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      session.value = s
      user.value = s?.user ?? null
      loading.value = false
    })

    supabase.auth.onAuthStateChange((event, s) => {
      const prevSession = session.value
      session.value = s
      user.value = s?.user ?? null

      if (event === 'SIGNED_OUT' && prevSession && !isSigningOut) {
        if (window.location.pathname !== '/login') {
          const { showToast } = useToast()
          showToast('Sesi berakhir, silakan login ulang', 'warning')
          setTimeout(() => { window.location.href = '/login?expired=1' }, 800)
        }
      }
    })
  })

  const getAuthHeaders = (): Record<string, string> => {
    const token = session.value?.access_token
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  }

  const getCurrentUser = () => user.value

  const signIn = async (email: string, password: string, options?: { captchaToken?: string }) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken: options?.captchaToken }
    })
    return { error: error as AuthError | null }
  }

  const signInWithOAuth = async (provider: 'google' | 'github') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/verify-email`
      }
    })
    return { error: error as AuthError | null }
  }

  const signUp = async (
    email: string,
    password: string,
    options?: { data?: Record<string, unknown>; captchaToken?: string }
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: options?.data,
        captchaToken: options?.captchaToken,
        emailRedirectTo: `${window.location.origin}/verify-email`
      }
    })
    return { error: error as AuthError | null }
  }

  const signOut = async () => {
    isSigningOut = true
    const { error } = await supabase.auth.signOut()
    isSigningOut = false
    return { error: error as AuthError | null }
  }

  const resetPasswordForEmail = async (email: string, captchaToken?: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/verify-email`,
      captchaToken
    })
    return { error: error as AuthError | null }
  }

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    return { error: error as AuthError | null }
  }

  const linkOAuthProvider = async (provider: 'google' | 'github') => {
    const { error } = await supabase.auth.linkIdentity({ provider })
    return { error: error as AuthError | null }
  }

  return {
    user,
    session,
    loading,
    getAuthHeaders,
    getCurrentUser,
    signIn,
    signInWithOAuth,
    signUp,
    signOut,
    resetPasswordForEmail,
    updatePassword,
    linkOAuthProvider
  }
}
