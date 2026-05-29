<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import AppLayout from '@/components/layout/AppLayout.vue'
import QRCodeStyling from 'qr-code-styling'

const route = useRoute()
const router = useRouter()
const { session } = useAuth()

const ticketId = route.params.id as string

interface TicketData {
  id: string
  event_id: string
  event_title: string
  event_date: string
  event_location: string
  event_banner: string
  holder_name: string
  tier_name: string
  status: string
  qr_data: string
  thread_id: string | null
}

interface TicketDesign {
  layout: string
  font: string
  accent_color: string
  bg_color: string
  text_color: string
  artwork_url: string | null
}

const ticket = ref<TicketData | null>(null)
const design = ref<TicketDesign | null>(null)
const loading = ref(true)
const error = ref('')
const qrContainer = ref<HTMLDivElement | null>(null)
const qrError = ref(false)

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const formatShortDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const ticketStyles = computed(() => {
  if (!design.value) return {}
  return {
    '--ticket-bg': design.value.bg_color || '#1a1a2e',
    '--ticket-text': design.value.text_color || '#ffffff',
    '--ticket-accent': design.value.accent_color || '#6C63FF',
    '--ticket-sub': hexToRgba(design.value.text_color || '#ffffff', 0.55),
    '--ticket-font': design.value.font || 'syne',
  } as Record<string, string>
})

const fontClass = computed(() => {
  const font = design.value?.font || 'syne'
  const map: Record<string, string> = {
    syne: 'font-syne',
    bebas: 'font-bebas',
    playfair: 'font-playfair',
    mono: 'font-mono',
  }
  return map[font] || 'font-syne'
})

const layout = computed(() => design.value?.layout || 'classic')
const artworkSrc = computed(() => design.value?.artwork_url || ticket.value?.event_banner || null)

const qrSize = computed(() => layout.value === 'classic' ? 200 : 140)

