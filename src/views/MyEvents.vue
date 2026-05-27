<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminEvents } from '@/composables/useAdminEvents'
import { useAuth } from '@/composables/useAuth'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import BackButton from '@/components/shared/BackButton.vue'

const router = useRouter()
const { user } = useAuth()
const { myEvents, loading, fetchMyEvents } = useAdminEvents()

const isCreator = computed(() => user.value?.user_metadata?.role === 'creator')

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

const roleLabel = (role: string) => role === 'creator' ? 'Kreator' : 'Admin'

const roleBadgeClass = (role: string) => {
  return role === 'creator'
    ? 'bg-primary/10 text-primary'
    : 'bg-teal-500/10 text-teal-600'
}

const cardHoverClass = (role: string) => {
  return role === 'creator'
    ? 'hover:border-primary hover:shadow-[0_0_20px_rgba(108,99,255,0.12)]'
    : 'hover:border-teal-500 hover:shadow-[0_0_20px_rgba(67,198,172,0.12)]'
}

onMounted(() => {
  fetchMyEvents()
})
</script>

<template>
  <AppLayout>
    <div class="min-h-screen bg-surface p-4 md:p-6 pb-24 md:pb-8">
      <div class="max-w-screen-lg mx-auto">
        <div class="flex items-center gap-3 mb-6">
          <BackButton label="Beranda" />
        </div>

        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-heading font-bold text-text-heading">Acara Saya</h1>
            <p class="text-sm text-text-muted mt-1">Semua acara yang kamu kelola</p>
          </div>
          <BaseButton
            v-if="isCreator"
            variant="accent"
            size="md"
            @click="router.push({ name: 'event-editor' })"
          >
            <span class="material-symbols-outlined text-lg">add</span>
            Buat Acara
          </BaseButton>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-20">
          <span class="material-symbols-outlined text-4xl text-primary animate-spin">sync</span>
        </div>

        <div v-else-if="myEvents.length === 0" class="text-center py-20">
          <span class="material-symbols-outlined text-5xl text-text-muted mb-4">event_busy</span>
          <h2 class="text-xl font-heading font-bold text-text-heading mb-2">Belum Ada Acara</h2>
          <p class="text-sm text-text-muted mb-6">Kamu belum memiliki atau ditugaskan di acara manapun.</p>
          <div class="flex gap-3 justify-center">
            <BaseButton v-if="isCreator" variant="accent" @click="router.push({ name: 'event-editor' })">
              Buat Acara
            </BaseButton>
            <BaseButton variant="primary" @click="router.push('/acara')">Cari Acara</BaseButton>
          </div>
        </div>

        <div v-else class="grid gap-4 md:grid-cols-2">
          <div
            v-for="event in myEvents"
            :key="event.id"
            class="bg-surface-card rounded-2xl border border-border/50 overflow-hidden shadow-sm transition-all duration-200 cursor-pointer"
            :class="cardHoverClass(event.userRole)"
            @click="router.push(`/events/${event.id}/manage`)"
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
                <div class="flex items-center gap-2 shrink-0">
                  <span
                    class="text-xs font-semibold px-2 py-1 rounded-full"
                    :class="event.status === 'published' ? 'bg-success/10 text-success' : 'bg-amber-500/10 text-amber-600'"
                  >{{ event.status === 'published' ? 'Publik' : event.status }}</span>
                  <span class="material-symbols-outlined text-text-muted text-xl">chevron_right</span>
                </div>
              </div>

              <div class="flex items-center gap-2 mb-3">
                <span
                  class="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  :class="roleBadgeClass(event.userRole)"
                >{{ roleLabel(event.userRole) }}</span>
                <span
                  v-if="event.adminRoles && event.adminRoles.length > 0"
                  v-for="r in event.adminRoles"
                  :key="r"
                  class="text-[10px] text-teal-600 bg-teal-500/5 px-1.5 py-0.5 rounded"
                >{{ r }}</span>
              </div>

              <p class="text-xs text-text-muted mb-1">
                <span class="material-symbols-outlined text-sm align-middle mr-1">calendar_month</span>
                {{ formatDate(event.date) }}
              </p>
              <p v-if="event.location" class="text-xs text-text-muted">
                <span class="material-symbols-outlined text-sm align-middle mr-1">location_on</span>
                {{ event.location }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
