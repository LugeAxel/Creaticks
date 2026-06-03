<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AppLayout from '@/components/layout/AppLayout.vue'
import BackButton from '@/components/shared/BackButton.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

const route = useRoute()
const eventId = route.params.eventId as string

let scanner: Html5Qrcode | null = null
let scanLocked = false

interface IdentifyData {
  id: string
  event_title: string
  holder_name: string
  holder_email: string
  tier_name: string
  status: string
  is_checked_in: boolean
  checked_in_at: string | null
  seat: { seat_code: string; tier_id: string; status: string } | null
}

type ScanMode = 'attendance' | 'identify'

const scanMode = ref<ScanMode>('attendance')
const scanResult = ref<{ success: boolean; message: string; holder_name?: string; tier_name?: string; identify?: IdentifyData } | null>(null)
const manualCode = ref('')
const validating = ref(false)
const isStarting = ref(true)
const cameraError = ref(false)
const isDecodingImage = ref(false)
const scanSecret = ref('')

const fetchScanSecret = async () => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) return
  try {
    const res = await fetch(`/api/events/${eventId}/scan-secret`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      scanSecret.value = data.scan_secret
    }
  } catch (e) {
    console.warn('Failed to fetch scan secret, proceeding without it:', e)
  }
}

const startScanner = async () => {
  isStarting.value = true
  cameraError.value = false
  scanLocked = false

  try {
    const allCameras = await Html5Qrcode.getCameras()
    if (!allCameras || allCameras.length === 0) {
      cameraError.value = true
      return
    }

    const backIdx = allCameras.findIndex(c =>
      c.label.toLowerCase().includes('back') ||
      c.label.toLowerCase().includes('environment')
    )
    const cam = allCameras[backIdx >= 0 ? backIdx : 0]
    if (!cam) {
      cameraError.value = true
      return
    }

    scanner = new Html5Qrcode('qr-reader', {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
    })

    await scanner.start(
      cam.id,
      { fps: 15, qrbox: { width: 350, height: 350 }, aspectRatio: 1 },
      onScanSuccess,
      () => {}
    )

    isStarting.value = false
  } catch {
    cameraError.value = true
    isStarting.value = false
  }
}

function onScanSuccess(decodedText: string) {
  if (scanLocked) return
  scanLocked = true
  if (scanMode.value === 'attendance') {
    validateTicket(decodedText)
  } else {
    handleIdentify(decodedText)
  }
}

