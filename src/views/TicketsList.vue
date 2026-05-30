<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

const router = useRouter()
const tickets = ref<any[]>([])
const loading = ref(true)
const error = ref('')

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit'
  })
}

let ticketsChannel: ReturnType<typeof supabase.channel> | null = null

onMounted(async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }
    const res = await fetch('/api/tickets', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    if (res.ok) {
      const data = await res.json()
      tickets.value = data.tickets || []
    } else {
      const data = await res.json()
      error.value = data.error || 'Gagal memuat tiket'
    }
  } catch {
    error.value = 'Gagal memuat tiket'
  } finally {
    loading.value = false
  }

  const userId = (await supabase.auth.getSession()).data.session?.user?.id
  if (!userId) return

  ticketsChannel = supabase
    .channel('tickets_realtime')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'ticket_requests',
        filter: `user_id=eq.${userId}`
      },
      (payload: any) => {
        if (!payload.new) return
        const updated = payload.new as Record<string, unknown>
        const idx = tickets.value.findIndex(t => t.id === updated.id)
        if (idx !== -1) {
          tickets.value[idx] = {
            ...tickets.value[idx],
            status: updated.status as string
          }
        }
      }
    )
    .subscribe()
})

onUnmounted(() => {
  if (ticketsChannel) {
    supabase.removeChannel(ticketsChannel)
  }
})
</script>

<template>
  <AppLayout title="Tiket Saya">
    <div class="px-4 md:px-6 py-6 max-w-3xl mx-auto">
      <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 class="text-xl font-heading font-bold text-text-heading">Tiket Saya</h1>
          <p class="text-sm text-text-muted mt-1">Semua tiket event kamu</p>
        </div>
        <BaseButton variant="secondary" size="sm" @click="router.push({ name: 'buyer-chat' })">
          Chat Penyelenggara
        </BaseButton>
      </div>

      <SkeletonPage v-if="loading" type="list" />

      <div v-else-if="error" class="text-center py-16">
        <span class="material-symbols-outlined text-5xl text-text-muted mb-4">error_outline</span>
        <p class="text-sm text-text-muted">{{ error }}</p>
      </div>

      <div v-else-if="tickets.length === 0" class="text-center py-16">
        <span class="material-symbols-outlined text-5xl text-text-muted mb-4">confirmation_number</span>
        <h2 class="text-lg font-heading font-bold text-text-heading mb-2">Belum ada tiket</h2>
        <p class="text-sm text-text-muted mb-6">Kamu belum memiliki tiket. Cari event dan minta tiket!</p>
        <BaseButton variant="primary" @click="router.push('/acara')">Cari Acara</BaseButton>
      </div>

      <div v-else class="space-y-5 md:space-y-6">
        <div
          v-for="ticket in tickets"
          :key="ticket.id"
          class="relative cursor-pointer"
          @click="router.push(`/tickets/${ticket.id}`)"
        >
          <div class="absolute inset-0 translate-x-1 translate-y-1 bg-primary/15 rounded-2xl" />
          <div class="relative bg-surface-card rounded-2xl border border-border/50 border-l-4 border-l-primary overflow-hidden transition-transform duration-300 hover:-translate-x-0.5 hover:-translate-y-0.5">
            <div class="flex items-center p-4 md:p-5 gap-4 md:gap-5">
              <div class="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-2xl md:text-3xl text-primary">confirmation_number</span>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-heading font-bold text-text-heading text-sm md:text-base truncate">{{ ticket.event_name }}</h3>
                <p class="text-xs md:text-sm text-text-muted mt-0.5">{{ formatDate(ticket.event_date) }} {{ formatTime(ticket.event_date) }}</p>
                <p class="text-xs md:text-sm text-text-muted">{{ ticket.tier_name }}</p>
              </div>
              <span
                class="shrink-0 text-[10px] md:text-xs font-semibold px-2.5 py-1 rounded-full"
                :class="ticket.status === 'confirmed' ? 'bg-success/10 text-success' : ticket.status === 'pending' ? 'bg-warning/10 text-warning' : 'bg-error/10 text-error'"
              >
                {{ ticket.status === 'confirmed' ? 'Aktif' : ticket.status === 'pending' ? 'Menunggu' : 'Batal' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
