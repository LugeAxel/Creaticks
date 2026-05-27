<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import BaseButton from '@/components/shared/BaseButton.vue'

const route = useRoute()
const router = useRouter()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMsg = ref('')

onMounted(async () => {
  const hasHash = window.location.hash.includes('access_token')
  const code = route.query.code as string

  console.log('[VerifyEmail]', 'Page loaded', { hash: hasHash, code: !!code, url: window.location.href })

  if (hasHash) {
    console.log('[VerifyEmail]', 'OAuth hash detected — polling for session...')
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 200))
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const role = session.user.user_metadata?.role
        console.log('[VerifyEmail]', `Session found after ${i + 1} polls`, {
          userId: session.user.id,
          role: role || null,
          email: session.user.email
        })
        status.value = 'success'
        setTimeout(() => {
          const target = role ? '/' : 'role-picker'
          console.log('[VerifyEmail]', 'Redirecting to:', target)
          router.replace(role ? '/' : { name: 'role-picker' })
        }, 500)
        return
      }
    }
    console.log('[VerifyEmail]', 'Polling timed out — no session after 3s')
    status.value = 'error'
    errorMsg.value = 'Login gagal. Silakan coba lagi.'
    return
  }

  if (code) {
    console.log('[VerifyEmail]', 'Exchanging code for session...', { type: route.query.type })
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.log('[VerifyEmail]', 'Code exchange failed', { error: error.message })
      status.value = 'error'
      errorMsg.value = error.message
      return
    }

    console.log('[VerifyEmail]', 'Code exchange succeeded')
    status.value = 'success'

    const type = route.query.type as string
    if (type === 'recovery') {
      console.log('[VerifyEmail]', 'Recovery flow — redirecting to /reset-password')
      setTimeout(() => router.push({ name: 'reset-password' }), 1500)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const role = user?.user_metadata?.role
    console.log('[VerifyEmail]', 'User after exchange', { userId: user?.id, role: role || null })
    setTimeout(() => {
      const target = role ? '/' : 'role-picker'
      console.log('[VerifyEmail]', 'Redirecting to:', target)
      router.replace(role ? '/' : { name: 'role-picker' })
    }, 1500)
    return
  }

  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    const role = session.user.user_metadata?.role
    console.log('[VerifyEmail]', 'Already has session', { userId: session.user.id, role: role || null })
    status.value = 'success'
    setTimeout(() => {
      const target = role ? '/' : 'role-picker'
      console.log('[VerifyEmail]', 'Redirecting to:', target)
      router.replace(role ? '/' : { name: 'role-picker' })
    }, 500)
    return
  }

  console.log('[VerifyEmail]', 'No code, no hash, no session — showing error')
  status.value = 'error'
  errorMsg.value = 'Kode verifikasi tidak ditemukan'
})
</script>

<template>
  <div class="min-h-screen bg-surface flex items-center justify-center px-6">
    <div class="w-full max-w-sm text-center">

      <div v-if="status === 'loading'">
        <span class="material-symbols-outlined text-5xl text-primary mb-4 animate-pulse">sync</span>
        <h1 class="text-2xl font-heading font-bold text-text-heading mb-2">Memverifikasi...</h1>
        <p class="text-sm text-text-muted">Tunggu sebentar, kami sedang memverifikasi akun kamu.</p>
      </div>

      <div v-else-if="status === 'success'">
        <span class="material-symbols-outlined text-5xl text-success mb-4">check_circle</span>
        <h1 class="text-2xl font-heading font-bold text-text-heading mb-2">Email Terverifikasi!</h1>
        <p class="text-sm text-text-muted">Akun kamu sudah aktif. Mengalihkan...</p>
      </div>

      <div v-else>
        <span class="material-symbols-outlined text-5xl text-error mb-4">error</span>
        <h1 class="text-2xl font-heading font-bold text-text-heading mb-2">Verifikasi Gagal</h1>
        <p class="text-sm text-text-muted mb-6">{{ errorMsg }}</p>
        <BaseButton variant="primary" fullWidth @click="router.push('/login')">
          Kembali ke Login
        </BaseButton>
      </div>

    </div>
  </div>
</template>
