<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { supabase } from '@/lib/supabase'
import { useEventContext } from '@/composables/useEventContext'
import BaseButton from '@/components/shared/BaseButton.vue'

const { event } = useEventContext()
const eventId = event.id

const scanResult = ref<{ success: boolean; message: string; holder_name?: string; tier_name?: string } | null>(null)
const manualCode = ref('')
const validating = ref(false)
const cameraActive = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)
const streamRef = ref<MediaStream | null>(null)
const useCamera = ref(true)

const startCamera = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: 640, height: 480 }
    })
    streamRef.value = stream
    cameraActive.value = true
    await nextTick()
    if (videoRef.value) {
      videoRef.value.srcObject = stream
    }
  } catch {
    useCamera.value = false
    scanResult.value = { success: false, message: 'Kamera tidak tersedia. Gunakan input manual.' }
  }
}

const stopCamera = () => {
  if (streamRef.value) {
    streamRef.value.getTracks().forEach(t => t.stop())
    streamRef.value = null
  }
  cameraActive.value = false
}

const validateTicket = async (ticketId: string) => {
  validating.value = true
  scanResult.value = null
  const token = (await supabase.auth.getSession()).data.session?.access_token

  try {
    const res = await fetch(`/api/tickets/${ticketId}/validate`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    })

    if (res.ok) {
      const data = await res.json()
      scanResult.value = {
        success: true,
        message: `Check-in berhasil!`,
        holder_name: data.ticket?.holder_name,
        tier_name: data.ticket?.tier_name
      }
    } else {
      const data = await res.json()
      scanResult.value = {
        success: false,
        message: data.error || 'Tiket tidak valid'
      }
    }
  } catch {
    scanResult.value = { success: false, message: 'Gagal memvalidasi tiket' }
  } finally {
    validating.value = false
  }
}

const handleManualSubmit = () => {
  if (!manualCode.value.trim()) return
  validateTicket(manualCode.value.trim())
}

const handleScanAgain = () => {
  scanResult.value = null
  manualCode.value = ''
}

onMounted(() => {
  startCamera()
})

onUnmounted(() => {
  stopCamera()
})
</script>

<template>
  <div class="p-4 md:p-6 max-w-screen-md mx-auto">
    <h1 class="text-xl font-heading font-bold text-text-heading mb-6">Scan QR Tiket</h1>

    <div v-if="useCamera && cameraActive" class="relative bg-black rounded-2xl overflow-hidden mb-4">
      <video ref="videoRef" autoplay playsinline class="w-full h-80 object-cover"></video>
      <div class="absolute inset-0 border-2 border-teal-500/50 rounded-2xl pointer-events-none"></div>
      <div class="absolute bottom-4 left-0 right-0 text-center">
        <p class="text-white/70 text-xs bg-black/50 inline-block px-3 py-1 rounded-full">Arahkan QR ke kamera</p>
      </div>
    </div>

    <div v-if="!useCamera" class="bg-surface-card rounded-2xl border border-border/50 p-4 mb-4">
      <div class="flex items-center gap-3">
        <span class="material-symbols-outlined text-2xl text-text-muted">videocam_off</span>
        <p class="text-sm text-text-muted">Kamera tidak tersedia. Gunakan input kode manual di bawah.</p>
      </div>
    </div>

    <div class="bg-surface-card rounded-2xl border border-border/50 p-4 mb-4">
      <h3 class="text-sm font-semibold text-text-heading mb-3">Input Manual</h3>
      <div class="flex gap-2">
        <input
          v-model="manualCode"
          type="text"
          placeholder="Masukkan ID tiket..."
          class="flex-1 px-4 py-2.5 rounded-xl border border-border/50 bg-surface text-sm outline-none focus:border-teal-500 transition-colors"
        />
        <BaseButton variant="primary" size="sm" :loading="validating" @click="handleManualSubmit">
          Validasi
        </BaseButton>
      </div>
    </div>

    <div v-if="validating" class="text-center py-8">
      <span class="material-symbols-outlined text-4xl text-teal-500 animate-spin">sync</span>
      <p class="text-sm text-text-muted mt-2">Memvalidasi tiket...</p>
    </div>

    <div
      v-if="scanResult"
      class="rounded-2xl p-6 text-center"
      :class="scanResult.success ? 'bg-teal-500/10 border border-teal-500/30' : 'bg-red-500/10 border border-red-500/30'"
    >
      <span
        class="material-symbols-outlined text-5xl mb-3"
        :class="scanResult.success ? 'text-teal-500' : 'text-red-500'"
      >{{ scanResult.success ? 'check_circle' : 'cancel' }}</span>
      <h3 class="text-lg font-heading font-bold mb-1" :class="scanResult.success ? 'text-teal-600' : 'text-red-600'">
        {{ scanResult.success ? 'Check-in Berhasil' : 'Validasi Gagal' }}
      </h3>
      <p class="text-sm text-text-muted mb-1">{{ scanResult.message }}</p>
      <p v-if="scanResult.success && scanResult.holder_name" class="text-sm font-semibold text-text-heading">
        {{ scanResult.holder_name }} — {{ scanResult.tier_name }}
      </p>
      <div class="mt-4">
        <BaseButton variant="primary" @click="handleScanAgain">Scan Lagi</BaseButton>
      </div>
    </div>
  </div>
</template>
