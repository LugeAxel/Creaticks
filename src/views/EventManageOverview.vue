<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useEventContext } from '@/composables/useEventContext'
import { supabase } from '@/lib/supabase'

const router = useRouter()
const { event, resolvedRole } = useEventContext()

const stats = ref({ total: 0, pending: 0, checkedIn: 0, revenue: 0 })
const loading = ref(true)

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

onMounted(async () => {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/tickets/event/${event.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      const tickets = data.tickets || []
      stats.value = {
        total: tickets.length,
        pending: tickets.filter((t: any) => t.status === 'pending').length,
        checkedIn: tickets.filter((t: any) => t.is_checked_in).length,
        revenue: tickets.filter((t: any) => t.status === 'confirmed').length * 50000
      }
    }
  } catch {
    // silent
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <div class="mb-6">
      <h1 class="text-xl font-heading font-bold text-text-heading">{{ event.title }}</h1>
      <p class="text-sm text-text-muted mt-1">{{ formatDate(event.date) }}</p>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <span class="material-symbols-outlined text-3xl text-primary animate-spin">sync</span>
    </div>

    <div v-else class="space-y-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="bg-surface-card rounded-xl border border-border/50 p-4">
          <p class="text-2xl font-heading font-bold text-primary">{{ stats.total }}</p>
          <p class="text-xs text-text-muted mt-1">Total Tiket</p>
        </div>
        <div class="bg-surface-card rounded-xl border border-border/50 p-4">
          <p class="text-2xl font-heading font-bold text-amber-500">{{ stats.pending }}</p>
          <p class="text-xs text-text-muted mt-1">Pending</p>
        </div>
        <div class="bg-surface-card rounded-xl border border-border/50 p-4">
          <p class="text-2xl font-heading font-bold text-teal-500">{{ stats.checkedIn }}</p>
          <p class="text-xs text-text-muted mt-1">Check-in</p>
        </div>
        <div class="bg-surface-card rounded-xl border border-border/50 p-4">
          <p class="text-2xl font-heading font-bold text-text-heading">Rp {{ stats.revenue.toLocaleString('id-ID') }}</p>
          <p class="text-xs text-text-muted mt-1">Pendapatan</p>
        </div>
      </div>

      <div class="bg-surface-card rounded-xl border border-border/50 p-5">
        <h2 class="text-sm font-semibold text-text-heading mb-4">Akses Cepat</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <button
            class="flex items-center gap-2 p-3 rounded-lg border border-border/50 hover:border-primary hover:bg-surface transition-all text-left cursor-pointer"
            @click="router.push(`/events/${event.id}/manage/queue`)"
          >
            <span class="material-symbols-outlined text-primary">queue</span>
            <span class="text-sm font-medium text-text-heading">Antrian</span>
          </button>
          <button
            class="flex items-center gap-2 p-3 rounded-lg border border-border/50 hover:border-primary hover:bg-surface transition-all text-left cursor-pointer"
            @click="router.push(`/events/${event.id}/manage/chat`)"
          >
            <span class="material-symbols-outlined text-primary">chat</span>
            <span class="text-sm font-medium text-text-heading">Chat</span>
          </button>
          <button
            class="flex items-center gap-2 p-3 rounded-lg border border-border/50 hover:border-primary hover:bg-surface transition-all text-left cursor-pointer"
            @click="router.push(`/events/${event.id}/manage/scan`)"
          >
            <span class="material-symbols-outlined text-primary">qr_code_scanner</span>
            <span class="text-sm font-medium text-text-heading">Scan QR</span>
          </button>
        </div>
      </div>

      <div v-if="event.description" class="bg-surface-card rounded-xl border border-border/50 p-5">
        <h2 class="text-sm font-semibold text-text-heading mb-2">Deskripsi Acara</h2>
        <p class="text-sm text-text whitespace-pre-wrap">{{ event.description }}</p>
      </div>
    </div>
  </div>
</template>
