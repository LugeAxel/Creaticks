<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { User } from '@supabase/supabase-js'

const router = useRouter()
const route = useRoute()

const props = defineProps<{
  user: User | null
  chatUnread?: number
}>()

const sidebarHovered = ref(false)

const isCreator = computed(() => props.user?.user_metadata?.role === 'creator')

const navItems = computed(() => {
  if (!props.user) {
    return [
      { name: 'Beranda', icon: 'home', route: '/' },
      { name: 'Cari Acara', icon: 'search', route: '/acara' }
    ]
  }

  const items: Array<{ name: string; icon: string; route: string }> = [
    { name: 'Beranda', icon: 'dashboard', route: '/dashboard' },
    { name: 'Cari Acara', icon: 'search', route: '/acara' },
    { name: 'Tiket Saya', icon: 'confirmation_number', route: '/tickets' },
    { name: 'Pesan', icon: 'chat', route: '/chat' }
  ]

  if (isCreator.value) {
    items.push({ name: 'Buat Acara', icon: 'add_circle', route: '/creator/events/new' })
  }

  items.push({ name: 'Profil', icon: 'person', route: '/pengaturan' })

  return items
})

const isActive = (path: string) => route.path === path

const fillStyle = (active: boolean) => active ? { fontVariationSettings: "'FILL' 1" } : {}
</script>

<template>
  <aside
    class="hidden md:flex bg-surface-card border-r border-border fixed inset-y-0 left-0 z-50 flex-col py-6 shadow-sm select-none"
    :class="sidebarHovered ? 'sidebar-expanded' : 'sidebar-collapsed'"
    @mouseenter="sidebarHovered = true"
    @mouseleave="sidebarHovered = false"
  >
    <div class="h-14 mb-8 flex items-center px-3 overflow-hidden">
      <div class="flex items-center">
        <img src="/creatick_logo.png" alt="logo" class="h-12 ml-1 p-1 object-contain shadow-10px rounded-lg shrink-0" />
        <div
          class="overflow-hidden transition-all duration-200 ease-out"
          :class="sidebarHovered ? 'max-w-[160px] opacity-100 translate-x-0' : 'max-w-0 opacity-0 ml-0 translate-x-3'"
        >
          <img src="/textcreatick.png" alt="Creaticks" class="w-[160px]" />
        </div>
      </div>
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
        <span class="relative shrink-0">
          <span
            class="material-symbols-outlined text-[20px]"
            :style="fillStyle(isActive(item.route))"
          >{{ item.icon }}</span>
          <span
            v-if="item.route === '/chat' && chatUnread && chatUnread > 0"
            class="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center bg-error text-on-error text-[9px] font-bold rounded-full px-[3px]"
          >{{ chatUnread > 9 ? '9+' : chatUnread }}</span>
        </span>
        <span
          class="transition-all duration-150 whitespace-nowrap overflow-hidden"
          :class="sidebarHovered ? 'opacity-100 max-w-[160px] ml-1' : 'opacity-0 max-w-0'"
        >{{ item.name }}</span>
      </button>
    </nav>

    <div v-if="!user" class="px-3 mt-auto flex flex-col gap-2 pb-3">
      <button
        class="w-full py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-light transition-colors cursor-pointer overflow-hidden"
        @click="router.push('/daftar')"
      >
        <span
          class="block transition-all duration-150 truncate"
          :class="sidebarHovered ? 'opacity-100' : 'opacity-0'"
        >Daftar</span>
      </button>
      <button
        class="w-full py-2.5 text-sm font-semibold text-primary border-2 border-primary rounded-xl hover:bg-primary hover:text-white transition-colors cursor-pointer overflow-hidden"
        @click="router.push('/login')"
      >
        <span
          class="block transition-all duration-150 truncate"
          :class="sidebarHovered ? 'opacity-100' : 'opacity-0'"
        >Masuk</span>
      </button>
      <div class="text-[10px] text-text-muted text-center py-1 overflow-hidden">
        <span
          class="block transition-all duration-150 truncate"
          :class="sidebarHovered ? 'opacity-100' : 'opacity-0'"
        >&copy; 2026 Creaticks</span>
      </div>
      <div class="text-[10px] text-text-muted text-center pb-3 overflow-hidden">
        <router-link
          to="/syarat-dan-ketentuan"
          class="block hover:text-primary transition-colors truncate"
          :class="sidebarHovered ? 'opacity-100' : 'opacity-0'"
        >Syarat &amp; Ketentuan</router-link>
      </div>
    </div>

    <div v-else class="px-3 mt-auto pb-3">
      <div class="text-[10px] text-text-muted text-center pt-3 border-t border-border/30 overflow-hidden">
        <span
          class="block transition-all duration-150 truncate"
          :class="sidebarHovered ? 'opacity-100' : 'opacity-0'"
        >&copy; 2026 Creaticks</span>
      </div>
      <div class="text-[10px] text-center pt-1 overflow-hidden">
        <router-link
          to="/syarat-dan-ketentuan"
          class="block text-text-muted hover:text-primary transition-colors truncate"
          :class="sidebarHovered ? 'opacity-100' : 'opacity-0'"
        >Syarat &amp; Ketentuan</router-link>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-collapsed {
  width: 80px;
  transition: width 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.sidebar-expanded {
  width: 260px;
  transition: width 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
</style>
