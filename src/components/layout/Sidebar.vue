<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import type { User } from '@supabase/supabase-js'
import { useAdminEvents } from '@/composables/useAdminEvents'

const router = useRouter()
const route = useRoute()

const props = defineProps<{
  user: User | null
}>()

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

const isActive = (path: string) => {
  return route.path === path
}

const fillStyle = (active: boolean) => active ? { fontVariationSettings: "'FILL' 1" } : {}
</script>

<template>
  <aside class="hidden md:flex bg-surface-card border-r border-border h-full w-[280px] fixed inset-y-0 left-0 z-50 flex-col py-6 shadow-sm">
    <div class="px-6 mb-8 flex items-center gap-3">
      <img src="/textcreatick.png" alt="Creaticks" class="ml-5 h-15 w-100%" />
    </div>

    <nav class="flex-1 flex flex-col gap-1 px-3">
      <button
        v-for="item in navItems"
        :key="item.route"
        class="flex items-center gap-3 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 text-left cursor-pointer"
        :class="isActive(item.route)
          ? 'bg-primary text-on-primary shadow-sm'
          : 'text-text-muted hover:bg-surface hover:text-text-heading'"
        @click="router.push(item.route)"
      >
        <span
          class="material-symbols-outlined text-[20px]"
          :style="fillStyle(isActive(item.route))"
        >{{ item.icon }}</span>
        <span>{{ item.name }}</span>
      </button>
    </nav>

    <div v-if="!user" class="px-3 mt-auto flex flex-col gap-2">
      <button
        class="w-full py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-light transition-all cursor-pointer"
        @click="router.push('/daftar')"
      >
        Daftar
      </button>
      <button
        class="w-full py-2.5 text-sm font-semibold text-primary border-2 border-primary rounded-xl hover:bg-primary hover:text-white transition-all cursor-pointer"
        @click="router.push('/login')"
      >
        Masuk
      </button>
      <div class="text-[10px] text-text-muted text-center py-3">
        Creaticks &copy; 2026
      </div>
    </div>

    <div v-else class="px-3 mt-auto">
      <div class="text-[10px] text-text-muted text-center py-3 border-t border-border/30">
        Creaticks &copy; 2026
      </div>
    </div>
  </aside>
</template>
