<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useCloudinary } from '@/composables/useCloudinary'
import { useTeamManagement } from '@/composables/useTeamManagement'
import { useToast } from '@/composables/useToast'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import BackButton from '@/components/shared/BackButton.vue'

const router = useRouter()
const route = useRoute()
const { session, getAuthHeaders } = useAuth()
const { upload } = useCloudinary()
const { searchResults, searchUsers, inviteUser } = useTeamManagement()
const { showToast } = useToast()

const isEditing = computed(() => !!route.params.id)
const loadingEvent = ref(false)
const currentStep = ref(1)
const totalSteps = 4
const saving = ref(false)
const error = ref('')

const stepLabels = ['Info Event', 'Tiket', 'Tim', 'Publikasi']

const eventData = ref({
  title: '',
  description: '',
  banner_url: '',
  category: '',
  event_format: 'offline',
  visibility: 'public',
  date: '',
  time: '',
  location: '',
  status: 'draft'
})

interface TicketTier {
  id: number
  name: string
  price: number
  limit: number
  description: string
}

const ticketTiers = ref<TicketTier[]>([])

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
    return eventData.value.title.trim().length > 0 && eventData.value.date.length > 0
  }
  if (currentStep.value === 2) {
    return ticketTiers.value.length > 0
  }
  return true
})

const galleryUrls = ref<string[]>([])
const galleryUploading = ref(false)

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

onMounted(async () => {
  if (!isEditing.value) return
  loadingEvent.value = true
  const token = (await session.value?.access_token) || ''
  try {
    const res = await fetch(`/api/events/${route.params.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) {
      error.value = 'Gagal memuat data acara'
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
      time: extractTime(ev.date),
      location: ev.location || '',
      status: ev.status || 'draft'
    }
    galleryUrls.value = ev.gallery_urls || []
    if (ev.ticket_tiers && ev.ticket_tiers.length > 0) {
      ticketTiers.value = ev.ticket_tiers.map((t: any) => ({
        id: Date.now() + Math.random(),
        name: t.name || 'Regular',
        price: t.price || 0,
        limit: t.quota || 0,
        description: t.description || ''
      }))
    }
  } catch {
    error.value = 'Gagal memuat data acara'
  } finally {
    loadingEvent.value = false
  }
})

const addTier = () => {
  ticketTiers.value.push({
    id: Date.now(),
    name: '',
    price: 0,
    limit: 0,
    description: ''
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

  try {
    const dateStr = eventData.value.date
      ? `${eventData.value.date}${eventData.value.time ? `T${eventData.value.time}:00` : 'T00:00:00'}`
      : new Date().toISOString()

    const url = isEditing.value ? `/api/events/${route.params.id}` : '/api/events'
    const res = await fetch(url, {
      method: isEditing.value ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        ...eventData.value,
        date: dateStr,
        status: 'draft',
        gallery_urls: galleryUrls.value,
        ticket_tiers: ticketTiers.value,
        invited_admins: invitedAdmins.value
      })
    })

    if (!res.ok) {
      const data = await res.json()
      error.value = data.error || 'Gagal menyimpan acara'
      saving.value = false
      return
    }

    router.push({ name: 'creator-dashboard' })
  } catch {
    error.value = 'Gagal menyimpan acara'
    saving.value = false
  }
}

const handlePublish = async () => {
  saving.value = true
  error.value = ''
  const token = (await session.value?.access_token) || ''

  try {
    const dateStr = eventData.value.date
      ? `${eventData.value.date}${eventData.value.time ? `T${eventData.value.time}:00` : 'T00:00:00'}`
      : new Date().toISOString()

    const url = isEditing.value ? `/api/events/${route.params.id}` : '/api/events'
    const res = await fetch(url, {
      method: isEditing.value ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        ...eventData.value,
        date: dateStr,
        status: 'published',
        gallery_urls: galleryUrls.value,
        ticket_tiers: ticketTiers.value,
        invited_admins: invitedAdmins.value
      })
    })

    if (!res.ok) {
      const data = await res.json()
      error.value = data.error || 'Gagal mempublikasi acara'
      saving.value = false
      return
    }

    router.push({ name: 'creator-dashboard' })
  } catch {
    error.value = 'Gagal mempublikasi acara'
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
  <AppLayout :title="isEditing ? 'Edit Acara' : 'Buat Acara'">
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

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-sm font-semibold text-text mb-1.5 block">Tanggal Event <span class="text-error">*</span></label>
            <input
              v-model="eventData.date"
              type="date"
              class="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label class="text-sm font-semibold text-text mb-1.5 block">Waktu Mulai</label>
            <input
              v-model="eventData.time"
              type="time"
              class="w-full bg-surface border border-border rounded-xl px-4 py-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        <div>
          <label class="text-sm font-semibold text-text mb-1.5 block">Lokasi / Venue</label>
          <div class="relative">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-lg">location_on</span>
            <input
              v-model="eventData.location"
              type="text"
              placeholder="Nama tempat atau alamat"
              class="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
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
                  v-model.number="tier.limit"
                  type="number"
                  min="0"
                  placeholder="100"
                  class="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
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
                  :class="selectedRoles.includes('secretary') ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'">
                  <input type="checkbox" :checked="selectedRoles.includes('secretary')" class="w-4 h-4 text-primary rounded focus:ring-primary" @change="toggleRole('secretary')" />
                  <span class="material-symbols-outlined text-lg text-primary">description</span>
                  <span class="text-sm font-semibold text-text">Secretary</span>
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
          <BaseButton variant="outline" @click="prevStep">Kembali</BaseButton>
          <div class="flex gap-3">
            <BaseButton variant="outline" :loading="saving" @click="handleSaveDraft">
              Simpan Draft
            </BaseButton>
            <BaseButton variant="accent" :loading="saving" @click="handlePublish">
              Publikasi
            </BaseButton>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
