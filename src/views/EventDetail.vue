<script setup lang="ts">
import { fetchWithRetry } from '@/lib/api'
import { ref, computed, watch, onMounted, nextTick, onUnmounted } from 'vue'
import { useToast } from '@/composables/useToast'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { useDarkMode } from '@/composables/useDarkMode'
import AppLayout from '@/components/layout/AppLayout.vue'
import BackButton from '@/components/shared/BackButton.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import SeatSelector from '@/components/seats/SeatSelector.vue'
import type { SeatData, TierInfo } from '@/components/seats/SeatMap.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'
import HCaptcha from '@/components/shared/HCaptcha.vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const route = useRoute()
const router = useRouter()

const { user } = useAuth()
const { isDark } = useDarkMode()

const tileUrl = computed(() =>
  isDark.value
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
)

const tileAttribution = '&copy; OpenStreetMap contributors &copy; CARTO'

const loading = ref(true)
const event = ref<any>(null)
const selectedImageIndex = ref(0)
const quantities = ref<Record<string, number>>({})
const totalPrice = ref(0)
const mapLoading = ref(false)
const mapError = ref('')
const copied = ref(false)

const adminRoles = ref<string[] | null>(null)

const seatMapEnabled = ref(false)
const seatMapGrid = ref({ gridX: 25, gridY: 20 })
const seats = ref<SeatData[]>([])
const seatTiers = ref<TierInfo[]>([])
const seatsByTier = ref<Record<string, string[]>>({})
const activeSeatTierId = ref<string | null>(null)
const sessionId = ref(`session_${Date.now()}_${Math.random().toString(36).slice(2)}`)
const authToken = ref('')

const isCreator = computed(() => {
  return user.value && event.value && user.value.id === event.value.creator_id
})

const hasSelectedTier = computed(() => {
  if (!event.value?.ticket_tiers) return false
  return event.value.ticket_tiers.some((t: any) => (quantities.value[t.id] || 0) > 0)
})

const hasSeatTierSelected = computed(() => {
  if (!event.value?.ticket_tiers) return false
  return event.value.ticket_tiers.some((t: any) =>
    t.seat_tier && (quantities.value[t.id] || 0) > 0
  )
})

const canPurchase = computed(() => {
  if (!hasSelectedTier.value) return false
  if (isAllSoldOut.value) return false
  if (hasSeatTierSelected.value) {
    for (const tier of (event.value?.ticket_tiers || [])) {
      if (!tier.seat_tier || !(quantities.value[tier.id] || 0)) continue
      const needed = quantities.value[tier.id] || 0
      const selected = seatsByTier.value[tier.id]?.length || 0
      if (selected !== needed) return false
    }
  }
  return true
})

const maxSeatsNeeded = computed(() => {
  if (!event.value?.ticket_tiers) return 0
  let total = 0
  for (const tier of event.value.ticket_tiers) {
    total += quantities.value[tier.id] || 0
  }
  return total || 1
})

const seatTiersWithQuantity = computed(() => {
  if (!event.value?.ticket_tiers) return []
  return event.value.ticket_tiers.filter((t: any) =>
    t.seat_tier && (quantities.value[t.id] || 0) > 0
  )
})

const allSelectedSeatIds = computed(() => {
  if (!event.value?.ticket_tiers) return []
  return event.value.ticket_tiers
    .filter((t: any) => t.seat_tier)
    .flatMap((t: any) => seatsByTier.value[t.id] || [])
})

const filteredSeatsForActiveTier = computed(() => {
  return seats.value
})

const isAdmin = computed(() => {
  return user.value && adminRoles.value && adminRoles.value.length > 0
})

const allImages = computed(() => {
  if (!event.value) return []
  const images: string[] = []
  if (event.value.banner_url) images.push(event.value.banner_url)
  if (event.value.gallery_urls && Array.isArray(event.value.gallery_urls)) {
    images.push(...event.value.gallery_urls)
  }
  return images
})

const currentImage = computed(() => {
  const imgs = allImages.value
  return imgs[selectedImageIndex.value] || imgs[0] || null
})

const optimizeUrl = (url: string) => {
  if (!url || !url.includes('cloudinary')) return url || ''
  return url.replace('/upload/', '/upload/q_auto,f_auto/')
}

