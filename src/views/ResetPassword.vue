<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'

const router = useRouter()

const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')

const handleReset = async () => {
  error.value = ''

  if (password.value.length < 6) {
    error.value = 'Kata sandi minimal 6 karakter'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = 'Kata sandi tidak cocok'
    return
  }

  loading.value = true

  const { error: updateError } = await supabase.auth.updateUser({
    password: password.value
  })

  loading.value = false

  if (updateError) {
    error.value = updateError.message
    return
  }

  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen bg-surface flex items-center justify-center px-6">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <span class="material-symbols-outlined text-5xl text-primary mb-4">lock_reset</span>
        <h1 class="text-2xl font-heading font-bold text-text-heading mb-2">Buat Kata Sandi Baru</h1>
        <p class="text-sm text-text-muted">Masukkan kata sandi baru untuk akun kamu.</p>
      </div>

      <form class="flex flex-col gap-4" @submit.prevent="handleReset">
        <BaseInput
          v-model="password"
          label="Kata Sandi Baru"
          type="password"
          placeholder="Minimal 6 karakter"
        />
        <BaseInput
          v-model="confirmPassword"
          label="Konfirmasi Kata Sandi"
          type="password"
          placeholder="Ulangi kata sandi baru"
        />

        <p v-if="error" class="text-sm text-error text-center">{{ error }}</p>

        <BaseButton type="submit" variant="primary" :loading="loading" fullWidth>
          Atur Ulang Kata Sandi
        </BaseButton>
      </form>
    </div>
  </div>
</template>
