<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'

const router = useRouter()

interface EventItem {
  id: string
  title: string
  description: string
  banner_url: string
  date: string
  location: string
  category: string
  event_format: string
  creator_id: string
  max_tickets: number
  status: string
  created_at: string
}

const events = ref<EventItem[]>([])
const loading = ref(true)
const error = ref('')
const searchQuery = ref('')
const activeCategory = ref('')

const categoryOptions = ['Teknologi', 'Musik', 'Seni', 'Workshop', 'Olahraga', 'Bisnis', 'Lainnya']

const filteredEvents = computed(() => {
  let result = events.value
  if (activeCategory.value) {
    result = result.filter(e => e.category === activeCategory.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    result = result.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.location.toLowerCase().includes(q)
    )
  }
  return result
})

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

const formatFormat = (fmt: string) => {
  const map: Record<string, string> = { offline: 'Offline', online: 'Online', hybrid: 'Hybrid' }
  return map[fmt] || fmt
}

const goToEvent = (id: string) => {
  router.push({ name: 'event-detail', params: { id } })
}

const reload = () => {
  window.location.reload()
}

let eventsChannel: ReturnType<typeof supabase.channel> | null = null

const addOrUpdateEvent = (event: EventItem) => {
  const idx = events.value.findIndex(e => e.id === event.id)
  if (idx !== -1) {
    events.value[idx] = event
  } else {
    events.value.unshift(event)
  }
}

onMounted(async () => {
  try {
    const res = await fetch('/api/events/published')
    if (!res.ok) {
      const data = await res.json()
      error.value = data.error || 'Gagal memuat acara'
      return
    }
    const data = await res.json()
    events.value = data.events || []
  } catch {
    error.value = 'Gagal memuat acara'
  } finally {
    loading.value = false
  }

  eventsChannel = supabase
    .channel('acara_browse_realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'events',
        filter: 'status=eq.published'
      },
      (payload: any) => {
        if (payload.new) {
          addOrUpdateEvent(payload.new as EventItem)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'events',
        filter: 'status=eq.published'
      },
      (payload: any) => {
        if (payload.new) {
          addOrUpdateEvent(payload.new as EventItem)
        }
      }
    )
    .subscribe()
})

onUnmounted(() => {
  if (eventsChannel) {
    supabase.removeChannel(eventsChannel)
  }
})
</script>

<template>
  <AppLayout>
    <div class="max-w-3xl mx-auto px-4 md:px-6 py-6">
      <div class="mb-4">
        <h1 class="text-2xl font-heading font-bold text-text-heading">Acara</h1>
        <p class="text-sm text-text-muted mt-1">Temukan acara menarik untuk kamu</p>
      </div>

      <div class="relative mb-5">
        <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">search</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari acara..."
          class="w-full bg-surface-card border border-border rounded-xl pl-11 pr-4 py-3 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      <div class="flex gap-2 overflow-x-auto pb-3 mb-5 scrollbar-hide">
        <button
          type="button"
          class="shrink-0 px-4 py-2 text-sm font-semibold rounded-full border-2 transition-all cursor-pointer"
          :class="!activeCategory ? 'border-primary bg-primary text-white' : 'border-border text-text-muted hover:border-primary/50'"
          @click="activeCategory = ''"
        >
          Semua
        </button>
        <button
          v-for="cat in categoryOptions"
          :key="cat"
          type="button"
          class="shrink-0 px-4 py-2 text-sm font-semibold rounded-full border-2 transition-all cursor-pointer"
          :class="activeCategory === cat ? 'border-primary bg-primary text-white' : 'border-border text-text-muted hover:border-primary/50'"
          @click="activeCategory = activeCategory === cat ? '' : cat"
        >
          {{ cat }}
        </button>
      </div>

      <div v-if="loading" class="flex justify-center py-16">
        <span class="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
      </div>

      <div v-else-if="error" class="text-center py-16">
        <span class="material-symbols-outlined text-5xl text-text-muted mb-4">error_outline</span>
        <p class="text-sm text-text-muted">{{ error }}</p>
          <BaseButton variant="primary" size="sm" class="mt-4" @click="reload">
          Muat Ulang
        </BaseButton>
      </div>

      <div v-else-if="filteredEvents.length === 0" class="text-center py-16">
        <span class="material-symbols-outlined text-5xl text-text-muted mb-4">event_busy</span>
        <p class="text-sm text-text-muted">
          {{ searchQuery || activeCategory ? 'Tidak ada acara yang cocok' : 'Belum ada acara tersedia' }}
        </p>
      </div>

      <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <div
          v-for="event in filteredEvents"
          :key="event.id"
          class="bg-surface-card rounded-2xl border border-border/50 overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
          @click="goToEvent(event.id)"
        >
          <div class="aspect-[4/3] bg-surface-variant overflow-hidden">
            <img v-if="event.banner_url" :src="event.banner_url" class="w-full h-full object-cover" loading="lazy" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <span class="material-symbols-outlined text-3xl text-text-muted">image</span>
            </div>
          </div>
          <div class="p-3">
            <div class="flex items-center gap-1.5 mb-1.5">
              <span class="text-[10px] font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded-full">
                {{ event.category || 'Umum' }}
              </span>
              <span class="text-[10px] font-semibold text-secondary bg-secondary/5 px-2 py-0.5 rounded-full">
                {{ formatFormat(event.event_format) }}
              </span>
            </div>
            <h3 class="font-heading font-bold text-text-heading text-xs line-clamp-2 mb-1">{{ event.title }}</h3>
            <p class="text-[10px] text-text-muted flex items-center gap-1">
              <span class="material-symbols-outlined text-[11px]">calendar_today</span>
              {{ formatDate(event.date) }}
            </p>
            <p v-if="event.location" class="text-[10px] text-text-muted flex items-center gap-1 mt-0.5">
              <span class="material-symbols-outlined text-[11px]">location_on</span>
              <span class="truncate">{{ event.location }}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
