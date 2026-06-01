<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import HCaptcha from '@/components/shared/HCaptcha.vue'
import BackButton from '@/components/shared/BackButton.vue'

const router = useRouter()
const { signUp } = useAuth()

const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const role = ref<'creator' | 'buyer'>('buyer')
const termsAgreed = ref(false)
const loading = ref(false)
const error = ref('')

const hCaptchaSiteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY

const captchaToken = ref('')
const captchaRef = ref<InstanceType<typeof HCaptcha>>()

const onCaptchaVerified = (token: string) => {
  captchaToken.value = token
}

const onCaptchaExpired = () => {
  captchaToken.value = ''
}

const handleSignUp = async () => {
  error.value = ''

  if (!name.value.trim()) {
    error.value = 'Nama harus diisi'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = 'Kata sandi tidak cocok'
    return
  }

  if (password.value.length < 6) {
    error.value = 'Kata sandi minimal 6 karakter'
    return
  }

  if (!termsAgreed.value) {
    error.value = 'Harap setujui Syarat & Ketentuan'
    return
  }

  if (!captchaToken.value) {
    error.value = 'Harap selesaikan verifikasi keamanan'
    return
  }

  loading.value = true

  const { error: signUpError } = await signUp(email.value, password.value, {
    data: { name: name.value, role: role.value, terms_accepted: true },
    captchaToken: captchaToken.value
  })

  loading.value = false

  if (signUpError) {
    captchaRef.value?.reset()
    captchaToken.value = ''
    error.value = signUpError.message
    return
  }

  router.push({ name: 'email-verification', query: { email: email.value } })
}

</script>

<template>
  <div class="min-h-screen bg-surface flex items-center justify-center px-6 py-12">
    <div class="w-full max-w-sm">
      <BackButton/>
      <div class="text-center mb-8">
        <h1 class="text-2xl font-heading font-bold text-text-heading mb-2">Daftar</h1>
        <p class="text-sm text-text-muted">Buat akun Creaticks baru</p>
      </div>

      <form class="flex flex-col gap-4" @submit.prevent="handleSignUp">
        <BaseInput v-model="name" label="Nama" placeholder="Nama lengkap" />
        <BaseInput v-model="email" label="Email" type="email" placeholder="nama@email.com" />
        <BaseInput v-model="password" label="Kata Sandi" type="password" placeholder="Minimal 6 karakter" />
        <BaseInput v-model="confirmPassword" label="Konfirmasi Kata Sandi" type="password" placeholder="Ulangi kata sandi" />

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-text">Daftar sebagai</label>
          <div class="flex gap-3">
            <button
              type="button"
              class="flex-1 px-4 py-3 text-sm font-semibold border-2 rounded-xl transition-all duration-200 cursor-pointer"
              :class="role === 'buyer' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text-muted hover:border-primary/50'"
              @click="role = 'buyer'"
            >
              Pembeli
            </button>
            <button
              type="button"
              class="flex-1 px-4 py-3 text-sm font-semibold border-2 rounded-xl transition-all duration-200 cursor-pointer"
              :class="role === 'creator' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text-muted hover:border-primary/50'"
              @click="role = 'creator'"
            >
              Kreator
            </button>
          </div>
        </div>

        <label class="flex items-start gap-3 cursor-pointer">
          <input
            v-model="termsAgreed"
            type="checkbox"
            class="mt-0.5 w-4 h-4 shrink-0 accent-primary"
          />
          <span class="text-xs text-text-muted leading-relaxed">
            Saya menyetujui
            <router-link :to="{ name: 'syarat-dan-ketentuan' }" class="text-primary hover:underline" target="_blank">
              Syarat &amp; Ketentuan
            </router-link>
            dan memahami bahwa transaksi dilakukan langsung dengan Kreator.
          </span>
        </label>

        <div class="flex justify-center">
          <HCaptcha
            ref="captchaRef"
            :sitekey="hCaptchaSiteKey"
            @verify="onCaptchaVerified"
            @expired="onCaptchaExpired"
          />
        </div>

        <p v-if="error" class="text-sm text-error text-center">{{ error }}</p>

        <BaseButton type="submit" variant="primary" :loading="loading" fullWidth>
          Daftar
        </BaseButton>
      </form>

      <p class="text-sm text-text-muted text-center mt-6">
        Sudah punya akun?
        <router-link :to="{ name: 'login' }" class="text-primary font-semibold hover:underline">
          Masuk
        </router-link>
      </p>
    </div>
  </div>
</template>
