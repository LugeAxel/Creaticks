<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminEvents } from '@/composables/useAdminEvents'
import { useAuth } from '@/composables/useAuth'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import BackButton from '@/components/shared/BackButton.vue'
import EventCard from '@/components/shared/EventCard.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

const router = useRouter()
const { user } = useAuth()
const { myEvents, loading, fetchMyEvents } = useAdminEvents()

const isCreator = computed(() => user.value?.user_metadata?.role === 'creator')

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

        <SkeletonPage v-if="loading" type="list" />

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

        <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <EventCard
            v-for="event in myEvents"
            :key="event.id"
            :event="event"
            :userRole="event.userRole"
          />
        </div>
      </div>
    </div>
  </AppLayout>
</template>
