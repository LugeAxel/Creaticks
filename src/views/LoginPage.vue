<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import HCaptcha from '@/components/shared/HCaptcha.vue'

const router = useRouter()
const { signIn, signInWithOAuth, resetPasswordForEmail } = useAuth()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

const showForgot = ref(false)
const forgotEmail = ref('')
const forgotLoading = ref(false)
const forgotSent = ref(false)

const hCaptchaSiteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY

const captchaToken = ref('')
const captchaRef = ref<InstanceType<typeof HCaptcha>>()

const onCaptchaVerified = (token: string) => {
  captchaToken.value = token
}

const onCaptchaExpired = () => {
  captchaToken.value = ''
}

const handleLogin = async () => {
  error.value = ''
  loading.value = true

  if (!captchaToken.value) {
    error.value = 'Harap selesaikan verifikasi keamanan'
    loading.value = false
    return
  }

  const { error: signInError } = await signIn(email.value, password.value, {
    captchaToken: captchaToken.value
  })

  loading.value = false

  if (signInError) {
    captchaRef.value?.reset()
    captchaToken.value = ''
    error.value = signInError.message
    return
  }

  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    const verified = session.user?.email_confirmed_at != null
    if (!verified) {
      router.push({ name: 'email-verification', query: { email: email.value } })
    } else {
      router.push('/')
    }
  }
}

const handleOAuth = async (provider: 'google' | 'github') => {
  error.value = ''
  const { error: oauthError } = await signInWithOAuth(provider)
  if (oauthError) {
    error.value = oauthError.message
  }
}

const handleForgotPassword = async () => {
  forgotLoading.value = true
  forgotSent.value = false

  const { error: err } = await resetPasswordForEmail(forgotEmail.value)

  forgotLoading.value = false

  if (err) {
    error.value = err.message
    return
  }

  forgotSent.value = true
}
</script>

<template>
  <div class="min-h-screen bg-surface flex items-center justify-center px-6">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-heading font-bold text-text-heading mb-2">Masuk</h1>
        <p class="text-sm text-text-muted">Masuk ke akun Creaticks kamu</p>
      </div>

      <div class="flex flex-col gap-3 mb-6">
        <button
          class="w-full flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold border-2 border-border rounded-xl hover:border-primary/50 transition-all duration-200 cursor-pointer bg-surface-card"
          @click="handleOAuth('google')"
        >
          <svg viewBox="0 0 24 24" class="w-5 h-5" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Masuk dengan Google
        </button>
        <button
          class="w-full flex items-center justify-center gap-3 px-4 py-3 text-sm font-semibold border-2 border-border rounded-xl hover:border-primary/50 transition-all duration-200 cursor-pointer bg-surface-card"
          @click="handleOAuth('github')"
        >
          <svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          Masuk dengan GitHub
        </button>
      </div>

      <div class="flex items-center gap-3 mb-6">
        <span class="flex-1 h-px bg-border" />
        <span class="text-xs text-text-muted font-medium">atau</span>
        <span class="flex-1 h-px bg-border" />
      </div>

      <div v-if="showForgot && forgotSent" class="text-center mb-6 p-4 rounded-xl bg-success/5 border border-success/20">
        <p class="text-sm text-success font-medium">Link reset kata sandi sudah dikirim ke {{ forgotEmail }}</p>
      </div>

      <form v-if="!showForgot" class="flex flex-col gap-4" @submit.prevent="handleLogin">
        <BaseInput
          v-model="email"
          label="Email"
          type="email"
          placeholder="nama@email.com"
        />
        <div>
          <BaseInput
            v-model="password"
            label="Kata Sandi"
            type="password"
            placeholder="Masukkan kata sandi"
          />
          <button
            type="button"
            class="text-xs text-primary font-semibold mt-1.5 hover:underline cursor-pointer"
            @click="showForgot = true"
          >
            Lupa Password?
          </button>
        </div>

        <p v-if="error" class="text-sm text-error text-center">{{ error }}</p>

        <div class="flex justify-center">
          <HCaptcha
            ref="captchaRef"
            :sitekey="hCaptchaSiteKey"
            @verify="onCaptchaVerified"
            @expired="onCaptchaExpired"
          />
        </div>

        <BaseButton type="submit" variant="primary" :loading="loading" fullWidth>
          Masuk
        </BaseButton>
      </form>

      <form v-else class="flex flex-col gap-4" @submit.prevent="handleForgotPassword">
        <p class="text-sm text-text-muted">Masukkan email kamu dan kami akan kirim link reset kata sandi.</p>
        <BaseInput v-model="forgotEmail" label="Email" type="email" placeholder="nama@email.com" />

        <p v-if="error" class="text-sm text-error text-center">{{ error }}</p>

        <BaseButton type="submit" variant="primary" :loading="forgotLoading" fullWidth>
          Kirim Link Reset
        </BaseButton>
        <BaseButton variant="ghost" fullWidth @click="showForgot = false">
          Kembali ke Login
        </BaseButton>
      </form>

      <p class="text-sm text-text-muted text-center mt-6">
        Belum punya akun?
        <router-link :to="{ name: 'signup' }" class="text-primary font-semibold hover:underline">
          Daftar
        </router-link>
      </p>
    </div>
  </div>
</template>
