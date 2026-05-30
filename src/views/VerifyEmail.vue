<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import BaseButton from '@/components/shared/BaseButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

const route = useRoute()
const router = useRouter()

const status = ref<'loading' | 'success' | 'error'>('loading')
const errorMsg = ref('')

const checkDuplicateEmail = async (session: import('@supabase/supabase-js').Session): Promise<boolean> => {
  const email = session.user.email
  const userId = session.user.id
  if (!email) return false

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .neq('id', userId)
    .maybeSingle()

  if (existing) {
    await supabase.auth.signOut()
    status.value = 'error'
    errorMsg.value = 'Email ini sudah terdaftar dengan metode login lain. Silakan gunakan kata sandi untuk masuk.'
    return true
  }
  return false
}

onMounted(async () => {
  const hasHash = window.location.hash.includes('access_token')
  const code = route.query.code as string

  if (hasHash) {
    const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'))
    const isRecovery = hashParams.get('type') === 'recovery'

    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 200))
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        if (isRecovery) {
          router.replace({ name: 'reset-password' })
          return
        }
        const role = session.user.user_metadata?.role
        const isDuplicate = await checkDuplicateEmail(session)
        if (isDuplicate) return
        status.value = 'success'
        setTimeout(() => {
          const redirect = sessionStorage.getItem('redirectAfterLogin')
          sessionStorage.removeItem('redirectAfterLogin')
          router.replace(redirect || (role ? '/' : { name: 'role-picker' }))
        }, 500)
        return
      }
    }
    status.value = 'error'
    errorMsg.value = 'Login gagal. Silakan coba lagi.'
    return
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      status.value = 'error'
      errorMsg.value = error.message
      return
    }

    const session = data.session
    let role = session?.user?.user_metadata?.role

    if (route.query.type === 'recovery') {
      router.replace({ name: 'reset-password' })
      return
    }

    status.value = 'success'

    const isDuplicate = await checkDuplicateEmail(session)
    if (isDuplicate) return

    role = session?.user?.user_metadata?.role

    setTimeout(() => {
      const redirect = sessionStorage.getItem('redirectAfterLogin')
      sessionStorage.removeItem('redirectAfterLogin')
      router.replace(redirect || (role ? '/' : { name: 'role-picker' }))
    }, 500)
    return
  }

  status.value = 'error'
  errorMsg.value = 'Kode verifikasi tidak ditemukan'
})
</script>

<template>
  <div class="min-h-screen bg-surface flex items-center justify-center px-6">
    <div class="w-full max-w-sm text-center">

      <SkeletonPage v-if="status === 'loading'" type="form" />

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
