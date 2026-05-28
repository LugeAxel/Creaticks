<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import EventCard from '@/components/shared/EventCard.vue'

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
    <div class="max-w-5xl mx-auto px-4 md:px-6 py-6">
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

      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        <EventCard
          v-for="event in filteredEvents"
          :key="event.id"
          :event="event"
        />
      </div>
    </div>
  </AppLayout>
</template>
