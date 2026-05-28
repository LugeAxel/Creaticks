<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { User } from '@supabase/supabase-js'
import { useAdminEvents } from '@/composables/useAdminEvents'

const router = useRouter()
const route = useRoute()

const props = defineProps<{
  user: User | null
  chatUnread?: number
}>()

const sidebarHovered = ref(false)

const { hasEvents, fetchMyEvents } = useAdminEvents()

const isCreator = computed(() => props.user?.user_metadata?.role === 'creator')
const hasUndangan = computed(() => false)

const navItems = computed(() => {
  if (!props.user) {
    return [
      { name: 'Beranda', icon: 'home', route: '/' },
      { name: 'Cari Acara', icon: 'event', route: '/acara' }
    ]
  }

  const items: Array<{ name: string; icon: string; route: string }> = [
    { name: 'Beranda', icon: 'dashboard', route: '/dashboard' },
    { name: 'Cari Acara', icon: 'event', route: '/acara' }
  ]

  if (hasEvents.value) {
    items.push({ name: 'Acara Saya', icon: 'event_note', route: '/events/saya' })
  }

  items.push({ name: 'Tiket Saya', icon: 'confirmation_number', route: '/tickets' })
  items.push({ name: 'Pesan', icon: 'chat', route: '/chat' })

  if (hasUndangan.value) {
    items.push({ name: 'Undangan', icon: 'mail', route: '/undangan' })
  }

  if (isCreator.value) {
    items.push({ name: 'Buat Acara', icon: 'add_circle', route: '/creator/events/new' })
  }

  items.push({ name: 'Profil', icon: 'person', route: '/pengaturan' })

  return items
})

watch(() => props.user, (u) => {
  if (u) fetchMyEvents()
}, { immediate: true })

const isActive = (path: string) => route.path === path

const fillStyle = (active: boolean) => active ? { fontVariationSettings: "'FILL' 1" } : {}
</script>

<template>
  <aside
    class="hidden md:flex bg-surface-card border-r border-border fixed inset-y-0 left-0 z-50 flex-col py-6 shadow-sm transition-all duration-300 ease-in-out"
    :class="sidebarHovered ? 'w-[280px]' : 'w-[80px]'"
    @mouseenter="sidebarHovered = true"
    @mouseleave="sidebarHovered = false"
  >
    <div class="h-14 mb-8 flex items-center justify-center overflow-hidden px-4">
      <img v-if="sidebarHovered" src="/textcreatick.png" alt="Creaticks" class="h-10 object-contain" />
      <img v-else src="/creatick_logo.png" alt="C" class="h-10 object-contain" />
    </div>

    <nav class="flex-1 flex flex-col gap-1 px-3">
      <button
        v-for="item in navItems"
        :key="item.route"
        class="flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 text-left cursor-pointer whitespace-nowrap shrink-0 overflow-hidden"
        :class="isActive(item.route)
          ? 'bg-primary text-on-primary shadow-sm'
          : 'text-text-muted hover:bg-surface hover:text-text-heading'"
        @click="router.push(item.route)"
      >
        <span class="relative">
          <span
            class="material-symbols-outlined text-[20px] shrink-0"
            :style="fillStyle(isActive(item.route))"
          >{{ item.icon }}</span>
          <span
            v-if="item.route === '/chat' && chatUnread && chatUnread > 0"
            class="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center bg-error text-on-error text-[9px] font-bold rounded-full px-[3px]"
          >{{ chatUnread > 9 ? '9+' : chatUnread }}</span>
        </span>
        <span
          class="transition-all duration-300 delay-75 whitespace-nowrap overflow-hidden"
          :class="sidebarHovered ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'"
        >{{ item.name }}</span>
      </button>
    </nav>

    <div v-if="!user" class="px-3 mt-auto flex flex-col gap-2 pb-3">
      <button
        class="w-full py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-light transition-colors cursor-pointer whitespace-nowrap overflow-hidden"
        @click="router.push('/daftar')"
      >
        <span
          class="block transition-all duration-300"
          :class="sidebarHovered ? 'opacity-100' : 'opacity-0'"
        >Daftar</span>
      </button>
      <button
        class="w-full py-2.5 text-sm font-semibold text-primary border-2 border-primary rounded-xl hover:bg-primary hover:text-white transition-colors cursor-pointer whitespace-nowrap overflow-hidden"
        @click="router.push('/login')"
      >
        <span
          class="block transition-all duration-300"
          :class="sidebarHovered ? 'opacity-100' : 'opacity-0'"
        >Masuk</span>
      </button>
      <div class="text-[10px] text-text-muted text-center py-3 overflow-hidden whitespace-nowrap">
        <span
          class="block transition-all duration-300"
          :class="sidebarHovered ? 'opacity-100' : 'opacity-0'"
        >&copy; 2026 Creaticks</span>
      </div>
    </div>

    <div v-else class="px-3 mt-auto pb-3">
      <div class="text-[10px] text-text-muted text-center pt-3 border-t border-border/30 overflow-hidden whitespace-nowrap">
        <span
          class="block transition-all duration-300"
          :class="sidebarHovered ? 'opacity-100' : 'opacity-0'"
        >&copy; 2026 Creaticks</span>
      </div>
    </div>
  </aside>
</template>
