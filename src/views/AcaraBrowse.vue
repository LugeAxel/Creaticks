<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import EventCard from '@/components/shared/EventCard.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

interface TicketTier {
  id: string
  name: string
  price: number
  quota: number
  sold_count: number
  description?: string
  color?: string
  seat_tier?: string | null
}

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
  visibility?: string
  ticket_tiers: TicketTier[]
}

const events = ref<EventItem[]>([])
const loading = ref(true)
const error = ref('')
const searchInput = ref('')
const activeCategory = ref('')
const currentPage = ref(1)
const totalEvents = ref(0)
const pageSize = 8

const categoryOptions = ['Teknologi', 'Musik', 'Seni', 'Workshop', 'Olahraga', 'Bisnis', 'Lainnya']

const totalPages = computed(() => Math.max(1, Math.ceil(totalEvents.value / pageSize)))

const debouncedSearch = ref('')
const debouncedCategory = ref('')

let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (v) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedSearch.value = v
    currentPage.value = 1
  }, 300)
})

watch(activeCategory, (v) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    debouncedCategory.value = v
    currentPage.value = 1
  }, 300)
})

async function fetchEvents() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      page: String(currentPage.value),
      limit: String(pageSize)
    })
    const q = (debouncedSearch.value || searchInput.value).trim()
    if (q) params.set('search', q)
    const cat = debouncedCategory.value || activeCategory.value
    if (cat) params.set('category', cat)

    const res = await fetch(`/api/events/published?${params}`)
    if (!res.ok) {
      const data = await res.json()
      error.value = data.error || 'Gagal memuat acara'
      return
    }
    const data = await res.json()
    events.value = data.events || []
    totalEvents.value = data.total || 0
  } catch {
    error.value = 'Gagal memuat acara'
  } finally {
    loading.value = false
  }
}

watch([debouncedSearch, debouncedCategory, currentPage], fetchEvents)

const reload = () => {
  window.location.reload()
}

let eventsChannel: ReturnType<typeof supabase.channel> | null = null

onMounted(async () => {
  await fetchEvents()

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
      () => {
        fetchEvents()
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
      () => {
        fetchEvents()
      }
    )
    .subscribe()
})

onUnmounted(() => {
  if (eventsChannel) {
    supabase.removeChannel(eventsChannel)
  }
})

const paginationRange = computed(() => {
  const total = totalPages.value
  const current = currentPage.value
  const range: (number | string)[] = []
  if (total <= 7) {
    for (let i = 1; i <= total; i++) range.push(i)
  } else {
    range.push(1)
    if (current > 3) range.push('...')
    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)
    for (let i = start; i <= end; i++) range.push(i)
    if (current < total - 2) range.push('...')
    range.push(total)
  }
  return range
})

function goToPage(page: number | string) {
  if (typeof page !== 'number') return
  if (page < 1 || page > totalPages.value || page === currentPage.value) return
  currentPage.value = page
}
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
          v-model="searchInput"
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

      <SkeletonPage v-if="loading" type="grid" />

      <div v-else-if="error" class="text-center py-16">
        <span class="material-symbols-outlined text-5xl text-text-muted mb-4">error_outline</span>
        <p class="text-sm text-text-muted">{{ error }}</p>
        <BaseButton variant="primary" size="sm" class="mt-4" @click="reload">
          Muat Ulang
        </BaseButton>
      </div>

      <div v-else-if="events.length === 0" class="text-center py-16">
        <span class="material-symbols-outlined text-5xl text-text-muted mb-4">event_busy</span>
        <p class="text-sm text-text-muted">
          {{ searchInput || activeCategory ? 'Tidak ada acara yang cocok' : 'Belum ada acara tersedia' }}
        </p>
      </div>

      <div v-else>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <EventCard
            v-for="event in events"
            :key="event.id"
            :event="event"
          />
        </div>

        <div v-if="totalPages > 1" class="flex items-center justify-center gap-1.5 mt-8">
          <button
            type="button"
            class="flex items-center justify-center w-9 h-9 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            :class="currentPage === 1 ? 'text-text-muted' : 'text-text hover:bg-surface-variant'"
            :disabled="currentPage === 1"
            @click="goToPage(currentPage - 1)"
          >
            <span class="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>

          <button
            v-for="p in paginationRange"
            :key="p"
            type="button"
            class="flex items-center justify-center min-w-9 h-9 rounded-lg text-sm font-semibold transition-all cursor-pointer"
            :class="p === currentPage
              ? 'bg-primary text-white'
              : p === '...'
                ? 'text-text-muted cursor-default'
                : 'text-text hover:bg-surface-variant'"
            @click="goToPage(p)"
          >
            {{ p }}
          </button>

          <button
            type="button"
            class="flex items-center justify-center w-9 h-9 rounded-lg text-sm font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            :class="currentPage === totalPages ? 'text-text-muted' : 'text-text hover:bg-surface-variant'"
            :disabled="currentPage === totalPages"
            @click="goToPage(currentPage + 1)"
          >
            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
