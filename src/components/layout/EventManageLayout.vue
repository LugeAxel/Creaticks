<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEventContextLoader } from '@/composables/useEventContext'
import ToastContainer from '@/components/shared/ToastContainer.vue'
import PurchaseTicker from '@/components/shared/PurchaseTicker.vue'

const route = useRoute()
const router = useRouter()
const eventId = route.params.eventId as string

const { event, resolvedRole, loading, context, load } = useEventContextLoader(eventId)

interface NavItem { label: string; icon: string; route: string }

const navItems = computed<{ common: NavItem[]; creatorOnly: NavItem[] }>(() => {
  const isCreator = resolvedRole.value === 'creator'

  const common: NavItem[] = [
    { label: 'Overview', icon: 'dashboard', route: `/events/${eventId}/manage/overview` },
    { label: 'Antrian', icon: 'queue', route: `/events/${eventId}/manage/queue` },
    { label: 'Chat', icon: 'chat', route: `/events/${eventId}/manage/chat` },
    { label: 'Scan QR', icon: 'qr_code_scanner', route: `/events/${eventId}/manage/scan` },
    { label: 'Kehadiran', icon: 'group', route: `/events/${eventId}/manage/attendance` },
    { label: 'Desain Tiket', icon: 'confirmation_number', route: `/events/${eventId}/manage/design` },
  ]

  const creatorOnly: NavItem[] = [
    { label: 'Pengaturan Acara', icon: 'settings', route: `/events/${eventId}/manage/settings` },
    { label: 'Manajemen Admin', icon: 'admin_panel_settings', route: `/events/${eventId}/manage/admins` },
    { label: 'Analitik', icon: 'analytics', route: `/events/${eventId}/manage/analytics` },
  ]

  return { common, creatorOnly: isCreator ? creatorOnly : [] }
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  })
}

const badgeClass = computed(() => {
  return resolvedRole.value === 'creator'
    ? 'bg-[#6C63FF]/20 text-[#6C63FF]'
    : 'bg-[#43C6AC]/20 text-[#43C6AC]'
})

const badgeLabel = computed(() => {
  return resolvedRole.value === 'creator' ? 'Creator' : 'Admin'
})

const isActive = (path: string) => route.path === path

onMounted(() => {
  load()
})
</script>

<template>
  <div v-if="!event" class="min-h-screen bg-[#1A1A2E] flex items-center justify-center">
    <span class="material-symbols-outlined text-3xl text-white/50 animate-spin">sync</span>
  </div>

  <div v-else class="min-h-screen flex">
    <aside class="w-[220px] shrink-0 bg-[#1A1A2E] flex flex-col h-screen sticky top-0 overflow-y-auto">
      <div class="h-20 overflow-hidden shrink-0">
        <img
          v-if="event.banner_url"
          :src="event.banner_url"
          :alt="event.title"
          class="w-full h-full object-cover"
        />
        <div v-else class="w-full h-full bg-[#2A2A4E] flex items-center justify-center">
          <span class="material-symbols-outlined text-2xl text-white/30">event</span>
        </div>
      </div>

      <div class="p-4 shrink-0">
        <h1 class="text-white text-sm font-bold truncate">{{ event.title }}</h1>
        <div class="flex items-center gap-2 mt-2">
          <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" :class="badgeClass">{{ badgeLabel }}</span>
        </div>
        <p class="text-[#9B9BBD] text-[11px] mt-2">
          <span class="material-symbols-outlined text-[12px] align-middle mr-1">calendar_month</span>
          {{ formatDate(event.date) }}
        </p>
      </div>

      <nav class="flex-1 px-3 space-y-0.5">
        <button
          v-for="item in navItems.common"
          :key="item.route"
          class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer"
          :class="isActive(item.route)
            ? 'bg-white/10 text-white'
            : 'text-[#9B9BBD] hover:text-white hover:bg-white/5'"
          @click="router.push(item.route)"
        >
          <span class="material-symbols-outlined text-[18px]">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>

        <div v-if="navItems.creatorOnly.length > 0" class="border-t border-white/10 my-3 pt-3">
          <button
            v-for="item in navItems.creatorOnly"
            :key="item.route"
            class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer"
            :class="isActive(item.route)
              ? 'bg-white/10 text-white'
              : 'text-[#9B9BBD] hover:text-white hover:bg-white/5'"
            @click="router.push(item.route)"
          >
            <span class="material-symbols-outlined text-[18px]">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </nav>

      <div class="p-4 border-t border-white/10 shrink-0">
        <router-link
          to="/events/saya"
          class="flex items-center gap-2 text-[#9B9BBD] hover:text-white text-sm transition-colors"
        >
          <span class="material-symbols-outlined text-[18px]">arrow_back</span>
          Acara Saya
        </router-link>
      </div>
    </aside>

    <main class="flex-1 bg-surface min-h-screen overflow-y-auto">
      <PurchaseTicker :stickyOffset="0" />
      <router-view />
    </main>
  </div>

  <ToastContainer />
</template>