const eventId = route.params.id as string

let mapInstance: L.Map | null = null

const mapContainer = ref<HTMLDivElement | null>(null)

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

const initMap = async (lat: number, lng: number) => {
  await nextTick()
  if (!mapContainer.value) {
    console.warn('[EventDetail] mapContainer ref is null, cannot init map')
    return
  }

  mapInstance = L.map(mapContainer.value, {
    center: [lat, lng],
    zoom: 15,
    zoomControl: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: true,
    dragging: true,
    attributionControl: false
  })

  L.tileLayer(tileUrl.value, {
    maxZoom: 19,
    attribution: tileAttribution
  }).addTo(mapInstance)

  L.marker([lat, lng]).addTo(mapInstance)

  // Enable scroll-to-zoom only on hover
  mapContainer.value.addEventListener('mouseenter', () => {
    mapInstance?.scrollWheelZoom.enable()
  })
  mapContainer.value.addEventListener('mouseleave', () => {
    mapInstance?.scrollWheelZoom.disable()
  })

  setTimeout(() => mapInstance?.invalidateSize(), 200)
}

async function copyCoordinates() {
  if (!event.value?.location_lat || !event.value?.location_lng) return
  const text = `${event.value.location_lat}, ${event.value.location_lng}`
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // clipboard not available
  }
}

const updateDetailTileLayer = () => {
  if (!mapInstance) return
  mapInstance.eachLayer(layer => {
    if ((layer as any).setUrl && !(layer as any)._url?.includes('stamen')) {
      ;(layer as any).setUrl(tileUrl.value)
    }
  })
}

watch(isDark, () => {
  updateDetailTileLayer()
})

