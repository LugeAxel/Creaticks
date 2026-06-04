<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

import BackButton from '@/components/shared/BackButton.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import { useToast } from '@/composables/useToast'
import { useCloudinary } from '@/composables/useCloudinary'
import { useTeamManagement } from '@/composables/useTeamManagement'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import SeatEditor from '@/components/seats/SeatEditor.vue'
import type { EditorSeat } from '@/components/seats/SeatEditor.vue'
import HCaptcha from '@/components/shared/HCaptcha.vue'

const router = useRouter()
const route = useRoute()
const { session } = useAuth()
const { upload } = useCloudinary()
const { searchResults, searchUsers, inviteUser } = useTeamManagement()
const { showToast } = useToast()

const eventIdParam = computed(() => (route.params.id as string) || (route.params.eventId as string))
const isEditing = computed(() => !!eventIdParam.value)
const loadingEvent = ref(false)
const currentStep = ref(1)
const totalSteps = 4
const saving = ref(false)
const error = ref('')
const captchaToken = ref('')
const captchaRef = ref<InstanceType<typeof HCaptcha>>()

const onCaptchaVerified = (token: string) => {
  captchaToken.value = token
}

const onCaptchaExpired = () => {
  captchaToken.value = ''
}

const hCaptchaSiteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY

const stepLabels = ['Info Event', 'Tiket', 'Tim', 'Publikasi']

const eventData = ref({
  title: '',
  description: '',
  banner_url: '',
  category: '',
  event_format: 'offline',
  visibility: 'public',
  date: '',
  event_start_time: '',
  event_end_time: '',
  timezone: 'Asia/Jakarta',
  location: '',
  location_lat: null as number | null,
  location_lng: null as number | null,
  location_detail: '',
  status: 'draft'
})

const TIER_COLORS = ['#6C63FF','#FF6584','#43C6AC','#FFB347','#9B59B6','#3498DB','#E74C3C','#2ECC71']

interface TicketTier {
  id: number
  name: string
  price: number
  limit: number
  description: string
  color: string
  seat_tier: boolean
}

const ticketTiers = ref<TicketTier[]>([])

const useSeatMap = ref(false)
const hasExistingSeats = ref(false)
const seatMapData = ref<{ gridX: number; gridY: number; seats: EditorSeat[] }>({
  gridX: 25,
  gridY: 20,
  seats: []
})

interface InviteEntry {
  userId: string
  name: string
  roles: string[]
}

const invitedAdmins = ref<InviteEntry[]>([])

const inviteSearch = ref('')
const selectedUserId = ref('')
const selectedUserDisplay = ref('')
const selectedRoles = ref<string[]>([])
const inviteError = ref('')

const categoryOptions = ['Teknologi', 'Musik', 'Seni', 'Workshop', 'Olahraga', 'Bisnis', 'Lainnya']
const formatOptions = [
  { value: 'offline', label: 'Offline' },
  { value: 'online', label: 'Online' },
  { value: 'hybrid', label: 'Hybrid' }
]

const canContinue = computed(() => {
  if (currentStep.value === 1) {
    return eventData.value.title.trim().length > 0 && eventData.value.date.length > 0 && eventData.value.event_start_time.length > 0 && eventData.value.event_end_time.length > 0
  }
  if (currentStep.value === 2) {
    return ticketTiers.value.length > 0
  }
  return true
})

const paintedSeatCountPerTier = computed(() => {
  const counts: Record<string, number> = {}
  if (!useSeatMap.value) return counts
  for (const seat of seatMapData.value.seats ?? []) {
    if (seat.tier) {
      counts[seat.tier] = (counts[seat.tier] || 0) + 1
    }
  }
  return counts
})

// Seat booking conflict state
const seatConflictModal = ref(false)
const bookedSeatsData = ref<Array<{ id: string; seat_code: string; x: number; y: number; status: string }>>([])
const seatReassignments = ref<Record<string, { newX: number; newY: number }>>({})
const pendingSeatSaveAction = ref<'draft' | 'publish' | null>(null)

