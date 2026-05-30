<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useChatUnread } from '@/composables/useChatUnread'
import Sidebar from './Sidebar.vue'
import BottomNav from './BottomNav.vue'
import TopBar from './TopBar.vue'
import Breadcrumb from '@/components/shared/Breadcrumb.vue'
import ToastContainer from '@/components/shared/ToastContainer.vue'
import type { User } from '@supabase/supabase-js'

defineProps<{
  title?: string
}>()

const user = ref<User | null>(null)
const { chatUnread, fetchUnread, initRealtime, cleanupRealtime } = useChatUnread()

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  user.value = session?.user ?? null

  supabase.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user ?? null
  })

  await fetchUnread()
  initRealtime()
})

onUnmounted(() => {
  cleanupRealtime()
})

watch(user, (u) => {
  if (u) {
    fetchUnread()
  } else {
    chatUnread.value = 0
    cleanupRealtime()
  }
})
</script>

<template>
  <div class="min-h-screen bg-surface">
    <Sidebar :user="user" :chatUnread="chatUnread" />

    <div class="md:ml-[80px] min-h-screen flex flex-col pb-20 md:pb-0">
      <TopBar :title="title" :user="user" />

      <Breadcrumb />

      <main class="flex-1">
        <slot />
      </main>
    </div>

    <BottomNav :user="user" :chatUnread="chatUnread" />
  </div>

  <ToastContainer />
</template>
