<script setup lang="ts">
import { fetchWithRetry } from '@/lib/api'
import { ref, computed, watch, onMounted, nextTick, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import AppLayout from '@/components/layout/AppLayout.vue'
import BackButton from '@/components/shared/BackButton.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import SeatSelector from '@/components/seats/SeatSelector.vue'
import type { SeatData, TierInfo } from '@/components/seats/SeatMap.vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const route = useRoute()
const router = useRouter()

const { user } = useAuth()

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

const allSelectedSeatIds = computed(() =>
  Object.values(seatsByTier.value).flat()
)

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
  if (!mapContainer.value) return

  mapInstance = L.map(mapContainer.value, {
    center: [lat, lng],
    zoom: 15,
    zoomControl: false
  })

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapInstance)

  L.marker([lat, lng]).addTo(mapInstance)

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

const increment = (tierId: string) => {
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

const handleRequestTicket = async () => {
  if (!event.value?.ticket_tiers) return

  const items = event.value.ticket_tiers
    .map((tier: any) => ({
      tier_name: tier.name || 'Regular',
      quantity: quantities.value[tier.id] || 0
    }))
    .filter((item: any) => item.quantity > 0)

  if (items.length === 0) return

  requestLoading.value = true
  requestError.value = ''

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      router.push('/login')
      return
    }

    const body: any = { event_id: event.value.id, items }

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

    const allSeatIds = Object.values(seatsByTier.value).flat()
    if (allSeatIds.length > 0) {
      body.seat_ids = allSeatIds
      body.seat_tier_map = { ...seatsByTier.value }
    }

    const res = await fetchWithRetry('/api/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(body)
    })

    const data = await res.json()

    if (!res.ok) {
      if (res.status === 403 && data.error?.includes('Kreator')) {
        requestError.value = 'Kamu adalah penyelenggara acara ini'
      } else {
        requestError.value = data.error || 'Gagal memesan tiket'
      }
      return
    }

    router.push('/tickets')
  } catch {
    requestError.value = 'Terjadi kesalahan, silakan coba lagi'
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
    const headers: Record<string, string> = {}
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`
      authToken.value = session.access_token
    }
    const res = await fetch(`/api/events/${eventId}`, { headers })
    if (res.ok) {
      const data = await res.json()
      event.value = data.event
      if (data.adminRole) {
        adminRoles.value = data.adminRole
      }

      if (event.value?.seat_map) {
        const sm = typeof event.value.seat_map === 'string'
          ? JSON.parse(event.value.seat_map)
          : event.value.seat_map
        if (sm && sm.gridX && sm.gridY) {
          seatMapEnabled.value = true
          seatMapGrid.value = { gridX: sm.gridX, gridY: sm.gridY }
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

      if (event.value?.location_lat && event.value?.location_lng) {
        initMap(event.value.location_lat, event.value.location_lng)
      } else if (event.value?.location) {
        geocodeLocation(event.value.location)
      }
    }

    if (seatMapEnabled.value) {
      await loadSeats()
    }
  } catch {
    // fallback
  } finally {
    loading.value = false
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
    <div v-if="loading" class="flex items-center justify-center min-h-[60vh]">
      <span class="material-symbols-outlined text-4xl text-primary animate-spin">sync</span>
    </div>

    <div v-else-if="!event" class="text-center py-20 px-6">
      <span class="material-symbols-outlined text-5xl text-text-muted mb-4">event_busy</span>
      <h2 class="text-xl font-heading font-bold text-text-heading mb-2">Acara tidak ditemukan</h2>
      <p class="text-sm text-text-muted mb-6">Acara yang kamu cari tidak tersedia.</p>
      <BaseButton variant="primary" @click="router.push('/')">Kembali ke Beranda</BaseButton>
    </div>

    <div v-else class="pb-24 md:pb-8">
      <div class="relative">
        <div class="h-56 md:h-80 bg-surface-variant overflow-hidden">
          <img
            v-if="currentImage"
            :src="optimizeUrl(currentImage)"
            :alt="event.title"
            class="w-full h-full object-cover transition-all duration-300"
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
              </div>
            </div>
          </div>

          <div class="space-y-3 mb-6">
            <div class="flex items-start gap-3 text-sm">
              <span class="material-symbols-outlined text-lg text-primary mt-0.5">calendar_month</span>
              <div>
                <p class="text-text-heading font-semibold">{{ formatDate(event.date) }}</p>
                <p class="text-text-muted">{{ formatTime(event.date) }} WIB</p>
              </div>
            </div>
            <div v-if="event.location" class="flex items-start gap-3 text-sm">
              <span class="material-symbols-outlined text-lg text-primary mt-0.5">location_on</span>
              <div>
                <p class="text-text-heading">{{ event.location }}</p>
                <p v-if="event.location_detail" class="text-text-muted text-xs mt-0.5">{{ event.location_detail }}</p>
              </div>
            </div>
            <div v-if="event.location" class="mt-3">
              <div class="relative h-48 rounded-xl border border-border/50 overflow-hidden">
                <div v-if="mapLoading" class="absolute inset-0 bg-surface-variant flex items-center justify-center z-[1000]">
                  <span class="material-symbols-outlined text-3xl text-text-muted animate-spin">progress_activity</span>
                </div>
                <div v-else-if="mapError" class="absolute inset-0 bg-surface-variant flex items-center justify-center z-[1000]">
                  <p class="text-sm text-text-muted">{{ mapError }}</p>
                </div>
                <div ref="mapContainer" class="h-full w-full"></div>
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
                  <span v-if="tier.quota > 0">{{ tier.quota - (quantities[tier.id] || 0) }} slot tersisa</span>
                  <span v-else>Kuota tidak terbatas</span>
                </p>
                <div class="flex items-center gap-3">
                  <button
                    class="w-9 h-9 rounded-full border-2 border-border flex items-center justify-center text-text-heading hover:border-primary hover:text-primary transition-all cursor-pointer"
                    @click="decrement(tier.id)"
                  >
                    <span class="material-symbols-outlined text-lg">remove</span>
                  </button>
                  <span class="w-8 text-center font-bold text-text-heading">{{ quantities[tier.id] || 0 }}</span>
                  <button
                    class="w-9 h-9 rounded-full border-2 border-border flex items-center justify-center text-text-heading hover:border-primary hover:text-primary transition-all cursor-pointer"
                    @click="increment(tier.id)"
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

      <div v-if="seatMapEnabled" class="mt-6">
        <h2 class="text-lg font-heading font-bold text-text-heading mb-3">Pilih Kursi</h2>
        <div v-if="seatTiersWithQuantity.length > 1" class="flex gap-2 mb-4 overflow-x-auto">
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
        <div v-else class="bg-surface-card rounded-xl border border-border/50 p-8 text-center">
          <span class="material-symbols-outlined text-4xl text-text-muted mb-3">event_seat</span>
          <h3 class="text-sm font-semibold text-text-heading mb-1">Kursi Belum Tersedia</h3>
          <p class="text-xs text-text-muted">Penyelenggara belum mengatur konfigurasi kursi untuk acara ini.</p>
        </div>
      </div>

      <div v-if="totalPrice > 0 && !isCreator" class="fixed bottom-16 md:bottom-0 left-0 right-0 md:static md:mt-6 bg-surface-card border-t border-border/50 md:border md:rounded-2xl md:border-border/50 p-4 md:p-6 max-w-screen-md md:mx-auto z-40">
        <p v-if="requestError" class="text-sm text-error mb-3 text-center">{{ requestError }}</p>
        <div class="max-w-screen-md mx-auto flex items-center justify-between">
          <div>
            <p class="text-xs text-text-muted">Total</p>
            <p class="text-xl font-heading font-bold text-text-heading">Rp {{ totalPrice.toLocaleString('id-ID') }}</p>
            <p v-if="seatMapEnabled && hasSeatTierSelected" class="text-xs text-primary mt-1">
              {{ Object.values(seatsByTier).flat().length }} kursi dipilih
            </p>
          </div>
          <div class="flex flex-col gap-1 items-end">
            <template v-for="tier in seatTiersWithQuantity" :key="tier.id">
              <p v-if="getSeatsSelectedForTier(tier.id) < getSeatsNeededForTier(tier.id)" class="text-xs text-amber-600">
                {{ tier.name }}: pilih {{ getSeatsNeededForTier(tier.id) - getSeatsSelectedForTier(tier.id) }} kursi lagi
              </p>
            </template>
            <BaseButton variant="primary" size="lg" :disabled="!canPurchase" :loading="requestLoading" @click="handleRequestTicket">
              {{ requestLoading ? 'Memproses...' : 'Minta Tiket' }}
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

      <div v-else-if="isAdmin" class="fixed bottom-16 md:bottom-0 left-0 right-0 md:static md:mt-6 bg-surface-card border border-teal-500/30 md:rounded-2xl p-4 md:p-6 max-w-screen-md md:mx-auto z-40">
        <div class="max-w-screen-md mx-auto">
          <div class="flex items-center gap-2 mb-2">
            <span class="material-symbols-outlined text-teal-500 text-lg">admin_panel_settings</span>
            <p class="text-sm font-semibold text-teal-600">Kamu adalah Admin acara ini</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <BaseButton variant="primary" size="sm" @click="router.push(`/admin/events/${eventId}/queue`)">
              Antrian Tiket
            </BaseButton>
            <BaseButton variant="secondary" size="sm" @click="router.push(`/admin/events/${eventId}/chat`)">
              Chat
            </BaseButton>
            <BaseButton variant="secondary" size="sm" @click="router.push(`/admin/events/${eventId}/scanner`)">
              Scan QR
            </BaseButton>
            <BaseButton variant="secondary" size="sm" @click="router.push(`/admin/events/${eventId}/attendance`)">
              Kehadiran
            </BaseButton>
          </div>
          <div v-if="adminRoles && adminRoles.length > 0" class="mt-2 flex gap-1">
            <span v-for="r in adminRoles" :key="r" class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600">
              {{ r }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
  </AppLayout>
</template>
