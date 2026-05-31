<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useEventContextLoader } from '@/composables/useEventContext'
import ToastContainer from '@/components/shared/ToastContainer.vue'
import PurchaseTicker from '@/components/shared/PurchaseTicker.vue'

const route = useRoute()
const router = useRouter()
const eventId = route.params.eventId as string

const mobileNavOpen = ref(false)

const { event, resolvedRole, adminRoles, loading, context, load } = useEventContextLoader(eventId)

interface NavItem { label: string; icon: string; route: string; requiredRoles?: string[]; creatorOnly?: boolean }

const ALL_NAV_ITEMS: NavItem[] = [
  { label: 'Overview', icon: 'dashboard', route: `/events/${eventId}/manage/overview` },
  { label: 'Antrian', icon: 'queue', route: `/events/${eventId}/manage/queue`, requiredRoles: ['support'] },
  { label: 'Chat', icon: 'chat', route: `/events/${eventId}/manage/chat`, requiredRoles: ['support'] },
  { label: 'Scan QR', icon: 'qr_code_scanner', route: `/events/${eventId}/manage/scan`, requiredRoles: ['attendance'] },
  { label: 'Kehadiran', icon: 'group', route: `/events/${eventId}/manage/attendance`, requiredRoles: ['attendance'] },
  { label: 'Desain Tiket', icon: 'confirmation_number', route: `/events/${eventId}/manage/design`, creatorOnly: true },
  { label: 'Invoice', icon: 'receipt', route: `/events/${eventId}/manage/invoices`, requiredRoles: ['accountant'] },
  { label: 'Pengaturan Acara', icon: 'settings', route: `/events/${eventId}/manage/settings`, creatorOnly: true },
  { label: 'Manajemen Admin', icon: 'admin_panel_settings', route: `/events/${eventId}/manage/admins`, creatorOnly: true },
  { label: 'Antrean Refund', icon: 'currency_exchange', route: `/events/${eventId}/manage/refunds`, requiredRoles: ['accountant'] },
  { label: 'Analitik', icon: 'analytics', route: `/events/${eventId}/manage/analytics`, requiredRoles: ['accountant'] },
]

const navItems = computed(() => {
  if (resolvedRole.value === 'creator') return ALL_NAV_ITEMS
  return ALL_NAV_ITEMS.filter(item => {
    if (item.creatorOnly) return false
    if (item.requiredRoles && item.requiredRoles.length > 0) {
      return item.requiredRoles.some(r => adminRoles.value.includes(r))
    }
    return true
  })
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
    <!-- Mobile top bar -->
    <div class="md:hidden fixed top-0 left-0 right-0 z-40 bg-surface border-b border-border/50 h-14 flex items-center justify-between px-4">
      <button
        class="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface-variant transition-colors cursor-pointer"
        @click="mobileNavOpen = !mobileNavOpen"
      >
        <span class="material-symbols-outlined text-[22px] text-text-heading">menu</span>
      </button>
      <h1 class="text-sm font-bold text-text-heading truncate mx-2 text-center">{{ event.title }}</h1>
      <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" :class="badgeClass">{{ badgeLabel }}</span>
    </div>

    <!-- Mobile nav drawer overlay -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="mobileNavOpen"
          class="md:hidden fixed inset-0 z-50 bg-black/50"
          @click="mobileNavOpen = false"
        >
          <aside
            class="absolute left-0 top-0 bottom-0 w-[280px] bg-[#1A1A2E] flex flex-col overflow-y-auto shadow-2xl"
            @click.stop
          >
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
                v-for="item in navItems"
                :key="item.route"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all cursor-pointer"
                :class="isActive(item.route)
                  ? 'bg-white/10 text-white'
                  : 'text-[#9B9BBD] hover:text-white hover:bg-white/5'"
                @click="mobileNavOpen = false; router.push(item.route)"
              >
                <span class="material-symbols-outlined text-[18px]">{{ item.icon }}</span>
                <span>{{ item.label }}</span>
              </button>
            </nav>

            <div class="p-4 border-t border-white/10 shrink-0">
              <router-link
                to="/events/saya"
                class="flex items-center gap-2 text-[#9B9BBD] hover:text-white text-sm transition-colors"
                @click="mobileNavOpen = false"
              >
                <span class="material-symbols-outlined text-[18px]">arrow_back</span>
                Acara Saya
              </router-link>
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>

    <!-- Desktop sidebar -->
    <aside class="max-md:hidden flex w-[220px] shrink-0 bg-[#1A1A2E] flex-col h-screen sticky top-0 overflow-y-auto">
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
          v-for="item in navItems"
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

    <main class="flex-1 bg-surface min-h-screen pt-14 md:pt-0 overflow-y-auto">
      <PurchaseTicker :stickyOffset="0" />
      <router-view />
    </main>
  </div>

  <ToastContainer />
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
