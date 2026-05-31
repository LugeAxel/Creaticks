<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import NotificationBell from './NotificationBell.vue'
import ConnectionStatus from '@/components/shared/ConnectionStatus.vue'
import PurchaseTicker from '@/components/shared/PurchaseTicker.vue'
import { useDarkMode } from '@/composables/useDarkMode'
import type { User } from '@supabase/supabase-js'

const props = defineProps<{
  title?: string
  user?: User | null
}>()

const router = useRouter()
const { isDark, toggle } = useDarkMode()
const isDropdownOpen = ref(false)

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value
}

const closeDropdown = () => {
  isDropdownOpen.value = false
}

const navigate = (path: string) => {
  closeDropdown()
  router.push(path)
}

const handleLogout = async () => {
  closeDropdown()
  await supabase.auth.signOut()
  router.push({ name: 'login' })
}

const getInitial = (u: User | null | undefined) => {
  if (!u) return '?'
  const name = u.user_metadata?.name as string | undefined
  if (name && name.trim()) return name.charAt(0).toUpperCase()
  if (u.email) return u.email.charAt(0).toUpperCase()
  return '?'
}
</script>

<template>
  <header class="bg-surface/90 flex justify-between items-center w-full px-4 md:px-6 h-16 sticky top-0 z-40 border-b backdrop:blur(24px) -webkit-backdrop-filter: blur(24px); border-border/90">
    <div class="flex items-center gap-3">
      <img src="/textcreatick.png" alt="Creaticks" class="h-8 md:hidden" />
    </div>
    <div class="flex items-center gap-1">
      <NotificationBell v-if="user" />
      <template v-if="user">
        <div class="relative flex items-center">
          <ConnectionStatus />
          <button
            class="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden border-2 border-border/50 hover:border-primary/50 transition-all duration-200 cursor-pointer"
            @click="toggleDropdown"
          >
            <img
              v-if="user?.user_metadata?.avatar_url"
              :src="user.user_metadata.avatar_url as string"
              alt="avatar"
              class="w-full h-full object-cover"
            />
            <span
              v-else
              class="text-xs font-bold text-text-muted bg-surface-variant w-full h-full flex items-center justify-center"
            >
              {{ getInitial(user) }}
            </span>
          </button>

          <div
            v-if="isDropdownOpen"
            class="fixed inset-0 z-10"
            @click="closeDropdown"
          ></div>

          <div
            v-if="isDropdownOpen"
            class="absolute right-0 top-full mt-2 w-56 bg-surface-card rounded-2xl border border-border/50 shadow-lg overflow-hidden z-20"
          >
            <div class="px-4 py-3 border-b border-border/30">
              <p class="text-sm font-semibold text-text-heading truncate">
                {{ (user?.user_metadata?.name as string) || user?.email?.split('@')[0] || 'User' }}
              </p>
              <p class="text-xs text-text-muted truncate">{{ user?.email || '' }}</p>
            </div>

            <div class="py-1">
              <button
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-text-heading hover:bg-surface transition-colors cursor-pointer text-left"
                @click="navigate('/pengaturan')"
              >
                <span class="material-symbols-outlined text-[20px] text-text-muted">person</span>
                <span>Pengaturan Profil</span>
              </button>
              <button
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-text-heading hover:bg-surface transition-colors cursor-pointer text-left"
                @click="toggle"
              >
                <span class="material-symbols-outlined text-[20px] text-text-muted">{{ isDark ? 'light_mode' : 'dark_mode' }}</span>
                <span>{{ isDark ? 'Mode Terang' : 'Mode Gelap' }}</span>
              </button>
            </div>

            <div class="border-t border-border/30 py-1">
              <button
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-text-heading hover:bg-surface hover:text-error transition-colors cursor-pointer text-left"
                @click="handleLogout"
              >
                <span class="material-symbols-outlined text-[20px]">logout</span>
                <span>Keluar</span>
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <button
          class="px-4 py-2 text-sm font-semibold text-primary border-2 border-primary rounded-xl hover:bg-primary hover:text-white transition-all duration-200 cursor-pointer"
          @click="router.push('/login')"
        >
          Masuk
        </button>
        <button
          class="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-light transition-all duration-200 cursor-pointer"
          @click="router.push('/daftar')"
        >
          Daftar
        </button>
      </template>
    </div>
  </header>

  <PurchaseTicker />
</template>