async function generateSeats(eventId: string, token: string) {
  const res = await fetch(`/api/events/${eventId}/seats/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(seatMapData.value)
  })
  if (res.status === 409) {
    const data = await res.json()
    if (data.code === 'BOOKED_SEATS_EXIST') {
      bookedSeatsData.value = data.bookedSeats || []
      seatReassignments.value = {}
      for (const s of data.bookedSeats || []) {
        seatReassignments.value[s.id] = { newX: s.x, newY: s.y }
      }
      seatConflictModal.value = true
      return false
    }
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    error.value = data.error || 'Gagal generate kursi'
    return false
  }
  return true
}

async function submitReassignments() {
  const token = (await session.value?.access_token) || ''
  const eventId = eventIdParam.value

  const changedSeats = Object.entries(seatReassignments.value)
    .filter(([id, pos]) => {
      const original = bookedSeatsData.value.find(s => s.id === id)
      return original && (pos.newX !== original.x || pos.newY !== original.y)
    })
    .map(([id, pos]) => ({ id, x: pos.newX, y: pos.newY }))

  if (changedSeats.length > 0) {
    const res = await fetch(`/api/events/${eventId}/seats/reassign`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ seats: changedSeats })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      error.value = data.error || 'Gagal memperbarui posisi kursi'
      return
    }
  }

  seatConflictModal.value = false

  // Retry generate
  const success = await generateSeats(eventId, token)
  if (success) {
    router.push({ name: 'creator-dashboard' })
  }
}

const galleryUrls = ref<string[]>([])
const galleryUploading = ref(false)

// Leaflet map for location picker
const mapContainer = ref<HTMLDivElement | null>(null)
let mapInstance: L.Map | null = null
let marker: L.Marker | null = null
const mapError = ref('')

const initMap = () => {
  nextTick(() => {
    if (!mapContainer.value) return
    if (mapInstance) return

    const defaultLat = eventData.value.location_lat ?? -6.2002
    const defaultLng = eventData.value.location_lng ?? 106.8204

    mapInstance = L.map(mapContainer.value, {
      center: [defaultLat, defaultLng],
      zoom: 13,
      zoomControl: true
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance)

    if (eventData.value.location_lat && eventData.value.location_lng) {
      marker = L.marker([eventData.value.location_lat, eventData.value.location_lng], { draggable: true }).addTo(mapInstance)
      marker.on('dragend', onMarkerDrag)
    }

    mapInstance.on('click', (e: L.LeafletMouseEvent) => {
      placeMarker(e.latlng.lat, e.latlng.lng)
    })
  })
}

const placeMarker = (lat: number, lng: number) => {
  if (marker) {
    marker.setLatLng([lat, lng])
  } else {
    marker = L.marker([lat, lng], { draggable: true }).addTo(mapInstance!)
    marker.on('dragend', onMarkerDrag)
  }
  eventData.value.location_lat = lat
  eventData.value.location_lng = lng
  if (!eventData.value.location) {
    reverseGeocode(lat, lng)
  }
}

const onMarkerDrag = () => {
  if (!marker) return
  const pos = marker.getLatLng()
  eventData.value.location_lat = pos.lat
  eventData.value.location_lng = pos.lng
}

const reverseGeocode = async (lat: number, lng: number) => {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
    if (res.ok) {
      const data = await res.json()
      const display = data.display_name?.split(',')[0] || ''
      eventData.value.location = display
    }
  } catch {
    // silent
  }
}

const removeMap = () => {
  mapInstance?.remove()
  mapInstance = null
  marker = null
}

// Location search via Nominatim
const locSearchQuery = ref('')
const locSearchResults = ref<any[]>([])
const locSearching = ref(false)
const locShowDropdown = ref(false)
let locSearchTimer: ReturnType<typeof setTimeout> | null = null
const locSearchContainer = ref<HTMLDivElement | null>(null)

const searchLocation = async (q: string) => {
  if (!q.trim()) { locSearchResults.value = []; return }
  locSearching.value = true
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`)
    if (res.ok) locSearchResults.value = await res.json()
  } catch {
    locSearchResults.value = []
  } finally {
    locSearching.value = false
  }
}

const selectResult = (r: any) => {
  const lat = parseFloat(r.lat)
  const lng = parseFloat(r.lon)
  eventData.value.location = r.display_name?.split(',')[0] || r.display_name || ''
  eventData.value.location_lat = lat
  eventData.value.location_lng = lng
  locShowDropdown.value = false
  locSearchQuery.value = eventData.value.location

  removeMap()
  nextTick(() => {
    if (!mapContainer.value) return
    mapInstance = L.map(mapContainer.value, {
      center: [lat, lng],
      zoom: 15,
      zoomControl: true
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance)
    marker = L.marker([lat, lng], { draggable: true }).addTo(mapInstance)
    marker.on('dragend', onMarkerDrag)
    mapInstance.on('click', (e: L.LeafletMouseEvent) => {
      placeMarker(e.latlng.lat, e.latlng.lng)
    })
  })
}

watch(locSearchQuery, (q) => {
  if (locSearchTimer) clearTimeout(locSearchTimer)
  if (!q.trim()) { locSearchResults.value = []; locShowDropdown.value = false; return }
  locShowDropdown.value = true
  locSearchTimer = setTimeout(() => searchLocation(q), 400)
})

// Coordinate paste input
const coordInput = ref('')
const coordError = ref('')
const showCoordInput = ref(false)
let coordTimer: ReturnType<typeof setTimeout> | null = null

function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const cleaned = input.replace(/[°º]/g, '').trim()
  const parts = cleaned.split(/[,;]\s*|\s+/).filter(Boolean)
  if (parts.length < 2) return null
  const lat = parseFloat(parts[0].replace(',', '.'))
  const lng = parseFloat(parts[1].replace(',', '.'))
  if (isNaN(lat) || isNaN(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function applyCoordInput(val: string) {
  if (!val.trim()) { coordError.value = ''; return }
  const coords = parseCoordinates(val)
  if (!coords) {
    coordError.value = 'Format: lintang, bujur (contoh: -7.7717, 110.3771)'
    return
  }
  coordError.value = ''
  eventData.value.location_lat = coords.lat
  eventData.value.location_lng = coords.lng
  if (!eventData.value.location) reverseGeocode(coords.lat, coords.lng)
  removeMap()
  nextTick(() => initMap())
}

watch(coordInput, (val) => {
  if (coordTimer) clearTimeout(coordTimer)
  coordTimer = setTimeout(() => applyCoordInput(val), 500)
})

watch(() => eventData.value.event_format, (fmt) => {
  if (fmt === 'online') {
    removeMap()
  }
})

onMounted(() => {
  document.addEventListener('click', (e: MouseEvent) => {
    if (locSearchContainer.value && !locSearchContainer.value.contains(e.target as Node)) {
      locShowDropdown.value = false
    }
  })
})

const handleBannerUpload = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !session.value) return
  try {
    const result = await upload(file, session.value.access_token, 'event-banners')
    eventData.value.banner_url = result.url
  } catch (err: any) {
    showToast(err.message || 'Gagal mengunggah banner', 'error')
  }
}

const handleGalleryUpload = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || !session.value) return
  galleryUploading.value = true
  try {
    const remaining = 6 - galleryUrls.value.length
    const toUpload = Array.from(files).slice(0, remaining)
    for (const file of toUpload) {
      const result = await upload(file, session.value.access_token, 'event-gallery')
      galleryUrls.value.push(result.url)
    }
  } catch (err: any) {
    showToast(err.message || 'Gagal mengunggah galeri', 'error')
  } finally {
    galleryUploading.value = false
    input.value = ''
  }
}

