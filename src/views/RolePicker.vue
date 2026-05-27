<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import BaseButton from '@/components/shared/BaseButton.vue'

const router = useRouter()

const selectedRole = ref<'creator' | 'buyer' | null>(null)
const loading = ref(false)
const error = ref('')

const fillStyle = (active: boolean) => active ? { fontVariationSettings: "'FILL' 1" } : {}

const handleConfirm = async () => {
  if (!selectedRole.value) return

  console.log('[RolePicker]', 'User selected role:', selectedRole.value)

  loading.value = true
  error.value = ''

  const { error: metadataError } = await supabase.auth.updateUser({
    data: { role: selectedRole.value }
  })

  if (metadataError) {
    console.log('[RolePicker]', 'updateUser failed:', metadataError.message)
    error.value = metadataError.message
    loading.value = false
    return
  }

  console.log('[RolePicker]', 'updateUser succeeded')

  const token = (await supabase.auth.getSession()).data.session?.access_token

  const res = await fetch('/api/auth/role', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ role: selectedRole.value })
  })

  if (!res.ok) {
    const data = await res.json()
    console.log('[RolePicker]', 'Role API failed:', { status: res.status, error: data.error })
    error.value = data.error || 'Gagal menyimpan role'
    loading.value = false
    return
  }

  console.log('[RolePicker]', 'Role API succeeded')

  const target = selectedRole.value === 'creator' ? '/creator' : '/dashboard'
  console.log('[RolePicker]', 'Redirecting to:', target)
  router.push(target)
}
</script>

<template>
  <div class="min-h-screen bg-surface flex items-center justify-center px-6 py-12">
    <div class="w-full max-w-lg">
      <div class="text-center mb-10">
        <h1 class="text-3xl font-heading font-bold text-on-surface mb-3">
          Pilih Peran Anda
        </h1>
        <p class="text-body-md text-on-surface-variant">
          Apakah Anda ingin membuat acara atau membeli tiket?
        </p>
      </div>

      <div class="flex flex-col gap-5">
        <button
          class="relative flex items-start gap-5 p-6 rounded-2xl border-2 transition-all duration-200 text-left cursor-pointer"
          :class="selectedRole === 'creator'
            ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
            : 'border-outline-variant bg-surface-container-lowest hover:border-primary/50 hover:shadow-md'"
          @click="selectedRole = 'creator'"
        >
          <div
            class="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
            :class="selectedRole === 'creator' ? 'bg-primary text-on-primary' : 'bg-surface-variant text-on-surface-variant'"
          >
            <span class="material-symbols-outlined text-3xl">rocket_launch</span>
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-headline-sm font-heading font-semibold text-on-surface mb-1">
              Saya Kreator
            </h2>
            <p class="text-body-sm text-on-surface-variant leading-relaxed">
              Buat dan kelola acara sendiri. Atur tim, pantau tiket, dan lihat analitik.
            </p>
          </div>
          <span
            class="material-symbols-outlined text-2xl shrink-0 mt-1"
            :class="selectedRole === 'creator' ? 'text-primary' : 'text-outline'"
            :style="fillStyle(selectedRole === 'creator')"
          >check_circle</span>
        </button>

        <button
          class="relative flex items-start gap-5 p-6 rounded-2xl border-2 transition-all duration-200 text-left cursor-pointer"
          :class="selectedRole === 'buyer'
            ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
            : 'border-outline-variant bg-surface-container-lowest hover:border-primary/50 hover:shadow-md'"
          @click="selectedRole = 'buyer'"
        >
          <div
            class="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
            :class="selectedRole === 'buyer' ? 'bg-primary text-on-primary' : 'bg-surface-variant text-on-surface-variant'"
          >
            <span class="material-symbols-outlined text-3xl">confirmation_number</span>
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-headline-sm font-heading font-semibold text-on-surface mb-1">
              Saya Pembeli
            </h2>
            <p class="text-body-sm text-on-surface-variant leading-relaxed">
              Cari acara seru, beli tiket, dan nikmati momen tak terlupakan.
            </p>
          </div>
          <span
            class="material-symbols-outlined text-2xl shrink-0 mt-1"
            :class="selectedRole === 'buyer' ? 'text-primary' : 'text-outline'"
            :style="fillStyle(selectedRole === 'buyer')"
          >check_circle</span>
        </button>
      </div>

      <p v-if="error" class="text-sm text-error text-center mt-6">{{ error }}</p>

      <div class="mt-8 text-center">
        <BaseButton
          variant="primary"
          size="lg"
          :disabled="!selectedRole"
          :loading="loading"
          @click="handleConfirm"
        >
          Konfirmasi
        </BaseButton>
      </div>
    </div>
  </div>
</template>
