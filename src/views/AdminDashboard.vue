<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

interface AdminEvent {
  id: string
  title: string
  date: string
  location: string
  status: string
  banner_url: string
  roles?: string[]
}

const router = useRouter()
const events = ref<AdminEvent[]>([])
const loading = ref(true)

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

onMounted(async () => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  try {
    const res = await fetch('/api/events/admin', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      events.value = data.events || []
    }
  } catch {
    // fallback
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AppLayout>
    <div class="min-h-screen bg-surface p-4 md:p-6 pb-24 md:pb-8">
      <div class="max-w-screen-lg mx-auto">
        <div class="flex items-center gap-3 mb-6">
          <span class="material-symbols-outlined text-3xl text-teal-500">admin_panel_settings</span>
          <div>
            <h1 class="text-2xl font-heading font-bold text-text-heading">Panel Admin</h1>
            <p class="text-sm text-text-muted">Kelola acara yang kamu bantu</p>
          </div>
        </div>

        <SkeletonPage v-if="loading" type="stats" />

        <div v-else-if="events.length === 0" class="text-center py-20">
          <span class="material-symbols-outlined text-5xl text-text-muted mb-4">event_busy</span>
          <h2 class="text-xl font-heading font-bold text-text-heading mb-2">Belum Ada Acara</h2>
          <p class="text-sm text-text-muted mb-6">Kamu belum ditugaskan sebagai admin di acara manapun.</p>
          <BaseButton variant="primary" @click="router.push('/acara')">Cari Acara</BaseButton>
        </div>

        <div v-else class="grid gap-4 md:grid-cols-2">
          <div
            v-for="event in events"
            :key="event.id"
            class="bg-surface-card rounded-2xl border border-border/50 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            <div class="h-32 bg-surface-variant overflow-hidden">
              <img
                v-if="event.banner_url"
                :src="event.banner_url"
                :alt="event.title"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <span class="material-symbols-outlined text-4xl text-text-muted">event</span>
              </div>
            </div>
            <div class="p-4">
              <div class="flex items-start justify-between gap-2 mb-2">
                <h3 class="font-heading font-bold text-text-heading">{{ event.title }}</h3>
                <span
                  class="text-xs font-semibold px-2 py-1 rounded-full shrink-0"
                  :class="event.status === 'published' ? 'bg-teal-500/10 text-teal-600' : 'bg-amber-500/10 text-amber-600'"
                >{{ event.status === 'published' ? 'Published' : event.status }}</span>
              </div>
              <p class="text-xs text-text-muted mb-1">
                <span class="material-symbols-outlined text-sm align-middle mr-1">calendar_month</span>
                {{ formatDate(event.date) }}
              </p>
              <p v-if="event.location" class="text-xs text-text-muted mb-4">
                <span class="material-symbols-outlined text-sm align-middle mr-1">location_on</span>
                {{ event.location }}
              </p>
              <div class="flex flex-wrap gap-2">
                <BaseButton variant="primary" size="sm" @click="router.push(`/admin/events/${event.id}/queue`)">
                  Antrian
                </BaseButton>
                <BaseButton variant="secondary" size="sm" @click="router.push(`/admin/events/${event.id}/chat`)">
                  Chat
                </BaseButton>
                <BaseButton variant="secondary" size="sm" @click="router.push(`/admin/events/${event.id}/scanner`)">
                  Scan QR
                </BaseButton>
                <BaseButton variant="secondary" size="sm" @click="router.push(`/admin/events/${event.id}/attendance`)">
                  Kehadiran
                </BaseButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
