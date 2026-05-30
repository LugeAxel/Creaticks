<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

const router = useRouter()
const { session, getAuthHeaders } = useAuth()

interface EventItem {
  id: string
  title: string
  description: string
  banner_url: string
  date: string
  location: string
  category: string
  event_format: string
  visibility: string
  status: string
  created_at: string
}

const events = ref<EventItem[]>([])
const loading = ref(true)

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

const statusLabel = (s: string) => {
  const map: Record<string, string> = { draft: 'Draft', published: 'Publik', cancelled: 'Dibatalkan', completed: 'Selesai' }
  return map[s] || s
}

const statusColor = (s: string) => {
  const map: Record<string, string> = { draft: 'bg-warning/10 text-warning', published: 'bg-success/10 text-success', cancelled: 'bg-error/10 text-error', completed: 'bg-primary/10 text-primary' }
  return map[s] || 'bg-surface-variant text-text-muted'
}

const editEvent = (id: string) => {
  router.push({ name: 'event-editor-edit', params: { id } })
}

const viewEvent = (id: string) => {
  router.push({ name: 'event-detail', params: { id } })
}

onMounted(async () => {
  const headers = getAuthHeaders()
  if (!headers) {
    router.push('/login')
    return
  }

  try {
    const res = await fetch('/api/events', { headers })
    if (res.ok) {
      const data = await res.json()
      events.value = data.events || []
    }
  } catch {
    console.log('[CreatorEvents]', 'Failed to fetch events')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AppLayout title="Event Saya">
    <div class="max-w-3xl mx-auto px-4 md:px-6 py-6">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-heading font-bold text-text-heading">Event Saya</h1>
          <p class="text-sm text-text-muted mt-1">Kelola semua acara kamu</p>
        </div>
        <router-link
          :to="{ name: 'event-editor' }"
          class="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
        >
          <span class="material-symbols-outlined text-lg">add</span>
          Buat Acara
        </router-link>
      </div>

      <SkeletonPage v-if="loading" type="list" />

      <div v-else-if="events.length === 0" class="text-center py-20">
        <span class="material-symbols-outlined text-5xl text-text-muted mb-4">event</span>
        <p class="text-sm text-text-muted mb-1">Belum ada acara</p>
        <p class="text-xs text-text-muted mb-4">Buat acara pertama kamu sekarang</p>
        <router-link :to="{ name: 'event-editor' }">
          <BaseButton variant="primary">Buat Acara</BaseButton>
        </router-link>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="event in events"
          :key="event.id"
          class="bg-surface-card rounded-2xl border border-border/50 overflow-hidden"
        >
          <div class="flex">
            <div v-if="event.banner_url" class="w-24 md:w-32 shrink-0 bg-surface-variant">
              <img :src="event.banner_url" class="w-full h-full object-cover" />
            </div>
            <div v-else class="w-24 md:w-32 shrink-0 bg-surface-variant flex items-center justify-center">
              <span class="material-symbols-outlined text-2xl text-text-muted">image</span>
            </div>
            <div class="flex-1 p-4 min-w-0">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="statusColor(event.status)">
                  {{ statusLabel(event.status) }}
                </span>
                <span v-if="event.visibility === 'private'" class="text-xs font-semibold text-text-muted flex items-center gap-0.5">
                  <span class="material-symbols-outlined text-[12px]">lock</span>
                  Private
                </span>
              </div>
              <h3 class="font-heading font-bold text-text-heading text-sm truncate">{{ event.title }}</h3>
              <p class="text-xs text-text-muted mt-1 flex items-center gap-1">
                <span class="material-symbols-outlined text-[13px]">calendar_today</span>
                {{ formatDate(event.date) }}
              </p>
              <div class="flex items-center gap-2 mt-3">
                <button
                  class="text-xs font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5 cursor-pointer"
                  @click="viewEvent(event.id)"
                >
                  <span class="material-symbols-outlined text-[14px]">visibility</span>
                  Lihat
                </button>
                <button
                  class="text-xs font-semibold text-secondary hover:text-secondary/80 transition-colors flex items-center gap-0.5 cursor-pointer"
                  @click="editEvent(event.id)"
                >
                  <span class="material-symbols-outlined text-[14px]">edit</span>
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