const removeGalleryImage = (idx: number) => {
  galleryUrls.value.splice(idx, 1)
}

const extractTime = (dateStr: string) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

const TIMEZONE_OFFSETS: Record<string, string> = {
  'Asia/Jakarta': '+07:00',
  'Asia/Makassar': '+08:00',
  'Asia/Jayapura': '+09:00',
}

function formatDateWithTimezone(date: string, time: string, timezone: string): string {
  const offset = TIMEZONE_OFFSETS[timezone] || '+00:00'
  return `${date}T${time || '00:00'}:00${offset}`
}

onMounted(async () => {
  if (!isEditing.value) return
  loadingEvent.value = true
  try {
    const res = await fetch(`/api/events/${eventIdParam.value}`, {
      headers: { Authorization: `Bearer ${session.value?.access_token}` }
    })
    if (!res.ok) {
      showToast('Gagal memuat data acara', 'error')
      router.push('/events/saya')
      return
    }
    const data = await res.json()
    const ev = data.event
    eventData.value = {
      title: ev.title || '',
      description: ev.description || '',
      banner_url: ev.banner_url || '',
      category: ev.category || '',
      event_format: ev.event_format || 'offline',
      visibility: ev.visibility || 'public',
      date: ev.date ? ev.date.slice(0, 10) : '',
      event_start_time: ev.event_start_time ? ev.event_start_time.slice(0, 5) : (ev.date ? extractTime(ev.date) : ''),
      event_end_time: ev.event_end_time ? ev.event_end_time.slice(0, 5) : '',
      timezone: ev.timezone || 'Asia/Jakarta',
      location: ev.location || '',
      location_lat: ev.location_lat ?? null,
      location_lng: ev.location_lng ?? null,
      location_detail: ev.location_detail || '',
      status: ev.status || 'draft'
    }
    galleryUrls.value = ev.gallery_urls || []
    if (ev.ticket_tiers && ev.ticket_tiers.length > 0) {
      ticketTiers.value = ev.ticket_tiers.map((t: any) => ({
        id: Date.now() + Math.random(),
        name: t.name || 'Regular',
        price: t.price || 0,
        limit: t.quota || 0,
        description: t.description || '',
        color: t.color || TIER_COLORS[0],
        seat_tier: t.seat_tier || false
      }))
    }

    if (ev.seat_map) {
      useSeatMap.value = true
      hasExistingSeats.value = true
      seatMapData.value = typeof ev.seat_map === 'string' ? JSON.parse(ev.seat_map) : ev.seat_map
    } else {
      useSeatMap.value = false
    }
  } catch {
    error.value = 'Gagal memuat data acara'
  } finally {
    loadingEvent.value = false
  }

  if (eventData.value.event_format !== 'online') {
    nextTick(() => initMap())
  }
})

const addTier = () => {
  const usedColors = new Set(ticketTiers.value.map(t => t.color))
  const nextColor = TIER_COLORS.find(c => !usedColors.has(c)) || TIER_COLORS[ticketTiers.value.length % TIER_COLORS.length]
  ticketTiers.value.push({
    id: Date.now(),
    name: '',
    price: 0,
    limit: 1,
    description: '',
    color: nextColor,
    seat_tier: false
  })
}

const removeTier = (id: number) => {
  ticketTiers.value = ticketTiers.value.filter(t => t.id !== id)
}

const nextStep = () => {
  if (currentStep.value < totalSteps) {
    error.value = ''
    currentStep.value++
  }
}

const prevStep = () => {
  if (currentStep.value > 1) {
    error.value = ''
    currentStep.value--
  }
}

const handleSaveDraft = async () => {
  saving.value = true
  error.value = ''
  const token = (await session.value?.access_token) || ''

  if (!isEditing.value && !captchaToken.value) {
    error.value = 'Harap selesaikan verifikasi keamanan'
    saving.value = false
    return
  }

  try {
    const dateStr = eventData.value.date
      ? formatDateWithTimezone(eventData.value.date, eventData.value.event_start_time, eventData.value.timezone)
      : new Date().toISOString()

    const url = isEditing.value ? `/api/events/${eventIdParam.value}` : '/api/events'
    const res = await fetch(url, {
      method: isEditing.value ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        ...eventData.value,
        date: dateStr,
        event_start_time: eventData.value.event_start_time || null,
        event_end_time: eventData.value.event_end_time || null,
        timezone: eventData.value.timezone || 'Asia/Jakarta',
        status: 'draft',
        gallery_urls: galleryUrls.value,
        ticket_tiers: ticketTiers.value,
        invited_admins: invitedAdmins.value,
        seat_map: useSeatMap.value ? seatMapData.value : null,
        ...(!isEditing.value ? { captchaToken: captchaToken.value } : {})
      })
    })

    if (!res.ok) {
      const data = await res.json()
      error.value = data.error || 'Gagal menyimpan acara'
      captchaToken.value = ''
      captchaRef.value?.reset()
      saving.value = false
      return
    }

    const savedEvent = await res.json()
    const eventId = savedEvent.event?.id || eventIdParam.value

    showToast(isEditing.value ? 'Acara berhasil diperbarui' : 'Acara berhasil disimpan', 'success')

    // Auto-generate seats if seat map is enabled
    if (useSeatMap.value && seatMapData.value.seats.length > 0) {
      try {
        const ok = await generateSeats(eventId, token)
        if (!ok && seatConflictModal.value) {
          pendingSeatSaveAction.value = 'draft'
          saving.value = false
          return
        }
      } catch {
        showToast('Acara tersimpan, namun beberapa kursi mungkin perlu diatur ulang', 'warning')
      }
    }

    router.push({ name: 'creator-dashboard' })
  } catch {
    showToast(isEditing.value ? 'Gagal menyimpan perubahan' : 'Gagal menyimpan acara', 'error')
    saving.value = false
  }
}