const geocodeLocation = async (location: string) => {
  mapLoading.value = true
  mapError.value = ''
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`
    )
    if (!res.ok) throw new Error('Geocode gagal')
    const data = await res.json()
    if (data.length === 0) {
      mapError.value = 'Lokasi tidak ditemukan di peta'
      return
    }
    const lat = parseFloat(data[0].lat)
    const lng = parseFloat(data[0].lon)
    initMap(lat, lng)
  } catch {
    mapError.value = 'Gagal memuat peta'
  } finally {
    mapLoading.value = false
  }
}

onUnmounted(() => {
  mapInstance?.remove()
})

const timeRangeLabel = computed(() => {
  const ev = event.value
  if (!ev) return ''
  if (ev.event_start_time && ev.event_end_time) {
    const st = ev.event_start_time.slice(0, 5)
    const et = ev.event_end_time.slice(0, 5)
    const tzMap: Record<string, string> = { 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA', 'Asia/Jayapura': 'WIT' }
    const tz = tzMap[ev.timezone] || 'WIB'
    const startMin = parseInt(st.split(':')[0]) * 60 + parseInt(st.split(':')[1])
    const endMin = parseInt(et.split(':')[0]) * 60 + parseInt(et.split(':')[1])
    let durMin = endMin > startMin ? endMin - startMin : (24 * 60 - startMin) + endMin
    const hours = Math.floor(durMin / 60)
    const mins = durMin % 60
    const durLabel = mins > 0 ? `${hours} jam ${mins} menit` : `${hours} jam`
    return `${st} – ${et} ${tz} (${durLabel})`
  }
  return formatTime(ev.date) + ' WIB'
})

const isTierSoldOut = (tier: any) => {
  return (tier.sold_count || 0) >= (tier.quota || 0)
}

const isAllSoldOut = computed(() => {
  const tiers = event.value?.ticket_tiers || []
  return tiers.length > 0 && tiers.every((t: any) => isTierSoldOut(t))
})

const increment = (tierId: string) => {
  const tier = event.value?.ticket_tiers?.find((t: any) => t.id === tierId)
  if (!tier) return
  const currentQty = quantities.value[tierId] || 0
  const remaining = (tier.quota || 0) - (tier.sold_count || 0) - currentQty
  if (remaining <= 0) return
  if (!quantities.value[tierId]) quantities.value[tierId] = 0
  quantities.value[tierId]++
  calculateTotal()
}

const decrement = (tierId: string) => {
  if (!quantities.value[tierId]) return
  if (quantities.value[tierId] > 0) quantities.value[tierId]--
  calculateTotal()
}

const calculateTotal = () => {
  totalPrice.value = 0
  if (!event.value?.ticket_tiers) return
  for (const tier of event.value.ticket_tiers) {
    const qty = quantities.value[tier.id] || 0
    totalPrice.value += qty * tier.price
  }
}

const requestLoading = ref(false)
const requestError = ref('')
const captchaToken = ref('')
const captchaRef = ref<InstanceType<typeof HCaptcha>>()

const onCaptchaVerified = (token: string) => {
  captchaToken.value = token
}

const onCaptchaExpired = () => {
  captchaToken.value = ''
}

const hCaptchaSiteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY

const { showToast } = useToast()

const handleRequestTicket = async () => {
  if (!event.value?.ticket_tiers) return

  const items = event.value.ticket_tiers
    .map((tier: any) => ({
      tier_name: tier.name || 'Regular',
      quantity: quantities.value[tier.id] || 0
    }))
    .filter((item: any) => item.quantity > 0)

  if (items.length === 0) return

  const allSeatIds = items
    .filter((item: any) => {
      const tier = event.value.ticket_tiers.find((t: any) => t.name === item.tier_name)
      return tier?.seat_tier
    })
    .flatMap((item: any) => {
      const tier = event.value.ticket_tiers.find((t: any) => t.name === item.tier_name)
      return tier ? (seatsByTier.value[tier.id] || []) : []
    })

  const releaseSeatLocks = async () => {
    if (allSeatIds.length === 0) return
    try {
      for (const seatId of allSeatIds) {
        await fetch(`/api/seat-locks/${seatId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId.value })
        })
      }
      seatsByTier.value = {}
      await loadSeats()
    } catch { /* best-effort cleanup */ }
  }

  requestLoading.value = true
  requestError.value = ''

  const idempotencyKey = crypto.randomUUID?.() ?? Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      router.push('/login')
      return
    }

    const body: any = { event_id: event.value.id, items, captchaToken: captchaToken.value }

    if (!captchaToken.value) {
      requestError.value = 'Harap selesaikan verifikasi keamanan'
      requestLoading.value = false
      return
    }

    if (hasSeatTierSelected.value) {
      for (const tier of event.value.ticket_tiers) {
        if (!tier.seat_tier || !(quantities.value[tier.id] || 0)) continue
        const needed = quantities.value[tier.id] || 0
        const selected = seatsByTier.value[tier.id]?.length || 0
        if (selected !== needed) {
          requestError.value = `Pilih ${needed - selected} kursi lagi untuk ${tier.name}`
          requestLoading.value = false
          return
        }
      }
    }

    if (allSeatIds.length > 0) {
      body.seat_ids = allSeatIds
    }

    const res = await fetchWithRetry('/api/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(body)
    })

    const data = await res.json()

    if (!res.ok) {
      await releaseSeatLocks()
      if (res.status === 403 && data.error?.includes('Kreator')) {
        requestError.value = 'Kamu adalah penyelenggara acara ini'
      } else {
        requestError.value = data.error || 'Gagal memesan tiket'
      }
      showToast(requestError.value, 'error')
      return
    }

    captchaToken.value = ''
    captchaRef.value?.reset()
    showToast('Permintaan tiket berhasil', 'success')
    router.push('/tickets')
  } catch {
    captchaToken.value = ''
    captchaRef.value?.reset()
    await releaseSeatLocks()
    requestError.value = 'Terjadi kesalahan, silakan coba lagi'
    showToast(requestError.value, 'error')
  } finally {
    requestLoading.value = false
  }
}

async function loadSeats() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    authToken.value = session.access_token

    const res = await fetch(`/api/events/${eventId}/seats/public`)
    if (res.ok) {
      const data = await res.json()
      seats.value = (data.seats || []).map((s: any) => ({
        id: s.id,
        seat_code: s.seat_code,
        tier_id: s.tier_id,
        x: s.x,
        y: s.y,
        status: s.status,
        reserved_until: s.reserved_until
      }))
    }
  } catch {
    // seat loading is optional
  }
}

