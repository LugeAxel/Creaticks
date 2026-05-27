<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import BaseButton from '@/components/shared/BaseButton.vue'

const route = useRoute()
const router = useRouter()
const email = (route.query.email as string) || ''
const resending = ref(false)
const sent = ref(false)

const resendVerification = async () => {
  if (!email) return
  resending.value = true
  await supabase.auth.resend({
    type: 'signup',
    email
  })
  resending.value = false
  sent.value = true
}
</script>

<template>
  <div class="min-h-screen bg-surface flex items-center justify-center px-6">
    <div class="w-full max-w-sm text-center">
      <span class="material-symbols-outlined text-5xl text-primary mb-4">mark_email_unread</span>
      <h1 class="text-2xl font-heading font-bold text-text-heading mb-2">Cek Email Kamu</h1>
      <p class="text-sm text-text-muted mb-6 leading-relaxed">
        Kami sudah kirim link verifikasi ke <strong class="text-text">{{ email }}</strong>.<br/>
        Klik link di email untuk mengaktifkan akun.
      </p>

      <div class="flex flex-col gap-3">
        <BaseButton
          variant="outline"
          :loading="resending"
          fullWidth
          @click="resendVerification"
        >
          {{ sent ? 'Terkirim!' : 'Kirim Ulang Email' }}
        </BaseButton>

        <BaseButton variant="ghost" fullWidth @click="router.push('/login')">
          Kembali ke Login
        </BaseButton>
      </div>
    </div>
  </div>
</template>