const getImageAsDataUrl = async (src: string): Promise<string> => {
  const res = await fetch(src)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const renderQR = async (data: string, size: number = 200) => {
  await nextTick()
  if (!qrContainer.value) {
    qrError.value = true
    return
  }

  try {
    const accent = design.value?.accent_color || '#6C63FF'

    let logoDataUrl: string | undefined
    try {
      logoDataUrl = await getImageAsDataUrl('/textcreatick.png')
    } catch {
      // proceed without logo
    }

    qrContainer.value.innerHTML = ''

    const qrCode = new QRCodeStyling({
      width: size,
      height: size,
      data,
      margin: Math.round(size * 0.04),
      qrOptions: { typeNumber: 0, mode: 'Byte', errorCorrectionLevel: 'H' },
      imageOptions: { hideBackgroundDots: true, imageSize: 0.3, margin: 4, crossOrigin: 'anonymous' },
      dotsOptions: { type: 'rounded', color: accent },
      backgroundOptions: { color: '#ffffff' },
      cornersSquareOptions: { type: 'extra-rounded', color: accent },
      cornersDotOptions: { type: 'dot', color: accent },
      ...(logoDataUrl ? { image: logoDataUrl } : {})
    })

    qrCode.append(qrContainer.value)
  } catch {
    qrError.value = true
  }
}

onMounted(async () => {
  const token = session.value?.access_token
  if (!token) {
    router.push('/login')
    return
  }

  try {
    const res = await fetch(`/api/tickets/${ticketId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) {
      const data = await res.json()
      error.value = data.error || 'Tiket tidak ditemukan'
      return
    }
    const data = await res.json()
    const t = data.ticket as TicketData

    if (t.status !== 'confirmed' && t.status !== 'completed') {
      error.value = 'Tiket belum aktif'
      ticket.value = t
      return
    }

    ticket.value = t

    try {
      const designRes = await fetch(`/api/ticket-designs/${t.event_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (designRes.ok) {
        const designData = await designRes.json()
        if (designData.design) {
          design.value = designData.design
        }
      }
    } catch {
      // proceed without custom design
    }

    await renderQR(t.qr_data, qrSize.value)
  } catch {
    error.value = 'Gagal memuat tiket'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AppLayout>
    <div class="min-h-screen bg-surface flex flex-col items-center px-4 py-8">
      <div class="w-full max-w-sm">
        <h1 class="text-2xl font-heading font-bold text-text-heading mb-2">Tiket Digital</h1>
        <p class="text-sm text-text-muted mb-6">Tunjukkan QR code ini saat masuk</p>

        <div v-if="loading" class="flex justify-center py-20">
          <span class="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
        </div>

        <div v-else-if="error" class="text-center py-10">
          <span class="material-symbols-outlined text-5xl text-text-muted mb-4">confirmation_number</span>
          <p class="text-sm text-text-muted">{{ error }}</p>
          <button v-if="ticket && ticket.status !== 'confirmed' && ticket.status !== 'completed'" class="mt-4 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold cursor-pointer" @click="router.push('/tickets')">
            Kembali ke Tiket Saya
          </button>
        </div>

        <!-- Classic Layout -->
        <div v-else-if="ticket && layout === 'classic'" class="rounded-2xl overflow-hidden shadow-lg" :style="ticketStyles">
          <div class="h-32 overflow-hidden relative" :style="{ backgroundColor: 'var(--ticket-accent)' }">
            <img v-if="ticket.event_banner" :src="ticket.event_banner" class="w-full h-full object-cover opacity-80" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <span class="material-symbols-outlined text-4xl" :style="{ color: 'var(--ticket-text)' }">confirmation_number</span>
            </div>
          </div>

          <div v-if="artworkSrc && artworkSrc !== ticket.event_banner" class="relative -mt-10 h-12 bg-cover bg-center opacity-20" :style="{ backgroundImage: `url(${artworkSrc})` }"></div>

          <div class="px-5 pt-4 pb-3" :style="{ backgroundColor: 'var(--ticket-bg)', color: 'var(--ticket-text)' }">
            <p class="text-[10px] tracking-[3px] uppercase mb-1.5" :style="{ color: 'var(--ticket-accent)' }">✦ CREATICK PRESENTS</p>
            <h2 class="font-heading font-bold text-lg mb-1" :class="fontClass" :style="{ color: 'var(--ticket-text)' }">{{ ticket.event_title }}</h2>
            <p class="text-xs flex items-center gap-1.5 mb-1" :style="{ color: 'var(--ticket-sub)' }">
              <span class="material-symbols-outlined text-[14px]">calendar_today</span>
              {{ formatDate(ticket.event_date) }}
            </p>
            <p class="text-xs flex items-center gap-1.5 mb-1" :style="{ color: 'var(--ticket-sub)' }">
              <span class="material-symbols-outlined text-[14px]">schedule</span>
              {{ formatTime(ticket.event_date) }}
            </p>
            <p v-if="ticket.event_location" class="text-xs flex items-center gap-1.5" :style="{ color: 'var(--ticket-sub)' }">
              <span class="material-symbols-outlined text-[14px]">location_on</span>
              {{ ticket.event_location }}
            </p>
          </div>

          <div class="mx-5 relative">
            <div class="h-px" :style="{ background: `repeating-linear-gradient(90deg, var(--ticket-accent) 0px, var(--ticket-accent) 6px, transparent 6px, transparent 12px)` }"></div>
            <div class="absolute -left-3 -top-2.5 w-5 h-5 rounded-full border" :style="{ backgroundColor: 'var(--ticket-bg)', borderColor: 'var(--ticket-accent)' }"></div>
            <div class="absolute -right-3 -top-2.5 w-5 h-5 rounded-full border" :style="{ backgroundColor: 'var(--ticket-bg)', borderColor: 'var(--ticket-accent)' }"></div>
          </div>

          <div class="px-5 pt-4 pb-5 flex flex-col items-center gap-3 text-center" :style="{ backgroundColor: 'var(--ticket-bg)', color: 'var(--ticket-text)' }">
            <div ref="qrContainer" v-if="!qrError" class="rounded-xl shrink-0"></div>
            <div v-else class="w-[200px] h-[200px] rounded-xl bg-white flex items-center justify-center shrink-0">
              <span class="text-xs text-gray-400 text-center px-2">QR Code</span>
            </div>
            <div>
              <p class="text-sm font-bold" :class="fontClass" :style="{ color: 'var(--ticket-text)' }">{{ ticket.holder_name }}</p>
              <p class="text-xs mt-1 inline-block px-3 py-1 rounded-full font-mono tracking-wider" :style="{ backgroundColor: 'var(--ticket-accent)', color: '#fff' }">{{ ticket.tier_name }}</p>
              <p class="text-[10px] mt-2 font-mono" :style="{ color: 'var(--ticket-sub)' }">{{ ticket.id }}</p>
            </div>
          </div>

          <p class="text-[8px] tracking-wider text-center py-3 font-mono" :style="{ color: 'var(--ticket-sub)', opacity: 0.4 }">✦ CREATICK · VERIFIED TICKET</p>
        </div>

        <!-- Split Layout -->
        <div v-else-if="ticket && layout === 'split'" class="rounded-2xl overflow-hidden shadow-lg flex" :style="ticketStyles">
          <div class="w-[140px] shrink-0 relative overflow-hidden flex items-center justify-center" :style="{ backgroundColor: 'var(--ticket-accent)' }">
            <img v-if="artworkSrc" :src="artworkSrc" class="absolute inset-0 w-full h-full object-cover" />
            <div v-else class="text-3xl" :style="{ color: 'var(--ticket-text)', opacity: 0.3 }">🎪</div>
            <div class="absolute inset-0" :style="{ background: `linear-gradient(to right, transparent 50%, var(--ticket-bg) 100%)` }"></div>
          </div>
          <div class="flex-1 flex flex-col justify-between py-4 px-4" :style="{ backgroundColor: 'var(--ticket-bg)', color: 'var(--ticket-text)' }">
            <div>
              <p class="text-[9px] tracking-[3px] uppercase mb-1.5" :style="{ color: 'var(--ticket-accent)' }">✦ CREATICK PRESENTS</p>
              <h2 class="font-heading font-bold text-base leading-tight mb-0.5" :class="fontClass" :style="{ color: 'var(--ticket-text)' }">{{ ticket.event_title }}</h2>
              <p class="text-[11px]" :style="{ color: 'var(--ticket-sub)' }">{{ ticket.event_location }}</p>
              <div class="flex flex-col gap-1 mt-2 text-[11px]" :style="{ color: 'var(--ticket-sub)' }">
                <span>📅 {{ formatDate(ticket.event_date) }}</span>
                <span>🕗 {{ formatTime(ticket.event_date) }}</span>
              </div>
            </div>
            <div class="flex flex-col items-center gap-2 mt-3 pt-3 text-center" :style="{ borderTop: '1px solid rgba(255,255,255,0.06)' }">
              <div ref="qrContainer" v-if="!qrError" class="rounded-xl shrink-0"></div>
              <div v-else class="w-[140px] h-[140px] rounded-xl bg-white flex items-center justify-center shrink-0">
                <span class="text-[10px] text-gray-400">QR</span>
              </div>
              <div>
                <p class="text-xs font-bold" :class="fontClass" :style="{ color: 'var(--ticket-text)' }">{{ ticket.holder_name }}</p>
                <p class="text-[10px] font-mono" :style="{ color: 'var(--ticket-sub)' }">{{ ticket.tier_name }} · {{ ticket.id.slice(-6) }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Minimal Layout -->
        <div v-else-if="ticket && layout === 'minimal'" class="rounded-2xl overflow-hidden shadow-lg relative min-h-[320px]" :style="ticketStyles">
          <img v-if="artworkSrc" :src="artworkSrc" class="absolute inset-0 w-full h-full object-cover" />
          <div v-else class="absolute inset-0" :style="{ background: `linear-gradient(135deg, ${design?.accent_color || '#6C63FF'}33, ${design?.accent_color || '#6C63FF'}55)` }"></div>
          <div class="absolute inset-0" :style="{ background: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 50%, rgba(0,0,0,0.92) 100%)` }"></div>
          <div class="absolute top-0 left-0 right-0 h-1" :style="{ backgroundColor: 'var(--ticket-accent)' }"></div>

          <div class="relative z-10 min-h-[320px] flex flex-col justify-end p-5">
            <p class="absolute top-4 right-4 text-[9px] tracking-wider font-mono px-3 py-1 rounded-full" :style="{ backgroundColor: 'var(--ticket-accent)', color: '#fff' }">{{ ticket.tier_name }}</p>
            <p class="text-[9px] tracking-[3px] uppercase mb-1" :style="{ color: 'var(--ticket-sub)' }">✦ CREATICK PRESENTS</p>
            <h2 class="font-heading font-bold text-2xl leading-tight mb-0.5 text-white" :class="fontClass">{{ ticket.event_title }}</h2>
            <p class="text-[11px] mb-3" :style="{ color: 'var(--ticket-sub)' }">{{ ticket.event_location }}</p>
            <div class="h-px mb-3" :style="{ background: `repeating-linear-gradient(90deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 5px, transparent 5px, transparent 10px)` }"></div>
            <div class="flex flex-col items-center gap-2 text-center">
              <div ref="qrContainer" v-if="!qrError" class="rounded-xl shrink-0"></div>
              <div v-else class="w-[140px] h-[140px] rounded-xl bg-white/90 flex items-center justify-center shrink-0">
                <span class="text-[10px] text-gray-500">QR</span>
              </div>
              <div>
                <p class="text-sm font-bold text-white" :class="fontClass">{{ ticket.holder_name }}</p>
                <p class="text-[10px]" :style="{ color: 'var(--ticket-sub)' }">{{ formatShortDate(ticket.event_date) }} · {{ formatTime(ticket.event_date) }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Fallback (no layout match) -->
        <div v-else-if="ticket" class="text-center py-10">
          <span class="material-symbols-outlined text-5xl text-text-muted mb-4">confirmation_number</span>
          <p class="text-sm text-text-muted">Tiket tidak tersedia</p>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
