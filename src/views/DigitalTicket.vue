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

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

const ticketStyles = computed(() => {
  if (!design.value) return {}
  return {
    '--ticket-bg': design.value.bg_color || '#1a1a2e',
    '--ticket-text': design.value.text_color || '#ffffff',
    '--ticket-accent': design.value.accent_color || '#6C63FF',
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

const renderQR = async (data: string) => {
  await nextTick()
  if (!qrContainer.value) return

  const accent = design.value?.accent_color || '#6C63FF'

  let logoDataUrl: string | undefined
  try {
    logoDataUrl = await getImageAsDataUrl('/textcreatick.png')
  } catch {
    // proceed without logo
  }

  const qrCode = new QRCodeStyling({
    width: 240,
    height: 240,
    data,
    margin: 10,
    qrOptions: { typeNumber: 0, mode: 'Byte', errorCorrectionLevel: 'H' },
    imageOptions: { hideBackgroundDots: true, imageSize: 0.3, margin: 4, crossOrigin: 'anonymous' },
    dotsOptions: { type: 'rounded', color: accent },
    backgroundOptions: { color: '#ffffff' },
    cornersSquareOptions: { type: 'extra-rounded', color: accent },
    cornersDotOptions: { type: 'dot', color: accent },
    ...(logoDataUrl ? { image: logoDataUrl } : {})
  })

  qrContainer.value.innerHTML = ''
  qrCode.append(qrContainer.value)
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

    // Client-side status guard
    if (t.status !== 'confirmed' && t.status !== 'completed') {
      error.value = 'Tiket belum aktif'
      ticket.value = t
      return
    }

    ticket.value = t

    // Fetch ticket_designs for this event
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

    await renderQR(t.qr_data)
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

        <div v-else-if="ticket" class="rounded-2xl border overflow-hidden shadow-lg" :style="ticketStyles">
          <!-- Banner -->
          <div v-if="ticket.event_banner" class="h-32 overflow-hidden" :style="{ backgroundColor: 'var(--ticket-accent)' }">
            <img :src="ticket.event_banner" class="w-full h-full object-cover opacity-80" />
          </div>
          <div v-else class="h-32 flex items-center justify-center" :style="{ backgroundColor: 'var(--ticket-accent)' }">
            <span class="material-symbols-outlined text-4xl" :style="{ color: 'var(--ticket-text)' }">confirmation_number</span>
          </div>

          <!-- Artwork overlay -->
          <div v-if="design?.artwork_url" class="relative -mt-16 h-16 bg-cover bg-center opacity-20" :style="{ backgroundImage: `url(${design.artwork_url})` }"></div>

          <div class="px-5 pt-4 pb-3" :style="{ backgroundColor: 'var(--ticket-bg)', color: 'var(--ticket-text)' }">
            <h2 class="font-heading font-bold text-lg mb-1" :class="fontClass" :style="{ color: 'var(--ticket-text)' }">{{ ticket.event_title }}</h2>
            <p class="text-xs flex items-center gap-1.5 mb-1" :style="{ color: 'var(--ticket-text)', opacity: 0.8 }">
              <span class="material-symbols-outlined text-[14px]">calendar_today</span>
              {{ formatDate(ticket.event_date) }}
            </p>
            <p class="text-xs flex items-center gap-1.5 mb-1" :style="{ color: 'var(--ticket-text)', opacity: 0.8 }">
              <span class="material-symbols-outlined text-[14px]">schedule</span>
              {{ formatTime(ticket.event_date) }}
            </p>
            <p v-if="ticket.event_location" class="text-xs flex items-center gap-1.5" :style="{ color: 'var(--ticket-text)', opacity: 0.8 }">
              <span class="material-symbols-outlined text-[14px]">location_on</span>
              {{ ticket.event_location }}
            </p>
          </div>

          <div class="border-t border-dashed mx-5 relative" :style="{ borderColor: 'var(--ticket-accent)' }">
            <div class="absolute -left-3 -top-2.5 w-5 h-5 rounded-full border" :style="{ backgroundColor: 'var(--ticket-bg)', borderColor: 'var(--ticket-accent)' }"></div>
            <div class="absolute -right-3 -top-2.5 w-5 h-5 rounded-full border" :style="{ backgroundColor: 'var(--ticket-bg)', borderColor: 'var(--ticket-accent)' }"></div>
          </div>

          <div class="px-5 pt-4 pb-5 text-center" :style="{ backgroundColor: 'var(--ticket-bg)', color: 'var(--ticket-text)' }">
            <div class="flex justify-center mb-4">
              <div ref="qrContainer" class="rounded-xl overflow-hidden"></div>
            </div>
            <p class="text-sm font-semibold mb-1" :class="fontClass" :style="{ color: 'var(--ticket-text)' }">{{ ticket.holder_name }}</p>
            <p class="text-xs" :style="{ color: 'var(--ticket-text)', opacity: 0.7 }">{{ ticket.tier_name }}</p>
            <p class="text-xs mt-3 font-mono tracking-wider" :style="{ color: 'var(--ticket-text)', opacity: 0.5 }">{{ ticket.id }}</p>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