onMounted(async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      authToken.value = session.access_token
    }
    const res = await fetchWithRetry(`/api/events/${eventId}`)
    if (res.ok) {
      const data = await res.json()
      event.value = data.event
      if (data.adminRole) {
        adminRoles.value = data.adminRole
      }

      if (event.value?.seat_map) {
        try {
          const sm = typeof event.value.seat_map === 'string'
            ? JSON.parse(event.value.seat_map)
            : event.value.seat_map
          if (sm && sm.gridX && sm.gridY) {
            seatMapEnabled.value = true
            seatMapGrid.value = { gridX: sm.gridX, gridY: sm.gridY }
          }
        } catch {
          // malformed seat_map, skip
        }
      }

      if (event.value?.ticket_tiers) {
        seatTiers.value = event.value.ticket_tiers.map((t: any) => ({
          id: t.id,
          name: t.name || 'Regular',
          price: t.price || 0,
          color: t.color || '#6C63FF'
        }))
      }
    }

    if (seatMapEnabled.value) {
      await loadSeats()
    }
  } catch {
    // fallback
  } finally {
    loading.value = false
    nextTick(() => {
      const ev = event.value
      if (!ev) return
      if (ev.location_lat && ev.location_lng) {
        initMap(Number(ev.location_lat), Number(ev.location_lng))
      } else if (ev.location) {
        geocodeLocation(ev.location)
      }
    })
  }
})

watch(seatTiersWithQuantity, (tiers) => {
  if (!tiers.length) {
    activeSeatTierId.value = null
  } else if (!activeSeatTierId.value || !tiers.some((t: any) => t.id === activeSeatTierId.value)) {
    activeSeatTierId.value = tiers[0].id
  }
})

function onTierSeatChange(tierId: string | null, ids: string[]) {
  if (!tierId) return
  const current = seatsByTier.value[tierId] || []
  if (current.length === ids.length && current.every((id, i) => id === ids[i])) return
  seatsByTier.value[tierId] = ids
}

function getSeatsNeededForTier(tierId: string | null) {
  if (!tierId) return 0
  return quantities.value[tierId] || 0
}

function getSeatsSelectedForTier(tierId: string | null) {
  if (!tierId) return 0
  return seatsByTier.value[tierId]?.length || 0
}

function getTierName(tierId: string | null) {
  if (!tierId) return 'Tiket'
  const tier = event.value?.ticket_tiers?.find((t: any) => t.id === tierId)
  return tier?.name || 'Tiket'
}
</script>

