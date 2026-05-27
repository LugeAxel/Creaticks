<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabase'
import Sidebar from './Sidebar.vue'
import BottomNav from './BottomNav.vue'
import TopBar from './TopBar.vue'
import ToastContainer from '@/components/shared/ToastContainer.vue'
import type { User } from '@supabase/supabase-js'

defineProps<{
  title?: string
}>()

const user = ref<User | null>(null)

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  user.value = session?.user ?? null

  supabase.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user ?? null
  })
})
</script>

<template>
  <div class="min-h-screen bg-surface">
    <Sidebar :user="user" />

    <div class="md:ml-[280px] min-h-screen flex flex-col pb-20 md:pb-0">
      <TopBar :title="title" :user="user" />

      <main class="flex-1">
        <slot />
      </main>
    </div>

    <BottomNav :user="user" />
  </div>

  <ToastContainer />
</template>