const validateTicket = async (ticketId: string) => {
  validating.value = true
  scanResult.value = null
  const token = (await supabase.auth.getSession()).data.session?.access_token

  try {
    const body: Record<string, any> = { event_id: eventId }
    if (scanSecret.value) body.scan_secret = scanSecret.value

    const res = await fetch(`/api/tickets/${ticketId}/validate`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (res.ok) {
      const data = await res.json()
      scanResult.value = {
        success: true,
        message: 'Check-in berhasil!',
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

const handleIdentify = async (ticketId: string) => {
  validating.value = true
  scanResult.value = null
  const token = (await supabase.auth.getSession()).data.session?.access_token

  try {
    const params = new URLSearchParams({ event_id: eventId })
    if (scanSecret.value) params.set('scan_secret', scanSecret.value)

    const res = await fetch(`/api/tickets/${ticketId}/identify?${params}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (res.ok) {
      const data = await res.json()
      const t = data.ticket as IdentifyData
      scanResult.value = {
        success: true,
        message: t.is_checked_in ? 'Tiket sudah digunakan' : 'Tiket valid',
        holder_name: t.holder_name,
        tier_name: t.tier_name,
        identify: t
      }
    } else {
      const data = await res.json()
      scanResult.value = {
        success: false,
        message: data.error || 'Tiket tidak valid'
      }
    }
  } catch {
    scanResult.value = { success: false, message: 'Gagal mengidentifikasi tiket' }
  } finally {
    validating.value = false
  }
}

const handleManualSubmit = () => {
  if (!manualCode.value.trim()) return
  scanLocked = true
  if (scanMode.value === 'attendance') {
    validateTicket(manualCode.value.trim())
  } else {
    handleIdentify(manualCode.value.trim())
  }
}

const handleScanAgain = () => {
  scanResult.value = null
  manualCode.value = ''
  scanLocked = false
}

const fileInput = ref<HTMLInputElement | null>(null)

const triggerFileUpload = () => {
  fileInput.value?.click()
}

const onFileSelected = () => {
  const file = fileInput.value?.files?.[0]
  if (file) decodeQrFromImage(file)
}

const decodeQrFromImage = async (file: File) => {
  isDecodingImage.value = true
  try {
    const codeScanner = new Html5Qrcode('qr-decoder-image')
    const result = await codeScanner.scanFile(file, true)
    codeScanner.clear()
    if (result && !scanLocked) {
      scanLocked = true
      if (scanMode.value === 'attendance') validateTicket(result)
      else handleIdentify(result)
    }
  } catch (e) {
    console.warn('Failed to decode QR from image:', e)
  } finally {
    isDecodingImage.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

onMounted(async () => {
  await fetchScanSecret()
  startScanner()
})

onUnmounted(() => {
  if (scanner) {
    try { scanner.stop() } catch (e) { console.warn('Failed to stop scanner:', e) }
    scanner = null
  }
})
</script>

<template>
  <AppLayout>
    <div class="min-h-screen bg-surface p-4 pb-28">
      <div class="max-w-screen-md mx-auto">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <BackButton />
            <h1 class="text-xl font-heading font-bold text-text-heading">Scan QR Tiket</h1>
          </div>
          <div class="flex bg-surface-variant rounded-xl p-0.5">
            <button
              @click="scanMode = 'attendance'"
              class="px-3 py-1.5 text-xs font-semibold rounded-[10px] transition cursor-pointer"
              :class="scanMode === 'attendance' ? 'bg-surface-card text-primary shadow-sm' : 'text-text-muted'"
            >
              Absensi
            </button>
            <button
              @click="scanMode = 'identify'"
              class="px-3 py-1.5 text-xs font-semibold rounded-[10px] transition cursor-pointer"
              :class="scanMode === 'identify' ? 'bg-surface-card text-primary shadow-sm' : 'text-text-muted'"
            >
              Identifikasi
            </button>
          </div>
        </div>

        <div class="bg-surface-card rounded-2xl border border-border/50 p-4 mb-4">
          <div id="qr-reader" class="min-h-[300px] min-w-[300px] max-h-[500px] max-w-[500px] mx-auto"></div>
          <div id="qr-decoder-image" class="hidden"></div>

          <div v-if="isStarting" class="flex flex-col items-center justify-center py-8">
            <span class="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
            <p class="text-sm text-text-muted mt-3">Memulai kamera...</p>
          </div>

          <div v-if="cameraError" class="flex flex-col items-center justify-center py-8">
            <span class="material-symbols-outlined text-4xl text-text-muted">videocam_off</span>
            <p class="text-sm text-text-muted mt-3">Kamera tidak tersedia. Gunakan input manual atau upload gambar.</p>
          </div>
        </div>

        <div class="bg-surface-card rounded-2xl border border-border/50 p-4 mb-4">
          <h3 class="text-sm font-semibold text-text-heading mb-3">Input Manual</h3>
          <div class="flex gap-2 mb-3">
            <input
              v-model="manualCode"
              type="text"
              placeholder="Masukkan ID tiket..."
              class="flex-1 px-4 py-2.5 rounded-xl border border-border/50 bg-surface text-sm outline-none focus:border-teal-500 transition-colors"
            />
            <BaseButton variant="primary" size="sm" :loading="validating" @click="handleManualSubmit">
              {{ scanMode === 'attendance' ? 'Validasi' : 'Cari' }}
            </BaseButton>
          </div>

          <div class="border-t border-border/50 pt-3">
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelected" />
            <button
              @click="triggerFileUpload"
              :disabled="isDecodingImage"
              class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-border/50 text-xs font-semibold text-text-muted hover:border-teal-500 hover:text-teal-500 transition-all disabled:opacity-50 cursor-pointer"
            >
              <span class="material-symbols-outlined text-base">{{ isDecodingImage ? 'sync' : 'image' }}</span>
              {{ isDecodingImage ? 'Mendekode QR...' : 'Upload Gambar QR' }}
            </button>
          </div>
        </div>

        <div v-if="validating" class="text-center py-8">
          <span class="material-symbols-outlined text-4xl text-teal-500 animate-spin">sync</span>
          <p class="text-sm text-text-muted mt-2">{{ scanMode === 'attendance' ? 'Memvalidasi tiket...' : 'Mencari tiket...' }}</p>
        </div>

        <!-- Attendance result -->
        <div
          v-if="scanResult && scanMode === 'attendance'"
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

        <!-- Identify result -->
        <div
          v-if="scanResult && scanMode === 'identify' && scanResult.identify"
          class="rounded-2xl p-6 border"
          :class="scanResult.identify.is_checked_in ? 'bg-amber-500/10 border-amber-500/30' : 'bg-teal-500/10 border-teal-500/30'"
        >
          <div class="flex items-center gap-2 mb-4">
            <span
              class="material-symbols-outlined text-2xl"
              :class="scanResult.identify.is_checked_in ? 'text-amber-500' : 'text-teal-500'"
            >{{ scanResult.identify.is_checked_in ? 'assignment_turned_in' : 'verified' }}</span>
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full" :class="scanResult.identify.is_checked_in ? 'bg-amber-500/20 text-amber-600' : 'bg-teal-500/20 text-teal-600'">
              {{ scanResult.identify.is_checked_in ? 'Sudah Check-in' : 'Tiket Valid' }}
            </span>
          </div>
          <div class="space-y-2 text-sm text-left">
            <div class="flex justify-between">
              <span class="text-text-muted">Nama</span>
              <span class="font-semibold text-text-heading">{{ scanResult.identify.holder_name }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Email</span>
              <span class="text-text-heading">{{ scanResult.identify.holder_email }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Tipe</span>
              <span class="font-semibold text-text-heading">{{ scanResult.identify.tier_name }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Event</span>
              <span class="text-text-heading text-right max-w-[200px]">{{ scanResult.identify.event_title }}</span>
            </div>
            <div v-if="scanResult.identify.seat" class="flex justify-between">
              <span class="text-text-muted">Kursi</span>
              <span class="font-semibold text-text-heading">{{ scanResult.identify.seat.seat_code }}</span>
            </div>
            <div v-if="scanResult.identify.checked_in_at" class="flex justify-between">
              <span class="text-text-muted">Check-in</span>
              <span class="text-text-heading">{{ new Date(scanResult.identify.checked_in_at).toLocaleString('id-ID') }}</span>
            </div>
          </div>
          <p v-if="!scanResult.success" class="text-sm text-error mt-3 text-center">{{ scanResult.message }}</p>
          <div class="mt-4 text-center">
            <BaseButton variant="primary" @click="handleScanAgain">Scan Lagi</BaseButton>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
#qr-reader {
  border: none !important;
  background: transparent !important;
}

#qr-reader video {
  border-radius: 1rem !important;
}

#qr-reader img {
  display: none !important;
}
</style>
