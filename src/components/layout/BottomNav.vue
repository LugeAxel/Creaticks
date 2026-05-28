<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { User } from '@supabase/supabase-js'
import { useAdminEvents } from '@/composables/useAdminEvents'

const router = useRouter()
const route = useRoute()

const props = defineProps<{
  user: User | null
  chatUnread?: number
}>()

const { hasEvents, fetchMyEvents } = useAdminEvents()

const isCreator = computed(() => props.user?.user_metadata?.role === 'creator')

const navItems = computed(() => {
  if (!props.user) {
    return [
      { name: 'Beranda', icon: 'home', route: '/' },
      { name: 'Acara', icon: 'event', route: '/acara' },
      { name: 'Masuk', icon: 'login', route: '/login' }
    ]
  }

  const items: Array<{ name: string; icon: string; route: string }> = [
    { name: 'Beranda', icon: 'dashboard', route: '/dashboard' },
    { name: 'Acara', icon: 'event', route: '/acara' }
  ]

  if (hasEvents.value) {
    items.push({ name: 'Acara Saya', icon: 'event_note', route: '/events/saya' })
  } else {
    items.push({ name: 'Tiket', icon: 'confirmation_number', route: '/tickets' })
  }

  items.push({ name: 'Pesan', icon: 'chat', route: '/chat' })

  if (isCreator.value) {
    items.push({ name: 'Buat', icon: 'add_circle', route: '/creator/events/new' })
  }

  items.push({ name: 'Profil', icon: 'person', route: '/pengaturan' })

  return items
})

watch(() => props.user, (u) => {
  if (u) fetchMyEvents()
}, { immediate: true })

const isActive = (path: string) => {
  return route.path === path
}

const fillStyle = (active: boolean) => active ? { fontVariationSettings: "'FILL' 1" } : {}
</script>

<template>
  <nav class="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 bg-surface-card shadow-[0px_-4px_20px_rgba(79,70,229,0.05)] rounded-t-xl border-t border-border">
    <button
      v-for="item in navItems"
      :key="item.route"
      class="flex flex-col items-center justify-center transition-all duration-150 py-1 cursor-pointer"
      @click="router.push(item.route)"
    >
      <div
        class="flex flex-col items-center justify-center px-4 py-1.5 rounded-xl transition-all duration-150"
        :class="isActive(item.route)
          ? 'bg-primary/10 text-primary'
          : 'text-text-muted hover:text-text-heading'"
      >
        <span class="relative inline-flex">
          <span
            class="material-symbols-outlined text-[22px]"
            :style="fillStyle(isActive(item.route))"
          >{{ item.icon }}</span>
          <span
            v-if="item.route === '/chat' && chatUnread && chatUnread > 0"
            class="absolute -top-0.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center bg-error text-on-error text-[9px] font-bold rounded-full px-[3px]"
          >{{ chatUnread > 9 ? '9+' : chatUnread }}</span>
        </span>
        <span
          class="text-[10px] font-semibold mt-0.5"
          :class="isActive(item.route) ? 'text-primary' : 'text-text-muted'"
        >{{ item.name }}</span>
      </div>
    </button>
  </nav>
</template>
