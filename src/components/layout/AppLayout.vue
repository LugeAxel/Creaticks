<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
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
const chatUnread = ref(0)

let unreadInterval: ReturnType<typeof setInterval> | null = null

const fetchChatUnread = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return
  try {
    const res = await fetch('/api/chat/me', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    if (res.ok) {
      const data = await res.json()
      const total = (data.threads || []).reduce((sum: number, t: any) => sum + (t.unread_count || 0), 0)
      chatUnread.value = total
    }
  } catch {
    // fail silently
  }
}

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  user.value = session?.user ?? null

  supabase.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user ?? null
  })

  await fetchChatUnread()
  // Poll for unread count every 30s
  unreadInterval = setInterval(fetchChatUnread, 60000)
})

watch(user, (u) => {
  if (u) fetchChatUnread()
})
</script>

<template>
  <div class="min-h-screen bg-surface">
    <Sidebar :user="user" :chatUnread="chatUnread" />

    <div class="md:ml-[280px] min-h-screen flex flex-col pb-20 md:pb-0">
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