const handlePublish = async () => {
  saving.value = true
  error.value = ''
  const token = (await session.value?.access_token) || ''

  if (!isEditing.value && !captchaToken.value) {
    error.value = 'Harap selesaikan verifikasi keamanan'
    saving.value = false
    return
  }

  try {
    if (!eventData.value.banner_url) {
      error.value = 'Cover acara wajib diisi sebelum mempublikasikan'
      saving.value = false
      return
    }

    if (eventData.value.event_start_time === eventData.value.event_end_time) {
      error.value = 'Waktu mulai dan selesai tidak boleh sama'
      saving.value = false
      return
    }

    const dateStr = eventData.value.date
      ? formatDateWithTimezone(eventData.value.date, eventData.value.event_start_time, eventData.value.timezone)
      : new Date().toISOString()

    const url = isEditing.value ? `/api/events/${eventIdParam.value}` : '/api/events'
    const res = await fetch(url, {
      method: isEditing.value ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        ...eventData.value,
        date: dateStr,
        event_start_time: eventData.value.event_start_time || null,
        event_end_time: eventData.value.event_end_time || null,
        timezone: eventData.value.timezone || 'Asia/Jakarta',
        status: 'published',
        gallery_urls: galleryUrls.value,
        ticket_tiers: ticketTiers.value,
        invited_admins: invitedAdmins.value,
        seat_map: useSeatMap.value ? seatMapData.value : null,
        ...(!isEditing.value ? { captchaToken: captchaToken.value } : {})
      })
    })

    if (!res.ok) {
      const data = await res.json()
      error.value = data.error || 'Gagal mempublikasi acara'
      captchaToken.value = ''
      captchaRef.value?.reset()
      saving.value = false
      return
    }

    const savedEvent = await res.json()
    const eventId = savedEvent.event?.id || eventIdParam.value

    showToast(isEditing.value ? 'Acara berhasil diperbarui' : 'Acara berhasil dipublikasi', 'success')

    // Auto-generate seats if seat map is enabled
    if (useSeatMap.value && seatMapData.value.seats.length > 0) {
      try {
        const ok = await generateSeats(eventId, token)
        if (!ok && seatConflictModal.value) {
          pendingSeatSaveAction.value = 'publish'
          saving.value = false
          return
        }
      } catch {
        showToast('Acara berhasil dipublikasi, namun beberapa kursi mungkin perlu diatur ulang', 'warning')
      }
    }

    router.push({ name: 'creator-dashboard' })
  } catch {
    showToast(isEditing.value ? 'Gagal menyimpan perubahan publikasi' : 'Gagal mempublikasi acara', 'error')
    saving.value = false
  }
}

const handleInviteSearch = (val: string) => {
  inviteSearch.value = val
  if (val.trim().length >= 2) {
    searchUsers(val)
  }
}

const selectUser = (id: string, name: string, email: string) => {
  selectedUserId.value = id
  selectedUserDisplay.value = `${name} (${email})`
  inviteSearch.value = `${name} (${email})`
}

const toggleRole = (role: string) => {
  if (selectedRoles.value.includes(role)) {
    selectedRoles.value = selectedRoles.value.filter(r => r !== role)
  } else {
    selectedRoles.value.push(role)
  }
}

const addInvitedAdmin = () => {
  if (!selectedUserId.value || selectedRoles.value.length === 0) return
  invitedAdmins.value.push({
    userId: selectedUserId.value,
    name: selectedUserDisplay.value,
    roles: [...selectedRoles.value]
  })
  selectedUserId.value = ''
  selectedUserDisplay.value = ''
  inviteSearch.value = ''
  selectedRoles.value = []
}

const removeInvitedAdmin = (idx: number) => {
  invitedAdmins.value.splice(idx, 1)
}
</script>