<template>
  <AppLayout>
  <div class="min-h-screen bg-surface">
    <SkeletonPage v-if="loading" type="detail" />

    <div v-else-if="!event" class="text-center py-20 px-6">
      <span class="material-symbols-outlined text-5xl text-text-muted mb-4">event_busy</span>
      <h2 class="text-xl font-heading font-bold text-text-heading mb-2">Acara tidak ditemukan</h2>
      <p class="text-sm text-text-muted mb-6">Acara yang kamu cari tidak tersedia.</p>
      <BaseButton variant="primary" @click="router.push('/')">Kembali ke Beranda</BaseButton>
    </div>

    <div v-else class="pb-24 md:pb-8 mb-24">
      <div class="relative">
        <div class="h-56 md:h-80 bg-surface-variant overflow-hidden rounded-t-2xl">
          <img
            v-if="currentImage"
            :src="optimizeUrl(currentImage)"
            :alt="event.title"
            class="w-full h-full object-cover transition-all duration-300 "
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <span class="material-symbols-outlined text-6xl text-text-muted">event</span>
          </div>
        </div>

        <div v-if="allImages.length > 1" class="flex gap-2 px-4 pt-3 pb-1 overflow-x-auto">
          <button
            v-for="(img, i) in allImages"
            :key="i"
            class="w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer"
            :class="i === selectedImageIndex ? 'border-primary ring-2 ring-primary/30' : 'border-transparent opacity-60 hover:opacity-100'"
            @click="selectedImageIndex = i"
          >
            <img :src="optimizeUrl(img)" class="w-full h-full object-cover" />
          </button>
        </div>
        <div class="absolute top-4 left-4 md:top-6 md:left-6">
          <div class="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-full px-3 py-2 shadow-sm">
            <BackButton />
          </div>
        </div>
      </div>

      <div class="max-w-screen-md mx-auto px-4 md:px-6 -mt-6 relative">
        <div class="bg-surface-card rounded-2xl border border-border/50 p-6 shadow-sm">
          <div class="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 class="text-2xl md:text-3xl font-heading font-bold text-text-heading mb-2">{{ event.title }}</h1>
              <div class="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                <span v-if="event.category" class="px-2.5 py-1 rounded-full bg-primary/5 text-primary text-xs font-semibold">{{ event.category }}</span>
                <span class="px-2.5 py-1 rounded-full bg-surface-variant text-text-muted text-xs font-semibold">{{ event.event_format || 'offline' }}</span>
                <span v-if="event.visibility === 'private'" class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">Acara Pribadi</span>
              </div>
            </div>
          </div>
          <div v-if="isAdmin" class="mb-4 rounded-2xl border border-teal-500/30 bg-teal-50/80 p-4 text-teal-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-teal-500">admin_panel_settings</span>
              <p class="text-sm font-semibold">Kamu adalah Admin</p>
            </div>
            <BaseButton variant="primary" size="sm" @click="router.push(`/events/${eventId}/manage/overview`)">
              Kelola Acara
            </BaseButton>
          </div>

          <div class="space-y-3 mb-6">
            <div class="flex items-start gap-3 text-sm">
              <span class="material-symbols-outlined text-lg text-primary mt-0.5">calendar_month</span>
              <div>
                <p class="text-text-heading font-semibold">{{ formatDate(event.date) }}</p>
                <p class="text-text-muted">{{ timeRangeLabel }}</p>
              </div>
            </div>
            <div v-if="event.location" class="flex items-start gap-3 text-sm">
              <span class="material-symbols-outlined text-lg text-primary mt-0.5">location_on</span>
              <div>
                <p class="text-text-heading">{{ event.location }}</p>
                <p v-if="event.location_detail" class="text-text-muted text-xs mt-0.5">{{ event.location_detail }}</p>
              </div>
            </div>
            <div v-if="event.location || (event.location_lat && event.location_lng)" class="mt-3">
              <div class="relative rounded-xl border border-border/50 overflow-hidden">
                <div v-if="mapLoading" class="absolute inset-0 bg-surface-variant flex items-center justify-center">
                  <span class="material-symbols-outlined text-3xl text-text-muted animate-spin">progress_activity</span>
                </div>
                <div v-else-if="mapError" class="absolute inset-0 bg-surface-variant flex items-center justify-center">
                  <p class="text-sm text-text-muted">{{ mapError }}</p>
                </div>
                <div ref="mapContainer" class="w-full min-h-[250px] md:min-h-[300px]"></div>
              </div>
              <div v-if="event.location_lat && event.location_lng" class="mt-1.5 flex items-center justify-between">
                <p class="text-xs text-text-muted font-mono">{{ Number(event.location_lat).toFixed(6) }}, {{ Number(event.location_lng).toFixed(6) }}</p>
                <div class="flex items-center gap-2">
                  <button @click="copyCoordinates" class="text-xs text-primary hover:underline flex items-center gap-0.5 cursor-pointer">
                    <span class="material-symbols-outlined text-sm">{{ copied ? 'check' : 'content_copy' }}</span>
                    {{ copied ? 'Tersalin' : 'Salin' }}
                  </button>
                  <a :href="`https://www.google.com/maps?q=${event.location_lat},${event.location_lng}`" target="_blank" class="text-xs text-primary hover:underline flex items-center gap-0.5">
                    <span class="material-symbols-outlined text-sm">open_in_new</span>
                    Buka Maps
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div v-if="event.description" class="mb-6">
            <h3 class="text-sm font-semibold text-text-heading mb-2 uppercase tracking-wide">Tentang Acara</h3>
            <p class="text-sm text-text leading-relaxed whitespace-pre-line">{{ event.description }}</p>
          </div>
        </div>

        <div class="mt-6">
          <h2 class="text-lg font-heading font-bold text-text-heading mb-4">Pilih Tiket</h2>
          <div v-if="isAllSoldOut" class="mb-4 p-4 rounded-2xl bg-error/10 border border-error/20 text-center">
            <span class="material-symbols-outlined text-3xl text-error mb-1">block</span>
            <p class="text-sm font-semibold text-error">Tiket Habis</p>
            <p class="text-xs text-text-muted mt-0.5">Semua tiket untuk acara ini sudah terjual</p>
          </div>
          <div class="space-y-4">
            <div v-for="tier in (event.ticket_tiers || [])" :key="tier.id" class="bg-surface-card rounded-2xl border border-border/50 p-5 relative overflow-hidden">
              <div class="flex items-start justify-between mb-3">
                <div>
                  <h3 class="text-headline-sm font-heading font-semibold text-text-heading">
                    <span class="inline-block w-3 h-3 rounded-full mr-2 align-middle" :style="{ backgroundColor: tier.color || '#6C63FF' }"></span>
                    {{ tier.name || 'Regular' }}
                  </h3>
                  <p class="text-sm text-text-muted mt-0.5">{{ tier.description || '' }}</p>
                </div>
                <div class="flex flex-col items-end gap-1.5">
                  <p class="text-lg font-heading font-bold text-primary">Rp {{ (tier.price || 0).toLocaleString('id-ID') }}</p>
                  <span v-if="tier.seat_tier" class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                    Wajib Kursi
                  </span>
                </div>
              </div>
              <div class="flex items-center justify-between pt-3 border-t border-dashed border-border/50">
                <p class="text-xs text-text-muted">
                  <span v-if="isTierSoldOut(tier)" class="text-error font-semibold">Habis</span>
                  <span>{{ tier.quota - tier.sold_count - (quantities[tier.id] || 0) }} slot tersisa</span>
                </p>
                <div class="flex items-center gap-3">
                  <button
                    class="w-9 h-9 rounded-full border-2 border-border flex items-center justify-center text-text-heading hover:border-primary hover:text-primary transition-all cursor-pointer"
                    @click="decrement(tier.id)"
                    :class="{ 'opacity-30 pointer-events-none': isTierSoldOut(tier) }"
                  >
                    <span class="material-symbols-outlined text-lg">remove</span>
                  </button>
                  <span class="w-8 text-center font-bold text-text-heading">{{ isTierSoldOut(tier) ? '—' : (quantities[tier.id] || 0) }}</span>
                  <button
                    class="w-9 h-9 rounded-full border-2 border-border flex items-center justify-center text-text-heading hover:border-primary hover:text-primary transition-all cursor-pointer"
                    @click="increment(tier.id)"
                    :class="{ 'opacity-30 pointer-events-none': isTierSoldOut(tier) }"
                  >
                    <span class="material-symbols-outlined text-lg">add</span>
                  </button>

                </div>
              </div>
              <div v-if="tier.seat_tier && (quantities[tier.id] || 0) > 0" class="mt-2 flex items-center gap-2 text-xs">
                <span class="text-text-muted">Kursi dipilih:</span>
                <span :class="getSeatsSelectedForTier(tier.id) === getSeatsNeededForTier(tier.id) ? 'text-teal-600 font-semibold' : 'text-amber-600 font-semibold'">
                  {{ getSeatsSelectedForTier(tier.id) }}/{{ getSeatsNeededForTier(tier.id) }}
                </span>
                <span v-if="getSeatsSelectedForTier(tier.id) === getSeatsNeededForTier(tier.id)" class="text-teal-600">
                  <span class="material-symbols-outlined text-sm align-middle">check_circle</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="seatMapEnabled" class="mt-6 border-t border-border/50 pt-6">
        <h2 class="text-lg font-heading font-bold text-text-heading mb-3 text-center">Pilih Kursi</h2>
        <div v-if="seatTiersWithQuantity.length > 1" class="flex gap-2 mb-4 justify-center overflow-x-auto scrollbar-hide">
          <button
            v-for="tier in seatTiersWithQuantity"
            :key="tier.id"
            @click="activeSeatTierId = tier.id"
            class="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer"
            :class="activeSeatTierId === tier.id ? 'bg-primary text-white' : 'bg-surface-variant text-text-muted hover:bg-primary/10'"
          >
            {{ tier.name }} ({{ getSeatsSelectedForTier(tier.id) }}/{{ getSeatsNeededForTier(tier.id) }})
          </button>
        </div>
        <template v-if="filteredSeatsForActiveTier.length > 0 && activeSeatTierId">
          <SeatSelector
            v-if="authToken"
            :seats="filteredSeatsForActiveTier"
            :gridX="seatMapGrid.gridX"
            :gridY="seatMapGrid.gridY"
            :tiers="seatTiers"
            :sessionId="sessionId"
            :authToken="authToken"
            :maxSeats="getSeatsNeededForTier(activeSeatTierId)"
            :activeTierId="activeSeatTierId"
            :initialSelectedIds="seatsByTier[activeSeatTierId] || []"
            :allSelectedIds="allSelectedSeatIds"
            @change="(ids: string[]) => onTierSeatChange(activeSeatTierId, ids)"
          />
        </template>
        <div v-else class="bg-surface-card rounded-xl border border-border/50 p-8 text-center mx-5">
          <span class="material-symbols-outlined text-4xl text-text-muted mb-3">event_seat</span>
          <h3 class="text-sm font-semibold text-text-heading mb-1">Kursi Belum Tersedia</h3>
          <p class="text-xs text-text-muted">Yuk pilih tier tiket dengan kursi yang tersedia!</p>
        </div>
      </div>

      <div v-if="totalPrice > 0 && !isCreator" class="fixed bottom-16 md:bottom-0 left-0 right-0 md:static md:mt-6 bg-surface-card border-t border-border/50 md:border md:rounded-2xl md:border-border/50 p-4 md:p-6 max-w-screen-md md:mx-auto z-40">
        <p v-if="requestError" class="text-sm text-error mb-3 text-center">{{ requestError }}</p>
        <div class="max-w-screen-md mx-auto flex items-center justify-between">
          <div class="min-w-[80px] mb-2">
            <p class="text-xs text-text-muted">Total</p>
            <div class="flex items-center gap-1">
              <p class="text-xl font-heading font-bold text-text-heading">Rp</p>
              <p class="text-2xl font-heading font-bold text-text-heading">{{ totalPrice.toLocaleString('id-ID') }}</p>
            </div>
            
            <p v-if="seatMapEnabled && hasSeatTierSelected" class="text-xs text-primary mt-1">
              {{ allSelectedSeatIds.length }} kursi dipilih
            </p>
          </div>
          <div class="flex flex-col gap-1 items-end">
            <template v-for="tier in seatTiersWithQuantity" :key="tier.id">
              <p v-if="getSeatsSelectedForTier(tier.id) < getSeatsNeededForTier(tier.id)" class="text-xs text-amber-600">
                {{ tier.name }}: pilih {{ getSeatsNeededForTier(tier.id) - getSeatsSelectedForTier(tier.id) }} kursi lagi
              </p>
            </template>
            <div class="max-w-[300px]">
              <HCaptcha
                class="transform scale-[0.65] origin-right -translate-x-1 -translate-y-1 max-w-[150px]:"
                ref="captchaRef"
                :sitekey="hCaptchaSiteKey"
                size="compact"
                @verify="onCaptchaVerified"
                @expired="onCaptchaExpired"
              />
            </div>
            
            <BaseButton variant="primary" size="lg" :disabled="!canPurchase || !captchaToken || isAllSoldOut" :loading="requestLoading" @click="handleRequestTicket">
              {{ requestLoading ? 'Memproses...' : isAllSoldOut ? 'Tiket Habis' : 'Minta Tiket' }}
            </BaseButton>
          </div>
        </div>
      </div>

      <div v-if="isCreator" class="fixed bottom-16 md:bottom-0 left-0 right-0 md:static md:mt-6 bg-surface-card border-t border-border/50 md:border md:rounded-2xl md:border-border/50 p-4 md:p-6 max-w-screen-md md:mx-auto z-40">
        <div class="max-w-screen-md mx-auto text-center">
          <p class="text-sm text-text-muted">
            <span class="material-symbols-outlined text-lg align-middle mr-1">star</span>
            Kamu adalah penyelenggara acara ini
          </p>
        </div>
      </div>

    </div>
  </div>
  </AppLayout>
</template>

<style scoped>
:deep(.leaflet-container) {
  z-index: 10;
}
</style>
