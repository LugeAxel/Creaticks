<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import AppLayout from '@/components/layout/AppLayout.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'
import QRCodeStyling from 'qr-code-styling'
import SeatMap from '@/components/seats/SeatMap.vue'
import type { SeatData, TierInfo } from '@/components/seats/SeatMap.vue'

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
  event_category: string
  event_location_lat: number | null
  event_location_lng: number | null
  event_gallery_urls: string[]
  holder_name: string
  tier_name: string
  status: string
  is_checked_in: boolean
  checked_in_at: string | null
  qr_data: string
  thread_id: string | null
  seat: { seat_code: string } | null
}

interface TicketDesign {
  layout: string
  font: string
  accent_color: string
  bg_color: string
  text_color: string
  artwork_url: string | null
}

interface WeatherData {
  temp_max: number
  temp_min: number
  weathercode: number
  precip_prob: number
}

const now = ref(new Date())
const countdown = ref({ days: 0, hours: 0, minutes: 0, seconds: 0 })
let countdownTimer: ReturnType<typeof setInterval> | null = null

const weather = ref<WeatherData | null>(null)
const weatherLoading = ref(false)
const weatherError = ref(false)

const rating = ref(0)
const rated = ref(false)
const memoryNote = ref('')

const ticket = ref<TicketData | null>(null)
const showSeatMap = ref(false)
const seatMapGrid = ref({ gridX: 0, gridY: 0 })
const seatMapSeats = ref<SeatData[]>([])
const seatMapTiers = ref<TierInfo[]>([])

const selectedSeatIds = computed(() => {
  const s = seatMapSeats.value.find(s => s.status === 'owned')
  return s ? [s.id] : []
})
const design = ref<TicketDesign | null>(null)
const loading = ref(true)
const error = ref('')
const qrContainer = ref<HTMLDivElement | null>(null)
const qrError = ref(false)
const idRevealed = ref(false)
const copiedId = ref(false)

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

const formatDateTime = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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

function roundImage(dataUrl: string, radius: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      const r = Math.min(radius, img.width / 2, img.height / 2)
      ctx.beginPath()
      ctx.moveTo(r, 0)
      ctx.lineTo(img.width - r, 0)
      ctx.arcTo(img.width, 0, img.width, r, r)
      ctx.lineTo(img.width, img.height - r)
      ctx.arcTo(img.width, img.height, img.width - r, img.height, r)
      ctx.lineTo(r, img.height)
      ctx.arcTo(0, img.height, 0, img.height - r, r)
      ctx.lineTo(0, r)
      ctx.arcTo(0, 0, r, 0, r)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, 0, 0)
      resolve(c.toDataURL())
    }
    img.src = dataUrl
  })
}

const copyId = async () => {
  if (!ticket.value) return
  try {
    await navigator.clipboard.writeText(ticket.value.id)
    copiedId.value = true
    setTimeout(() => { copiedId.value = false }, 2000)
  } catch (e) {
    console.warn('Clipboard unavailable:', e)
  }
}

const eventDate = computed(() => new Date(ticket.value?.event_date || ''))

const isSameDay = (d1: Date, d2: Date) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate()

const livingState = computed(() => {
  if (!ticket.value || !eventDate.value.getTime()) return 'loading'
  const eventEnd = new Date(eventDate.value.getTime() + 3 * 60 * 60 * 1000)
  const diff = eventDate.value.getTime() - now.value.getTime()
  const hoursAfter = (now.value.getTime() - eventEnd.getTime()) / (1000 * 60 * 60)
  if (isSameDay(eventDate.value, now.value) && now.value.getTime() < eventEnd.getTime()) return 'today'
  if (diff > 0) return 'before'
  if (hoursAfter < 720) return 'past'
  return 'nostalgia'
})

const countdownParts = computed(() => {
  const c = countdown.value
  const parts: { label: string; value: number }[] = []
  if (c.days > 0) parts.push({ label: 'hari', value: c.days })
  if (c.hours > 0 || c.days > 0) parts.push({ label: 'jam', value: c.hours })
  parts.push({ label: 'menit', value: c.minutes }, { label: 'detik', value: c.seconds })
  return parts
})