<template>
  <SkeletonPage v-if="loadingEvent" type="editor" />
  <template v-else>
    <div class="max-w-3xl mx-auto px-4 md:px-6 py-6">
      <div class="flex items-center justify-between mb-6">
        <BackButton />
        <div class="flex items-center gap-2 text-xs text-text-muted">
          <span v-for="i in totalSteps" :key="i" class="flex items-center gap-1">
            <span
              class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              :class="i < currentStep ? 'bg-success text-white' : i === currentStep ? 'bg-primary text-white' : 'bg-surface-variant text-text-muted'"
            >
              <span v-if="i < currentStep" class="material-symbols-outlined text-sm">check</span>
              <span v-else>{{ i }}</span>
            </span>
            <span class="hidden md:inline font-medium" :class="i === currentStep ? 'text-text-heading' : 'text-text-muted'">{{ stepLabels[i - 1] }}</span>
            <span v-if="i < totalSteps" class="w-6 h-px bg-border mx-1"></span>
          </span>
        </div>
      </div>

      <div v-if="error" class="mb-4 p-3 rounded-xl bg-error/10 border border-error/20 text-sm text-error font-medium">
        {{ error }}
      </div>

      <div v-if="currentStep === 1" class="bg-surface-card rounded-2xl border border-border/50 p-6 space-y-5">
        <h2 class="text-xl font-heading font-bold text-text-heading">Info Event</h2>

        <div>
          <label class="text-sm font-semibold text-text mb-1.5 block">Banner Acara</label>
          <div
            class="relative border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer bg-surface/50"
            @click="($refs.bannerInput as HTMLInputElement)?.click()"
          >
            <img v-if="eventData.banner_url" :src="eventData.banner_url" class="max-h-40 mx-auto rounded-lg object-cover mb-2" />
            <span v-else class="material-symbols-outlined text-3xl text-text-muted mb-2">cloud_upload</span>
            <p class="text-sm text-text-muted">Klik untuk upload banner</p>
            <p class="text-xs text-text-muted mt-1">Rekomendasi: 1920x1080, maks 5MB</p>
            <input ref="bannerInput" type="file" accept="image/*" class="hidden" @change="handleBannerUpload" />
          </div>
        </div>

        <div>
          <label class="text-sm font-semibold text-text mb-1.5 block">Galeri Gambar</label>
          <p class="text-xs text-text-muted mb-3">Foto tambahan untuk galeri acara (maks 6)</p>
          <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
            <div
              v-for="(url, idx) in galleryUrls"
              :key="idx"
              class="aspect-[4/3] rounded-xl overflow-hidden bg-surface-variant relative group"
            >
              <img :src="url" class="w-full h-full object-cover" />
              <button
                class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                @click="removeGalleryImage(idx)"
              >
                <span class="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
            <button
              v-if="galleryUrls.length < 6"
              class="aspect-[4/3] rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-text-muted hover:border-primary/50 hover:text-primary transition-colors cursor-pointer bg-surface/50"
              @click="($refs.galleryInput as HTMLInputElement)?.click()"
              :disabled="galleryUploading"
            >
              <span class="material-symbols-outlined text-2xl">{{ galleryUploading ? 'sync' : 'add' }}</span>
              <span class="text-[10px] font-semibold">{{ galleryUploading ? 'Mengupload...' : 'Tambah' }}</span>
            </button>
          </div>
          <input ref="galleryInput" type="file" accept="image/*" multiple class="hidden" @change="handleGalleryUpload" />
        </div>

        <div>
          <label class="text-sm font-semibold text-text mb-1.5 block">Nama Event <span class="text-error">*</span></label>
          <input
            v-model="eventData.title"
            type="text"
            placeholder="Contoh: Tech Conference 2024"
            class="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm font-semibold text-text mb-1.5 block">Kategori</label>
            <select
              v-model="eventData.category"
              class="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="" disabled>Pilih kategori</option>
              <option v-for="cat in categoryOptions" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </div>
          <div>
            <label class="text-sm font-semibold text-text mb-1.5 block">Format Event</label>
            <div class="flex gap-2">
              <button
                v-for="fmt in formatOptions"
                :key="fmt.value"
                type="button"
                class="flex-1 px-3 py-2.5 text-sm font-semibold rounded-xl border-2 transition-all cursor-pointer"
                :class="eventData.event_format === fmt.value ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text-muted hover:border-primary/50'"
                @click="eventData.event_format = fmt.value"
              >
                {{ fmt.label }}
              </button>
            </div>
          </div>
        </div>

        <div>
          <label class="text-sm font-semibold text-text mb-1.5 block">Visibilitas Event</label>
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 px-3 py-2.5 text-sm font-semibold rounded-xl border-2 transition-all cursor-pointer text-left"
              :class="eventData.visibility === 'public' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text-muted hover:border-primary/50'"
              @click="eventData.visibility = 'public'"
            >
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-lg">public</span>
                <div>
                  <p class="text-sm font-semibold">Public</p>
                  <p class="text-xs font-normal text-text-muted mt-0.5">Semua orang bisa lihat dan beli tiket</p>
                </div>
              </div>
            </button>
            <button
              type="button"
              class="flex-1 px-3 py-2.5 text-sm font-semibold rounded-xl border-2 transition-all cursor-pointer text-left"
              :class="eventData.visibility === 'private' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-text-muted hover:border-primary/50'"
              @click="eventData.visibility = 'private'"
            >
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-lg">lock</span>
                <div>
                  <p class="text-sm font-semibold">Private</p>
                  <p class="text-xs font-normal text-text-muted mt-0.5">Hanya lewat undangan dengan tautan khusus</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="md:col-span-2">
            <label class="text-sm font-semibold text-text mb-1.5 block">Tanggal Event <span class="text-error">*</span></label>
            <input
              v-model="eventData.date"
              type="date"
              class="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label class="text-sm font-semibold text-text mb-1.5 block">Waktu Mulai <span class="text-error">*</span></label>
            <input
              v-model="eventData.event_start_time"
              type="time"
              class="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label class="text-sm font-semibold text-text mb-1.5 block">Waktu Selesai <span class="text-error">*</span></label>
            <input
              v-model="eventData.event_end_time"
              type="time"
              class="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        <div class="mt-3">
          <label class="text-sm font-semibold text-text mb-1.5 block">Zona Waktu</label>
          <select
            v-model="eventData.timezone"
            class="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="Asia/Jakarta">WIB (UTC+7)</option>
            <option value="Asia/Makassar">WITA (UTC+8)</option>
            <option value="Asia/Jayapura">WIT (UTC+9)</option>
          </select>
        </div>

        <div v-if="eventData.event_format !== 'online'">
          <label class="text-sm font-semibold text-text mb-1.5 block">Lokasi</label>
          <div class="space-y-3">
            <div class="relative">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-lg">location_on</span>
              <input
                v-model="eventData.location"
                type="text"
                placeholder="Nama tempat (contoh: Universitas Indonesia)"
                class="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <input
              v-model="eventData.location_detail"
              type="text"
              placeholder="Detail lokasi (contoh: Gedung Serbaguna, Jl. Margonda Raya)"
              class="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <div ref="locSearchContainer" class="relative">
              <div class="relative">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-lg">search</span>
                <input
                  v-model="locSearchQuery"
                  type="text"
                  placeholder="Cari tempat di peta (contoh: UGM, Monas, Malioboro)"
                  class="w-full bg-surface border border-border rounded-xl pl-10 pr-10 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <span v-if="locSearching" class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-text-muted animate-spin text-lg">progress_activity</span>
              </div>
              <div
                v-if="locShowDropdown && locSearchResults.length > 0"
                class="absolute z-20 top-full mt-1 left-0 right-0 bg-surface-card border border-border rounded-xl shadow-lg overflow-hidden"
              >
                <button
                  v-for="(r, i) in locSearchResults"
                  :key="i"
                  class="w-full text-left px-4 py-3 text-sm text-text hover:bg-surface-variant transition-colors border-b border-border/50 last:border-b-0 cursor-pointer flex items-start gap-3"
                  @click="selectResult(r)"
                >
                  <span class="material-symbols-outlined text-lg text-text-muted shrink-0 mt-0.5">location_on</span>
                  <div class="min-w-0">
                    <p class="font-medium truncate">{{ (r as any).display_name?.split(',')[0] || (r as any).display_name }}</p>
                    <p class="text-xs text-text-muted truncate">{{ (r as any).display_name?.split(',').slice(1).join(',')?.trim() || '' }}</p>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <button
                type="button"
                class="text-xs text-primary font-semibold hover:underline cursor-pointer flex items-center gap-1"
                @click="showCoordInput = !showCoordInput"
              >
                <span class="material-symbols-outlined text-sm">pin_drop</span>
                {{ showCoordInput ? 'Sembunyikan input koordinat' : 'Masukkan Koordinat' }}
              </button>
              <div v-if="showCoordInput" class="mt-2">
                <div class="relative">
                  <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-lg">pin_drop</span>
                  <input
                    v-model="coordInput"
                    type="text"
                    placeholder="-7.771729, 110.377133"
                    class="w-full bg-surface border rounded-xl pl-10 pr-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all duration-200"
                    :class="coordError ? 'border-error' : 'border-border'"
                  />
                </div>
                <p v-if="coordError" class="text-xs text-error mt-1">{{ coordError }}</p>
              </div>
            </div>

            <div ref="mapContainer" class="h-48 rounded-xl border border-border/50 overflow-hidden z-0" @click="initMap"></div>
            <p v-if="eventData.location_lat && eventData.location_lng" class="text-[11px] text-text-muted">
              Koordinat: {{ eventData.location_lat.toFixed(5) }}, {{ eventData.location_lng.toFixed(5) }}
              <button class="text-primary hover:underline ml-2 cursor-pointer text-xs" @click="eventData.location_lat = null; eventData.location_lng = null; removeMap(); initMap()">Hapus</button>
            </p>
            <p class="text-[11px] text-text-muted">Cari tempat di kolom pencarian, lalu klik hasil untuk menandai di peta. Geser penanda untuk menyesuaikan.</p>
          </div>
        </div>

        <div>
          <label class="text-sm font-semibold text-text mb-1.5 block">Deskripsi Event</label>
          <textarea
            v-model="eventData.description"
            rows="4"
            placeholder="Ceritakan tentang acara kamu..."
            class="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-y"
          ></textarea>
        </div>

        <div class="flex justify-end pt-2">
          <BaseButton variant="primary" :disabled="!canContinue" @click="nextStep">
            Simpan & Lanjut
          </BaseButton>
        </div>
      </div>

      <div v-if="currentStep === 2" class="space-y-4">
        <div class="bg-surface-card rounded-2xl border border-border/50 p-6">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-xl font-heading font-bold text-text-heading">Tipe Tiket</h2>
            <button
              class="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-accent border-2 border-accent/30 rounded-full hover:bg-accent/5 transition-all cursor-pointer"
              @click="addTier"
            >
              <span class="material-symbols-outlined text-lg">add</span>
              Tambah Tiket
            </button>
          </div>

          <div v-if="ticketTiers.length === 0" class="text-center py-8">
            <span class="material-symbols-outlined text-4xl text-text-muted mb-3">confirmation_number</span>
            <p class="text-sm text-text-muted">Belum ada tipe tiket. Klik "Tambah Tiket" untuk mulai.</p>
          </div>

          <div v-for="(tier, idx) in ticketTiers" :key="tier.id" class="mb-4 p-4 rounded-xl border border-border/50 bg-surface/50 relative">
            <button
              class="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full hover:bg-error/10 text-text-muted hover:text-error transition-colors cursor-pointer"
              @click="removeTier(tier.id)"
            >
              <span class="material-symbols-outlined text-lg">close</span>
            </button>
            <div class="flex items-center gap-3 mb-3">
              <div class="relative w-8 h-8 rounded-full overflow-hidden ring-2 ring-border flex-shrink-0" :style="{ borderColor: tier.color }">
                <input
                  v-model="tier.color"
                  type="color"
                  class="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                />
                <div class="w-full h-full" :style="{ backgroundColor: tier.color || '#6C63FF' }"></div>
              </div>
              <span class="text-xs text-text-muted font-medium">{{ tier.name || 'Warna kursi' }}</span>
            </div>
            <div class="flex items-center justify-between mb-3 py-2 px-3 rounded-xl bg-surface/80 border border-border/30">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-lg text-text-muted">event_seat</span>
                <span class="text-sm font-semibold text-text">Tiket Kursi</span>
                <span v-if="hasExistingSeats && tier.seat_tier" class="text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-2 py-0.5">{{ paintedSeatCountPerTier[tier.name] || 0 }} kursi</span>
              </div>
              <label class="relative inline-flex items-center" :class="hasExistingSeats ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'">
                <input type="checkbox" v-model="tier.seat_tier" class="sr-only peer" :disabled="hasExistingSeats" />
                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-semibold text-text mb-1 block">Nama Tiket</label>
                <input
                  v-model="tier.name"
                  type="text"
                  placeholder="Regular / VIP / Early Bird"
                  class="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label class="text-xs font-semibold text-text mb-1 block">Harga (Rp)</label>
                <input
                  v-model.number="tier.price"
                  type="number"
                  min="0"
                  placeholder="0"
                  class="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label class="text-xs font-semibold text-text mb-1 block">Kuota Tiket</label>
                <input
                  v-if="!tier.seat_tier"
                  v-model.number="tier.limit"
                  type="number"
                  min="1"
                  placeholder="100"
                  class="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <div v-else class="flex items-center gap-2 w-full bg-surface-variant border border-border/50 rounded-xl px-3 py-2.5 text-sm text-text">
                  <span class="material-symbols-outlined text-base text-text-muted">sync</span>
                  <span class="flex-1">{{ (paintedSeatCountPerTier[tier.name] || 0) }} kursi</span>
                </div>
              </div>
              <div>
                <label class="text-xs font-semibold text-text mb-1 block">Deskripsi (opsional)</label>
                <input
                  v-model="tier.description"
                  type="text"
                  placeholder="Fasilitas yang didapat"
                  class="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6 bg-surface-card rounded-2xl border border-border/50 p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-xl font-heading font-bold text-text-heading">Denah Kursi</h2>
            <label class="relative inline-flex items-center" :class="hasExistingSeats ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'">
              <input type="checkbox" v-model="useSeatMap" class="sr-only peer" :disabled="hasExistingSeats" />
              <div class="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              <span class="ms-2 text-sm font-medium text-text-muted">Aktifkan</span>
            </label>
          </div>

          <div v-if="!useSeatMap" class="text-center py-6">
            <span class="material-symbols-outlined text-3xl text-text-muted mb-2">event_seat</span>
            <p class="text-sm text-text-muted">Aktifkan untuk mengatur denah kursi. Jumlah kursi akan otomatis menyesuaikan kuota tiket.</p>
          </div>

          <template v-if="useSeatMap">
            <SeatEditor
              v-model="seatMapData"
              :tiers="ticketTiers.filter(t => t.seat_tier).map(t => ({ name: t.name, price: t.price, color: t.color }))"
              :readonly="hasExistingSeats"
            />
            <p class="text-xs text-text-muted mt-3">
              Hanya tipe tiket yang diatur sebagai "Tiket Kursi" yang muncul di editor.
              Kuota akan otomatis diselaraskan dengan jumlah kursi yang digambar.
            </p>
          </template>
        </div>

        <div class="flex justify-between">
          <BaseButton variant="outline" @click="prevStep">Kembali</BaseButton>
          <BaseButton variant="primary" :disabled="!canContinue" @click="nextStep">
            Simpan & Lanjut
          </BaseButton>
        </div>
      </div>

      <div v-if="currentStep === 3" class="space-y-4">
        <div class="bg-surface-card rounded-2xl border border-border/50 p-6">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-xl font-heading font-bold text-text-heading">Tim</h2>
            <p class="text-xs text-text-muted">Opsional — bisa ditambahkan nanti</p>
          </div>

          <div class="space-y-4">
            <div>
              <label class="text-sm font-semibold text-text mb-1.5 block">Cari dan Undang Admin</label>
              <input
                v-model="inviteSearch"
                type="text"
                placeholder="Cari berdasarkan nama atau email..."
                class="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                @input="handleInviteSearch(($event.target as HTMLInputElement).value)"
              />
              <div
                v-if="searchResults.length > 0 && !selectedUserId"
                class="mt-2 bg-surface border border-border rounded-xl max-h-40 overflow-y-auto"
              >
                <button
                  v-for="u in searchResults"
                  :key="u.id"
                  class="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-variant transition-colors text-left cursor-pointer border-b border-border/30 last:border-0"
                  @click="selectUser(u.id, u.name, u.email)"
                >
                  <div class="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center text-text-muted text-xs shrink-0">
                    {{ u.name.charAt(0).toUpperCase() || '?' }}
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-text truncate">{{ u.name }}</p>
                    <p class="text-xs text-text-muted truncate">{{ u.email }}</p>
                  </div>
                </button>
              </div>
              <div v-if="selectedUserId" class="mt-2 flex items-center gap-2 bg-surface-variant rounded-xl px-4 py-2.5">
                <span class="flex-1 text-sm text-text truncate">{{ selectedUserDisplay }}</span>
                <button class="text-text-muted hover:text-error cursor-pointer" @click="selectedUserId = ''; selectedUserDisplay = ''">
                  <span class="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            </div>

            <div v-if="selectedUserId">
              <label class="text-sm font-semibold text-text mb-2 block">Role Admin</label>
              <div class="flex flex-col gap-2">
                <label class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                  :class="selectedRoles.includes('attendance') ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'">
                  <input type="checkbox" :checked="selectedRoles.includes('attendance')" class="w-4 h-4 text-primary rounded focus:ring-primary" @change="toggleRole('attendance')" />
                  <span class="material-symbols-outlined text-lg text-primary">qr_code_scanner</span>
                  <span class="text-sm font-semibold text-text">Attendance</span>
                </label>
                <label class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                  :class="selectedRoles.includes('support') ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'">
                  <input type="checkbox" :checked="selectedRoles.includes('support')" class="w-4 h-4 text-primary rounded focus:ring-primary" @change="toggleRole('support')" />
                  <span class="material-symbols-outlined text-lg text-primary">support_agent</span>
                  <span class="text-sm font-semibold text-text">Support</span>
                </label>
                <label class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                  :class="selectedRoles.includes('accountant') ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'">
                  <input type="checkbox" :checked="selectedRoles.includes('accountant')" class="w-4 h-4 text-primary rounded focus:ring-primary" @change="toggleRole('accountant')" />
                  <span class="material-symbols-outlined text-lg text-primary">receipt</span>
                  <span class="text-sm font-semibold text-text">Accountant</span>
                </label>
              </div>
              <BaseButton variant="accent" size="sm" class="mt-3" :disabled="!selectedUserId || selectedRoles.length === 0" @click="addInvitedAdmin">
                Tambah ke Tim
              </BaseButton>
            </div>

            <div v-if="invitedAdmins.length > 0" class="space-y-2">
              <p class="text-sm font-semibold text-text-heading">Anggota Tim ({{
                invitedAdmins.length }})</p>
              <div v-for="(admin, idx) in invitedAdmins" :key="idx" class="flex items-center justify-between p-3 rounded-xl bg-surface-variant/50">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-lg text-text-muted">person</span>
                  <span class="text-sm text-text">{{ admin.name }}</span>
                </div>
                <button class="text-text-muted hover:text-error cursor-pointer" @click="removeInvitedAdmin(idx)">
                  <span class="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-between">
          <BaseButton variant="outline" @click="prevStep">Kembali</BaseButton>
          <BaseButton variant="primary" @click="nextStep">Lanjut</BaseButton>
        </div>
      </div>

      <div v-if="currentStep === 4" class="space-y-4">
        <div class="bg-surface-card rounded-2xl border border-border/50 p-6">
          <h2 class="text-xl font-heading font-bold text-text-heading mb-2">Publikasi</h2>
          <p class="text-sm text-text-muted mb-6">Review acara kamu sebelum dipublikasi.</p>

          <div class="space-y-4">
            <div v-if="eventData.banner_url" class="rounded-xl overflow-hidden max-h-40">
              <img :src="eventData.banner_url" class="w-full h-full object-cover" />
            </div>

            <div v-if="galleryUrls.length > 0" class="flex gap-2 overflow-x-auto pb-2">
              <div v-for="(url, idx) in galleryUrls" :key="idx" class="w-20 h-16 rounded-lg overflow-hidden shrink-0 bg-surface-variant">
                <img :src="url" class="w-full h-full object-cover" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p class="text-xs text-text-muted font-semibold uppercase tracking-wide">Nama Event</p>
                <p class="text-text-heading font-semibold">{{ eventData.title || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-text-muted font-semibold uppercase tracking-wide">Kategori</p>
                <p class="text-text">{{ eventData.category || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-text-muted font-semibold uppercase tracking-wide">Tanggal</p>
                <p class="text-text">{{ eventData.date || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-text-muted font-semibold uppercase tracking-wide">Lokasi</p>
                <p class="text-text">{{ eventData.location || '-' }}</p>
              </div>
              <div>
                <p class="text-xs text-text-muted font-semibold uppercase tracking-wide">Tipe Tiket</p>
                <p class="text-text">{{ ticketTiers.length }} tipe</p>
              </div>
              <div>
                <p class="text-xs text-text-muted font-semibold uppercase tracking-wide">Tim</p>
                <p class="text-text">{{ invitedAdmins.length }} admin</p>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-between">
          <div class="flex flex-col gap-2 items-end w-full">
            <div class="flex items-center  justify-between w-full">
              <BaseButton variant="outline" @click="prevStep">Kembali</BaseButton>
              <HCaptcha
              ref="captchaRef"
              v-if="!isEditing"
              :sitekey="hCaptchaSiteKey"
              @verify="onCaptchaVerified"
              @expired="onCaptchaExpired"
              />
            </div>
            <div class="flex gap-3">
              <BaseButton variant="outline" :loading="saving" @click="handleSaveDraft" :disabled="!isEditing && !captchaToken">
                Simpan Draft
              </BaseButton>
              <BaseButton variant="accent" :loading="saving" @click="handlePublish" :disabled="!isEditing && !captchaToken">
                Publikasi
              </BaseButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Seat booking conflict modal -->
    <div
      v-if="seatConflictModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="seatConflictModal = false"
    >
      <div class="bg-surface-card rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto">
        <h3 class="font-heading font-bold text-text-heading mb-2">Kursi dengan Pemesanan Aktif</h3>
        <p class="text-sm text-text-muted mb-4">
          {{ bookedSeatsData.length }} kursi memiliki pemesanan aktif. Anda dapat mengubah posisinya sebelum menyimpan denah baru.
        </p>
        <div class="space-y-3 mb-4">
          <div
            v-for="seat in bookedSeatsData"
            :key="seat.id"
            class="p-3 rounded-xl bg-surface border border-border/50"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-semibold text-text-heading">{{ seat.seat_code }}</span>
              <span class="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium">{{ seat.status }}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[10px] font-semibold text-text-muted block mb-0.5">Posisi X</label>
                <input
                  v-model.number="seatReassignments[seat.id].newX"
                  type="number"
                  min="0"
                  class="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label class="text-[10px] font-semibold text-text-muted block mb-0.5">Posisi Y</label>
                <input
                  v-model.number="seatReassignments[seat.id].newY"
                  type="number"
                  min="0"
                  class="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        </div>
        <div class="flex gap-2 justify-end">
          <button
            class="px-4 py-2 text-sm font-semibold text-text-muted hover:text-text-heading transition-colors cursor-pointer"
            @click="seatConflictModal = false"
          >Batal</button>
          <button
            class="px-4 py-2 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors cursor-pointer"
            @click="submitReassignments"
          >Simpan Posisi Baru</button>
        </div>
      </div>
    </div>
    </template>
</template>
