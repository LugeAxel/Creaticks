<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

import { supabase } from '@/lib/supabase'
import { useEventContext } from '@/composables/useEventContext'
import BaseButton from '@/components/shared/BaseButton.vue'

const { event } = useEventContext()
const eventId = event.id

interface TicketRequest {
  id: string
  event_id: string
  user_id: string
  tier_name: string
  status: string
  created_at: string
  claimed_by: string | null
  claimed_at: string | null
  profiles?: { name: string; email: string }
  claimed_by_profile?: { name: string; email: string } | null
}

const tickets = ref<TicketRequest[]>([])
const loading = ref(true)
const activeFilter = ref<'all' | 'pending' | 'confirmed' | 'cancelled'>('all')

const filteredTickets = computed(() => {
  if (activeFilter.value === 'all') return tickets.value
  return tickets.value.filter(t => t.status === activeFilter.value)
})

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-600' },
    confirmed: { label: 'Confirmed', cls: 'bg-teal-500/10 text-teal-600' },
    cancelled: { label: 'Dibatalkan', cls: 'bg-red-500/10 text-red-600' }
  }
  return map[status] || { label: status, cls: 'bg-gray-500/10 text-gray-600' }
}

const formatTimeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} jam lalu`
  return `${Math.floor(hours / 24)} hari lalu`
}

const claimTicket = async (ticketId: string) => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const res = await fetch(`/api/tickets/${ticketId}/claim`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ claim: true })
  })
  if (res.ok) await fetchTickets()
}

const releaseTicket = async (ticketId: string) => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const res = await fetch(`/api/tickets/${ticketId}/claim`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ claim: false })
  })
  if (res.ok) await fetchTickets()
}

const updateStatus = async (ticketId: string, status: string) => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const res = await fetch(`/api/tickets/${ticketId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status })
  })
  if (res.ok) await fetchTickets()
}

const fetchTickets = async () => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  try {
    const res = await fetch(`/api/tickets/event/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      tickets.value = data.tickets || []
    }
  } catch {
    // fallback
  } finally {
    loading.value = false
  }
}

const filters = [
  { key: 'all' as const, label: 'Semua' },
  { key: 'pending' as const, label: 'Pending' },
  { key: 'confirmed' as const, label: 'Confirmed' },
  { key: 'cancelled' as const, label: 'Dibatalkan' }
]

onMounted(fetchTickets)
</script>

<template>
  <div class="p-4 md:p-6 max-w-screen-lg mx-auto">
    <h1 class="text-xl font-heading font-bold text-text-heading mb-4">Antrian Tiket</h1>

    <div class="flex gap-2 mb-4 overflow-x-auto">
      <button
        v-for="f in filters"
        :key="f.key"
        class="px-4 py-1.5 rounded-full text-sm font-semibold transition-all cursor-pointer shrink-0"
        :class="activeFilter === f.key ? 'bg-primary text-white' : 'bg-surface-card text-text-muted border border-border/50 hover:bg-surface'"
        @click="activeFilter = f.key"
      >{{ f.label }} ({{ tickets.filter(t => f.key === 'all' ? true : t.status === f.key).length }})</button>
    </div>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <span class="material-symbols-outlined text-4xl text-primary animate-spin">sync</span>
    </div>

    <div v-else-if="filteredTickets.length === 0" class="text-center py-20">
      <span class="material-symbols-outlined text-5xl text-text-muted mb-4">inbox</span>
      <h2 class="text-lg font-heading font-bold text-text-heading mb-2">Tidak Ada Tiket</h2>
      <p class="text-sm text-text-muted">Belum ada permintaan tiket di kategori ini.</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="ticket in filteredTickets"
        :key="ticket.id"
        class="bg-surface-card rounded-2xl border border-border/50 p-4"
      >
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center">
              <span class="material-symbols-outlined text-teal-500">person</span>
            </div>
            <div>
              <p class="font-semibold text-text-heading text-sm">{{ ticket.profiles?.name || 'Pengguna' }}</p>
              <p class="text-xs text-text-muted">{{ ticket.profiles?.email || '' }}</p>
            </div>
          </div>
          <span
            class="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
            :class="statusBadge(ticket.status).cls"
          >{{ statusBadge(ticket.status).label }}</span>
        </div>

        <div class="flex items-center gap-3 text-xs text-text-muted mb-3 ml-[52px]">
          <span class="material-symbols-outlined text-sm">confirmation_number</span>
          {{ ticket.tier_name }}
          <span class="mx-1">·</span>
          <span>{{ formatTimeAgo(ticket.created_at) }}</span>
        </div>

        <div v-if="ticket.claimed_by" class="text-xs text-amber-500 bg-amber-500/5 rounded-lg px-3 py-1.5 mb-3 ml-[52px]">
          <span class="material-symbols-outlined text-sm align-middle mr-1">lock</span>
          Sedang ditangani oleh {{ ticket.claimed_by_profile?.name || 'admin lain' }}
        </div>

        <div v-if="ticket.status === 'pending'" class="flex gap-2 ml-[52px]">
          <BaseButton
            v-if="!ticket.claimed_by"
            variant="primary"
            size="sm"
            @click="claimTicket(ticket.id)"
          >Ambil</BaseButton>
          <BaseButton
            v-if="ticket.claimed_by"
            variant="secondary"
            size="sm"
            @click="releaseTicket(ticket.id)"
          >Lepaskan</BaseButton>
          <BaseButton
            variant="primary"
            size="sm"
            @click="updateStatus(ticket.id, 'confirmed')"
          >Konfirmasi</BaseButton>
          <BaseButton
            variant="secondary"
            size="sm"
            class="!text-error !border-error"
            @click="updateStatus(ticket.id, 'cancelled')"
          >Tolak</BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