const updateCountdown = () => {
  now.value = new Date()
  if (!eventDate.value.getTime()) return
  const diff = eventDate.value.getTime() - now.value.getTime()
  if (diff <= 0) {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
    countdown.value = { days: 0, hours: 0, minutes: 0, seconds: 0 }
    return
  }
  const totalSeconds = Math.floor(diff / 1000)
  countdown.value = {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

const weatherEmoji = (code: number) => {
  if (code === 0) return 'clear_day'
  if (code <= 3) return 'partly_cloudy_day'
  if (code <= 48) return 'foggy'
  if (code <= 57) return 'rainy'
  if (code <= 67) return 'weather_hail'
  if (code <= 77) return 'ac_unit'
  if (code <= 82) return 'rainy'
  if (code <= 86) return 'weather_snowy'
  return 'thunderstorm'
}

const weatherDesc = (code: number) => {
  if (code === 0) return 'Cerah'
  if (code <= 3) return 'Sebagian Berawan'
  if (code <= 48) return 'Berkabut'
  if (code <= 57) return 'Gerimis'
  if (code <= 67) return 'Hujan'
  if (code <= 77) return 'Salju'
  if (code <= 82) return 'Hujan Lebat'
  if (code <= 86) return 'Hujan Salju'
  return 'Badai'
}

const fetchWeather = async () => {
  if (!ticket.value?.event_location_lat || !ticket.value?.event_location_lng) return
  weatherLoading.value = true
  weatherError.value = false
  try {
    const lat = ticket.value.event_location_lat
    const lng = ticket.value.event_location_lng
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max&timezone=auto&forecast_days=1`
    )
    if (!res.ok) throw new Error('Weather fetch failed')
    const data = await res.json()
    if (data.daily) {
      weather.value = {
        temp_max: data.daily.temperature_2m_max[0],
        temp_min: data.daily.temperature_2m_min[0],
        weathercode: data.daily.weathercode[0],
        precip_prob: data.daily.precipitation_probability_max?.[0] ?? 0,
      }
    }
  } catch {
    weatherError.value = true
  } finally {
    weatherLoading.value = false
  }
}

const submitRating = async () => {
  if (rating.value === 0 || !ticket.value) return
  rated.value = true
}

const formatCountdownValue = (v: number) => String(v).padStart(2, '0')

const formatRelative = (date: Date) => {
  const diff = date.getTime() - now.value.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days > 30) return `${Math.floor(days / 30)} bulan lagi`
  if (days > 0) return `${days} hari lagi`
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours > 0) return `${hours} jam lagi`
  const minutes = Math.floor(diff / (1000 * 60))
  if (minutes > 0) return `${minutes} menit lagi`
  return 'sebentar lagi'
}

const renderQR = async (data: string, size: number = 200) => {
  await nextTick()
  if (!qrContainer.value) {
    qrError.value = true
    return
  }

  try {
    let logoDataUrl: string | undefined
    try {
      logoDataUrl = await getImageAsDataUrl('/creatick_logo.png')
      logoDataUrl = await roundImage(logoDataUrl, 16)
    } catch (e) {
      console.warn('Failed to load logo for QR:', e)
    }

    qrContainer.value.replaceChildren()

    const qrCode = new QRCodeStyling({
      width: size,
      height: size,
      data,
      margin: Math.round(size * 0.04),
      qrOptions: { typeNumber: 0, mode: 'Byte', errorCorrectionLevel: 'H' },
      imageOptions: { hideBackgroundDots: true, imageSize: 0.7, margin: 4, crossOrigin: 'anonymous' },
      dotsOptions: { type: 'rounded', color: '#4A42D4' },
      backgroundOptions: { color: '#ffffff' },
      cornersSquareOptions: { type: 'rounded', color: '#4A42D4' },
      cornersDotOptions: { type: 'dot', color: '#4A42D4' },
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
    } catch (e) {
      console.warn('Failed to load custom ticket design:', e)
    }

    // Fetch seat map data
    if (t.seat) {
      try {
        const [eventRes, seatsRes] = await Promise.all([
          fetch(`/api/events/${t.event_id}`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`/api/seats/events/${t.event_id}/seats/public`)
        ])
        if (eventRes.ok && seatsRes.ok) {
          const eventData = await eventRes.json()
          const seatsData = await seatsRes.json()
          const sm = eventData.event?.seat_map
          if (sm && sm.gridX && sm.gridY) {
            seatMapGrid.value = { gridX: sm.gridX, gridY: sm.gridY }
            seatMapTiers.value = (eventData.event?.ticket_tiers || []).map((tier: any) => ({
              id: tier.id,
              name: tier.name,
              price: tier.price,
              color: tier.color || '#6C63FF'
            }))
            seatMapSeats.value = (seatsData.seats || []).map((s: any) => ({
              id: s.id,
              seat_code: s.seat_code,
              tier_id: s.tier_id,
              x: s.x,
              y: s.y,
              status: s.seat_code === t.seat!.seat_code ? 'owned' : 'available'
            }))
          }
        }
      } catch (e) {
        console.warn('Failed to load seat map:', e)
      }
    }

  } catch {
    error.value = 'Gagal memuat tiket'
  } finally {
    loading.value = false
    if (ticket.value) {
      updateCountdown()
      countdownTimer = setInterval(updateCountdown, 1000)
      if (eventDate.value.getTime() > Date.now()) {
        fetchWeather()
      }
    }
    nextTick(() => {
      if (ticket.value?.qr_data) {
        renderQR(ticket.value.qr_data, qrSize.value)
      }
    })
  }
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<template>
  <AppLayout>
    <div class="min-h-screen bg-surface flex flex-col items-center px-4 py-8">
      <div class="w-full max-w-sm">
        <h1 class="text-2xl font-heading font-bold text-text-heading mb-2">Tiket Digital</h1>
        <p class="text-sm text-text-muted mb-6">Tunjukkan QR code ini saat masuk</p>

        <SkeletonPage v-if="loading" type="ticket" />

        <div v-else-if="error" class="text-center py-10">
          <span class="material-symbols-outlined text-5xl text-text-muted mb-4">confirmation_number</span>
          <p class="text-sm text-text-muted">{{ error }}</p>
          <button v-if="ticket && ticket.status !== 'confirmed' && ticket.status !== 'completed'" class="mt-4 px-4 py-2 rounded-2xl bg-primary text-white text-sm font-semibold cursor-pointer" @click="router.push('/tickets')">
            Kembali ke Tiket Saya
          </button>
        </div>

        <!-- Ticket Card Container -->
        <div v-else-if="ticket" :class="['rounded-2xl overflow-hidden shadow-lg transition-all duration-500', livingState === 'today' ? 'ring-2 ring-[#FF6584] ring-offset-2 ring-offset-surface animate-glow-pulse' : '']" :style="ticketStyles">

          <!-- Today badge -->
          <div v-if="livingState === 'today'" class="bg-[#FF6584] text-white text-center text-xs font-bold py-2 tracking-wider">
            <span class="material-symbols-outlined text-sm align-text-bottom mr-1">celebration</span>
            HARI INI
          </div>

          <!-- Classic Layout -->
          <div v-if="layout === 'classic'" class="rounded-[20px] overflow-hidden" :style="{
            backgroundColor: 'var(--ticket-bg)',
            color: 'var(--ticket-text)',
            border: '1px solid rgba(255,255,255,0.08)',
          }">
            <!-- Hero -->
            <div class="h-[180px] overflow-hidden relative" :style="{ backgroundColor: 'var(--ticket-accent)' }">
              <img v-if="ticket.event_banner" :src="ticket.event_banner" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center">
                <span class="material-symbols-outlined text-4xl opacity-30" :style="{ color: 'var(--ticket-text)' }">confirmation_number</span>
              </div>
              <div class="absolute inset-0" :style="{ background: `linear-gradient(to bottom, transparent 40%, var(--ticket-bg) 100%)` }"></div>
            </div>

            <!-- Artwork strip -->
            <div v-if="artworkSrc && artworkSrc !== ticket.event_banner" class="relative -mt-10 h-12 bg-cover bg-center opacity-20" :style="{ backgroundImage: `url(${artworkSrc})` }"></div>

            <!-- Accent bar -->
            <div class="h-[3px]" :style="{ backgroundColor: 'var(--ticket-accent)' }"></div>

            <!-- Body -->
            <div class="px-5 pt-4 pb-3">
              <p class="text-[10px] tracking-[3px] uppercase mb-1.5" :style="{ color: 'var(--ticket-accent)' }">✦ CREATICK PRESENTS</p>
              <h2 class="font-heading font-bold text-lg mb-1" :class="fontClass" :style="{ color: 'var(--ticket-text)' }">{{ ticket.event_title }}</h2>
              <p class="text-xs mb-4" :style="{ color: 'var(--ticket-sub)' }">{{ ticket.event_location }}</p>

              <!-- 3-column meta row -->
              <div class="flex rounded-[10px] overflow-hidden" :style="{ border: '1px solid rgba(255,255,255,0.06)' }">
                <div class="flex-1 py-2.5 px-3 text-center" :style="{ borderRight: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.03)' }">
                  <p class="text-[9px] tracking-[2px] uppercase mb-1" :style="{ color: 'var(--ticket-accent)' }">Date</p>
                  <p class="text-xs font-semibold" :style="{ color: 'var(--ticket-text)' }">{{ formatShortDate(ticket.event_date) }}</p>
                </div>
                <div class="flex-1 py-2.5 px-3 text-center" :style="{ borderRight: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.03)' }">
                  <p class="text-[9px] tracking-[2px] uppercase mb-1" :style="{ color: 'var(--ticket-accent)' }">Time</p>
                  <p class="text-xs font-semibold" :style="{ color: 'var(--ticket-text)' }">{{ formatTime(ticket.event_date) }}</p>
                </div>
                <div class="flex-1 py-2.5 px-3 text-center" :style="{ backgroundColor: 'rgba(255,255,255,0.03)' }">
                  <p class="text-[9px] tracking-[2px] uppercase mb-1" :style="{ color: 'var(--ticket-accent)' }">Location</p>
                  <p class="text-xs font-semibold truncate" :style="{ color: 'var(--ticket-text)' }">{{ ticket.event_location || '—' }}</p>
                </div>
              </div>
            </div>

            <!-- Divider with notches -->
            <div class="mx-5 relative">
              <div class="h-px" :style="{ background: `repeating-linear-gradient(90deg, var(--ticket-accent) 0px, var(--ticket-accent) 6px, transparent 6px, transparent 12px)` }"></div>
              <div class="absolute -left-3 -top-2.5 w-5 h-5 rounded-full" :style="{ backgroundColor: 'var(--ticket-bg)' }"></div>
              <div class="absolute -right-3 -top-2.5 w-5 h-5 rounded-full" :style="{ backgroundColor: 'var(--ticket-bg)' }"></div>
            </div>

            <!-- Bottom section -->
            <div class="px-5 pt-4 pb-5 flex items-start justify-between gap-3">
              <div class="relative shrink-0">
                <div ref="qrContainer" v-if="!qrError" class="rounded-[16px] overflow-hidden border" :style="{ borderColor: 'rgba(0,0,0,0.08)' }"></div>
                <div v-else class="w-[100px] h-[100px] rounded-full bg-white flex items-center justify-center shrink-0 border p-10" :style="{ borderColor: 'rgba(0,0,0,0.08)' }">
                  <span class="text-[10px] text-gray-400">QR</span>
                </div>
                <div v-if="ticket.is_checked_in" class="absolute -top-1 -right-2 bg-teal-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 z-10 backdrop-blur-sm">
                  <span class="material-symbols-outlined text-[10px]">check_circle</span>
                  Checked-in
                </div>
              </div>
              <div class="flex-1 min-w-0 text-right">
                <p class="text-sm font-bold leading-tight" :class="fontClass" :style="{ color: 'var(--ticket-text)' }">{{ ticket.holder_name }}</p>
                <p class="text-[9px] font-mono mt-1.5" :style="{ color: 'var(--ticket-sub)' }">{{ ticket.tier_name }}</p>
                <p v-if="ticket.seat" class="text-[9px] font-mono mt-0.5" :style="{ color: 'var(--ticket-accent)' }">Kursi {{ ticket.seat.seat_code }}</p>
                <div class="flex items-center justify-end gap-1 mt-2">
                  <button @click="idRevealed = !idRevealed" class="flex items-center gap-0.5 cursor-pointer group">
                    <span class="material-symbols-outlined text-[12px]" :style="{ color: 'var(--ticket-sub)' }">{{ idRevealed ? 'visibility' : 'visibility_off' }}</span>
                    <span v-if="!idRevealed" class="text-[9px] font-mono" :style="{ color: 'var(--ticket-sub)' }">••••••••</span>
                    <span v-else class="text-[9px] font-mono" :style="{ color: 'var(--ticket-sub)' }">{{ ticket.id }}</span>
                  </button>
                  <button v-if="idRevealed" @click="copyId" class="flex items-center gap-0.5 cursor-pointer group">
                    <span class="material-symbols-outlined text-[12px]" :style="{ color: copiedId ? 'var(--ticket-accent)' : 'var(--ticket-sub)' }">{{ copiedId ? 'check' : 'content_copy' }}</span>
                    <span class="text-[9px]" :style="{ color: copiedId ? 'var(--ticket-accent)' : 'var(--ticket-sub)' }">{{ copiedId ? 'Tersalin' : 'Salin' }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Watermark -->
            <p class="text-[8px] tracking-wider text-center py-3 font-mono" :style="{ color: 'var(--ticket-sub)', opacity: 0.25 }">✦ CREATICK · VERIFIED TICKET</p>

            <!-- Check-in timestamp -->
            <div v-if="ticket.is_checked_in" class="flex items-center justify-center gap-1.5 pb-3">
              <span class="material-symbols-outlined text-sm text-teal-500">check_circle</span>
              <span class="text-[10px] font-bold text-teal-500">{{ formatDateTime(ticket.checked_in_at || '') }}</span>
            </div>
          </div>

        <!-- Split Layout -->
        <div v-if="layout === 'split'" class="flex">
          <div class="w-[140px] shrink-0 relative overflow-hidden flex items-center justify-center" :style="{ backgroundColor: 'var(--ticket-accent)' }">
            <img v-if="artworkSrc" :src="artworkSrc" class="absolute inset-0 w-full h-full object-cover" />
            <div v-else class="text-3xl opacity-30" :style="{ color: 'var(--ticket-text)' }">--</div>
            <div class="absolute inset-0" :style="{ background: `linear-gradient(to right, transparent 50%, var(--ticket-bg) 100%)` }"></div>
          </div>
          <div class="flex-1 flex flex-col justify-between py-4 px-4" :style="{ backgroundColor: 'var(--ticket-bg)', color: 'var(--ticket-text)' }">
            <div>
              <p class="text-[9px] tracking-[3px] uppercase mb-1.5" :style="{ color: 'var(--ticket-accent)' }">✦ CREATICK PRESENTS</p>
              <h2 class="font-heading font-bold text-base leading-tight mb-0.5" :class="fontClass" :style="{ color: 'var(--ticket-text)' }">{{ ticket.event_title }}</h2>
              <p class="text-[11px]" :style="{ color: 'var(--ticket-sub)' }">{{ ticket.event_location }}</p>
              <div class="flex flex-col gap-1 mt-2 text-[11px]" :style="{ color: 'var(--ticket-sub)' }">
                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">calendar_today</span> {{ formatDate(ticket.event_date) }}</span>
                <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">schedule</span> {{ formatTime(ticket.event_date) }}</span>
              </div>
            </div>
            <div class="flex flex-col items-center gap-2 mt-3 pt-3 text-center" :style="{ borderTop: '1px solid rgba(255,255,255,0.06)' }">

              <div class="relative">
                <div ref="qrContainer" v-if="!qrError" class="rounded-[16px] overflow-hidden border shrink-0"></div>
                <div v-else class="w-[140px] h-[140px] rounded-[16px] overflow-hidden border bg-white flex items-center justify-center shrink-0">
                  <span class="text-[10px] text-gray-400">QR</span>
                </div>
                <div v-if="ticket.is_checked_in" class="absolute -top-4 right-2.5 bg-teal-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 z-10 backdrop-blur-sm">
                  <span class="material-symbols-outlined text-[10px]">check_circle</span>
                  Sudah Checked-in
                </div>
              </div>
              <div v-if="ticket.is_checked_in" class="flex items-center gap-1 text-[10px] text-teal-500">
                <span class="material-symbols-outlined text-[12px]">check_circle</span>
                {{ formatDateTime(ticket.checked_in_at || '') }}
              </div>

              <div>
                <p class="text-xs font-bold" :class="fontClass" :style="{ color: 'var(--ticket-text)' }">{{ ticket.holder_name }}</p>
                <p class="text-[10px] font-mono" :style="{ color: 'var(--ticket-sub)' }">{{ ticket.tier_name }}</p>
                <p v-if="ticket.seat" class="text-[10px] font-mono mt-0.5" :style="{ color: 'var(--ticket-accent)' }">Kursi {{ ticket.seat.seat_code }}</p>
                <div class="flex items-center justify-center gap-1 mt-1">
                  <button @click="idRevealed = !idRevealed" class="flex items-center gap-0.5 cursor-pointer group">
                    <span class="material-symbols-outlined text-[12px]" :style="{ color: 'var(--ticket-sub)' }">{{ idRevealed ? 'visibility' : 'visibility_off' }}</span>
                    <span v-if="!idRevealed" class="text-[10px] font-mono" :style="{ color: 'var(--ticket-sub)' }">••••••••</span>
                    <span v-else class="text-[10px] font-mono" :style="{ color: 'var(--ticket-sub)' }">{{ ticket.id }}</span>
                  </button>
                  <button v-if="idRevealed" @click="copyId" class="flex items-center gap-0.5 cursor-pointer group">
                    <span class="material-symbols-outlined text-[12px]" :style="{ color: copiedId ? 'var(--ticket-accent)' : 'var(--ticket-sub)' }">{{ copiedId ? 'check' : 'content_copy' }}</span>
                    <span class="text-[10px]" :style="{ color: copiedId ? 'var(--ticket-accent)' : 'var(--ticket-sub)' }">{{ copiedId ? 'Tersalin' : 'Salin' }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Minimal Layout -->
        <div v-if="layout === 'minimal'" class="relative min-h-[320px]">
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

              <div class="relative">
                <div ref="qrContainer" v-if="!qrError" class="rounded-[16px] overflow-hidden shrink-0"></div>
                <div v-else class="w-[140px] h-[140px] rounded-[16px] overflow-hidden bg-white/90 flex items-center justify-center shrink-0">
                  <span class="text-[10px] text-gray-500">QR</span>
                </div>
                <div v-if="ticket.is_checked_in" class="absolute -top-4 right-2.5 bg-teal-500/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 z-10 backdrop-blur-sm">
                  <span class="material-symbols-outlined text-[10px]">check_circle</span>
                  Sudah Checked-in
                </div>
              </div>
              <div v-if="ticket.is_checked_in" class="flex items-center gap-1 text-[10px]">
                <span class="material-symbols-outlined text-[12px] text-teal-400">check_circle</span>
                <span class="text-teal-400">{{ formatDateTime(ticket.checked_in_at || '') }}</span>
              </div>

              <div>
                <p class="text-sm font-bold text-white" :class="fontClass">{{ ticket.holder_name }}</p>
                <p class="text-[10px]" :style="{ color: 'var(--ticket-sub)' }">{{ formatShortDate(ticket.event_date) }} · {{ formatTime(ticket.event_date) }}</p>
                <p v-if="ticket.seat" class="text-[10px] mt-0.5" :style="{ color: 'var(--ticket-accent)' }">Kursi {{ ticket.seat.seat_code }}</p>
                <div class="flex items-center justify-center gap-1 mt-1">
                  <button @click="idRevealed = !idRevealed" class="flex items-center gap-0.5 cursor-pointer group">
                    <span class="material-symbols-outlined text-[12px] text-white/60">{{ idRevealed ? 'visibility' : 'visibility_off' }}</span>
                    <span v-if="!idRevealed" class="text-[10px] font-mono text-white/60">••••••••</span>
                    <span v-else class="text-[10px] font-mono text-white/60">{{ ticket.id }}</span>
                  </button>
                  <button v-if="idRevealed" @click="copyId" class="flex items-center gap-0.5 cursor-pointer group">
                    <span class="material-symbols-outlined text-[12px]" :class="copiedId ? 'text-teal-400' : 'text-white/60'">{{ copiedId ? 'check' : 'content_copy' }}</span>
                    <span class="text-[10px]" :class="copiedId ? 'text-teal-400' : 'text-white/60'">{{ copiedId ? 'Tersalin' : 'Salin' }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Fallback (no layout match) -->
        <div v-if="!['classic','split','minimal'].includes(layout)" class="text-center py-10">
          <span class="material-symbols-outlined text-5xl text-text-muted mb-4">confirmation_number</span>
          <p class="text-sm text-text-muted">Tiket tidak tersedia</p>
        </div>

        </div>
        <!-- END Ticket Card Container -->

        <!-- Denah Kursi -->
        <div v-if="seatMapSeats.length && ticket && ticket.seat" class="mt-5 bg-surface-card rounded-2xl shadow-sm overflow-hidden">
          <button @click="showSeatMap = !showSeatMap" class="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface transition">
            <span class="flex items-center gap-2 text-sm font-semibold text-text-heading">
              <span class="material-symbols-outlined text-lg text-primary">event_seat</span>
              Denah Kursi
              <span class="text-xs font-normal text-text-muted">({{ ticket.seat.seat_code }})</span>
            </span>
            <span class="material-symbols-outlined text-text-muted transition" :class="showSeatMap ? 'rotate-180' : ''">expand_more</span>
          </button>
          <div v-if="showSeatMap" class="px-4 pb-4">
            <SeatMap
              :seats="seatMapSeats"
              :gridX="seatMapGrid.gridX"
              :gridY="seatMapGrid.gridY"
              :tiers="seatMapTiers"
              :readonly="true"
              :cellSize="16"
              :selectedSeatIds="selectedSeatIds"
            />
          </div>
        </div>

        <!-- LIVING OBJECT SECTIONS -->

        <!-- Before event: Countdown + Weather -->
        <div v-if="livingState === 'before' && ticket" class="mt-5 space-y-4">

          <div class="bg-surface-card rounded-2xl shadow-sm p-5 text-center">
            <p class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Mulai dalam</p>
            <div class="flex items-center justify-center gap-4">
              <div v-for="part in countdownParts" :key="part.label" class="flex flex-col items-center">
                <span class="text-3xl font-bold font-mono text-text-heading tabular-nums">{{ formatCountdownValue(part.value) }}</span>
                <span class="text-[10px] text-text-muted uppercase tracking-wider mt-0.5">{{ part.label }}</span>
              </div>
            </div>
          </div>

          <div v-if="weather || weatherLoading || weatherError" class="bg-surface-card rounded-2xl shadow-sm p-5">
            <div v-if="weatherLoading" class="flex items-center justify-center gap-2 py-2">
              <span class="material-symbols-outlined text-lg text-text-muted animate-spin">progress_activity</span>
              <span class="text-xs text-text-muted">Memuat perkiraan cuaca...</span>
            </div>
            <div v-else-if="weatherError" class="text-center py-2">
              <span class="material-symbols-outlined text-xl text-text-muted ">cloud_off</span>
              <p class="text-xs text-text-muted mt-1">Cuaca tidak tersedia</p>
            </div>
            <div v-else-if="weather" class="flex items-center justify-evenly gap-4">
              <span class="material-symbols-outlined text-primary" style="font-size:48px;">{{ weatherEmoji(weather.weathercode) }}</span>
              <div class="text-left">
                <p class="text-xs text-text-muted uppercase tracking-wider mb-0.5">Perkiraan Cuaca</p>
                <p class="text-sm font-semibold text-text-heading">{{ weatherDesc(weather.weathercode) }}</p>
                <p class="text-lg font-bold font-mono text-text-heading">{{ Math.round(weather.temp_max) }}° / {{ Math.round(weather.temp_min) }}°</p>
                <p v-if="weather.precip_prob > 0" class="text-xs text-text-muted mt-0.5">
                  <span class="material-symbols-outlined align-text-bottom" style="font-size: 16px;">water_drop</span>
                  {{ weather.precip_prob }}%
                </p>
              </div>
            </div>
          </div>

          <div class="bg-surface-card/50 rounded-2xl p-4 text-center">
            <p class="text-xs text-text-muted">Acara akan dimulai {{ formatRelative(eventDate) }}</p>
          </div>
        </div>

        <!-- Today: Extra info below glowing ticket -->
        <div v-if="livingState === 'today' && ticket" class="mt-5 space-y-3">
          <div class="bg-[#FF6584]/10 rounded-2xl p-4 text-center border border-[#FF6584]/20">
            <span class="material-symbols-outlined text-2xl text-[#FF6584]">celebration</span>
            <p class="text-sm font-bold text-[#FF6584] mt-1">Selamat menikmati acara!</p>
            <p class="text-xs text-text-muted mt-1">Tunjukkan QR code saat check-in</p>
          </div>
        </div>

        <!-- Past: Memory Card -->
        <div v-if="livingState === 'past' && ticket" class="mt-5 space-y-4">
          <div class="bg-surface-card rounded-2xl shadow-sm overflow-hidden">
            <div v-if="ticket.event_gallery_urls && ticket.event_gallery_urls.length" class="h-32 overflow-hidden">
              <img :src="ticket.event_gallery_urls[0]" class="w-full h-full object-cover" />
            </div>
            <div v-else-if="ticket.event_banner" class="h-32 overflow-hidden">
              <img :src="ticket.event_banner" class="w-full h-full object-cover opacity-60" />
            </div>
            <div class="p-5 text-center">
              <p class="text-sm font-bold text-text-heading">Acara Selesai</p>
              <p class="text-xs text-text-muted mt-1">Kamu menghadiri {{ ticket.event_title }} pada {{ formatDate(ticket.event_date) }}</p>
              <div v-if="!rated" class="mt-4">
                <p class="text-xs font-semibold text-text-muted mb-2">Beri nilai acara ini</p>
                <div class="flex items-center justify-center gap-1">
                  <button v-for="i in 5" :key="i" @click="rating = i" :class="['w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all', i <= rating ? 'bg-[#FFB347] text-white' : 'bg-surface-variant text-text-muted']">
                    <span class="material-symbols-outlined text-lg">{{ i <= rating ? 'star' : 'star' }}</span>
                  </button>
                </div>
                <button v-if="rating > 0" @click="submitRating" class="mt-3 px-5 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold cursor-pointer hover:opacity-90">
                  Kirim
                </button>
              </div>
              <div v-else class="mt-4">
                <span class="material-symbols-outlined text-2xl text-primary">check_circle</span>
                <p class="text-xs text-text-muted mt-1">Terima kasih atas penilaiannya!</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Nostalgia (30+ days after) -->
        <div v-if="livingState === 'nostalgia' && ticket" class="mt-5">
          <div class="bg-surface-card/60 rounded-2xl p-5 text-center border border-border/50 sepia-[0.2]">
            <span class="material-symbols-outlined text-3xl text-text-muted">auto_stories</span>
            <p class="text-sm font-bold text-text-muted mt-1">Kenangan</p>
            <p class="text-xs text-text-muted mt-1">Kamu menghadiri {{ ticket.event_title }} pada {{ formatDate(ticket.event_date) }}</p>
            <p class="text-[10px] text-text-muted/50 mt-2 italic">Sudah {{ formatCountdownValue(Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24))) }} hari yang lalu</p>
          </div>
        </div>

      </div>
      <!-- END w-full max-w-sm -->
    </div>
  </AppLayout>
</template>

<style scoped>
@keyframes glow-pulse {
  0%, 100% { box-shadow: 0 0 8px 2px rgba(255, 101, 132, 0.3); }
  50% { box-shadow: 0 0 20px 6px rgba(255, 101, 132, 0.6); }
}
.animate-glow-pulse {
  animation: glow-pulse 2s ease-in-out infinite;
}
</style>
