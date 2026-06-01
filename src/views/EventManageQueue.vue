<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { joinRoom, leaveRoom, onEvent, offEvent } from '@/lib/socket'
import { useEventContext } from '@/composables/useEventContext'
import { useAuth } from '@/composables/useAuth'
import { useToast } from '@/composables/useToast'
import BaseButton from '@/components/shared/BaseButton.vue'
import { fetchWithRetry } from '@/lib/api'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

const { showToast } = useToast()
const { user } = useAuth()
const { event } = useEventContext()
if (!event) throw new Error('Event context not available')
const eventId = event.id

const currentUserId = computed(() => user.value?.id)
const isCreator = computed(() => user.value?.id === event.creator_id)

const canActOnTicket = (ticket: TicketRequest) => {
  return isCreator.value || ticket.claimed_by === currentUserId.value
}

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

interface TranscriptMessage {
  id: string
  sender: 'system' | 'you' | 'other'
  type: string
  content: string
  at: string
  image_url?: string | null
  avatar_url?: string | null
  sender_name?: string | null
}

const tickets = ref<TicketRequest[]>([])
const loading = ref(true)
const activeFilter = ref<'all' | 'pending' | 'confirmed'>('all')
const pendingAction = ref<string | null>(null)
const transcripts = ref<Record<string, TranscriptMessage[]>>({})
const loadingTranscripts = ref<Record<string, boolean>>({})

const filteredTickets = computed(() => {
  if (activeFilter.value === 'all') return tickets.value
  return tickets.value.filter(t => t.status === activeFilter.value)
})

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: 'Pending',    cls: 'bg-amber-500/10 text-amber-600' },
    confirmed: { label: 'Confirmed',  cls: 'bg-teal-500/10 text-teal-600' },
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

const formatDateTime = (dateStr: string) =>
  new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })

const withDebounce = async (ticketId: string, fn: () => Promise<void>) => {
  if (pendingAction.value) return
  pendingAction.value = ticketId
  try { await fn() } finally { pendingAction.value = null }
}

const claimTicket = async (ticketId: string) => {
  await withDebounce(ticketId, async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/tickets/${ticketId}/claim`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ claim: true })
    })
    if (res.ok) {
      await fetchTickets()
      // Reload transcript if open
      if (transcripts.value[ticketId]) {
        delete transcripts.value[ticketId]
        await fetchTranscript(ticketId)
      }
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error || 'Gagal mengklaim tiket', 'error')
    }
  })
}

const releaseTicket = async (ticketId: string) => {
  await withDebounce(ticketId, async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/tickets/${ticketId}/claim`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ claim: false })
    })
    if (res.ok) { await fetchTickets() } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error || 'Gagal melepas tiket', 'error')
    }
  })
}

const updateStatus = async (ticketId: string, status: string) => {
  await withDebounce(ticketId, async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/tickets/${ticketId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    })
    if (res.ok) {
      await fetchTickets()
      showToast(status === 'confirmed' ? 'Tiket dikonfirmasi!' : 'Tiket ditolak', status === 'confirmed' ? 'success' : 'info')
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error || 'Gagal memperbarui status', 'error')
    }
  })
}

const fetchTickets = async () => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  try {
    const res = await fetchWithRetry(`/api/tickets/event/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      tickets.value = data.tickets || []
    }
  } catch { /* fallback */ } finally {
    loading.value = false
  }
}

const fetchTranscript = async (ticketId: string) => {
  if (transcripts.value[ticketId] !== undefined) {
    // Toggle off
    const copy = { ...transcripts.value }
    delete copy[ticketId]
    transcripts.value = copy
    return
  }
  loadingTranscripts.value = { ...loadingTranscripts.value, [ticketId]: true }
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/tickets/${ticketId}/transcript`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      transcripts.value = { ...transcripts.value, [ticketId]: data.transcript || [] }
    }
  } catch { /* ignore */ } finally {
    const copy = { ...loadingTranscripts.value }
    delete copy[ticketId]
    loadingTranscripts.value = copy
  }
}

const filters = [
  { key: 'all' as const,       label: 'Semua' },
  { key: 'pending' as const,   label: 'Pending' },
  { key: 'confirmed' as const, label: 'Confirmed' },
]

onMounted(() => {
  fetchTickets()
  try {
    joinRoom(`event:${eventId}:queue`)
    onEvent('queue:new', (payload: any) => { tickets.value.unshift(payload) })
    onEvent('queue:claimed', (payload: any) => {
      const idx = tickets.value.findIndex(t => t.id === payload.id)
      if (idx !== -1) tickets.value[idx] = { ...tickets.value[idx], claimed_by: payload.claimed_by, claimed_by_profile: payload.claimed_by_profile }
    })
    onEvent('queue:released', (payload: any) => {
      tickets.value = tickets.value.filter(t => t.id !== payload.id)
    })
    onEvent('queue:status_changed', (payload: any) => {
      if (payload.status === 'cancelled') {
        tickets.value = tickets.value.filter(t => t.id !== payload.id)
      } else {
        const idx = tickets.value.findIndex(t => t.id === payload.id)
        if (idx !== -1) tickets.value[idx] = { ...tickets.value[idx], status: payload.status }
      }
    })
  } catch { /* ignore */ }
})

onUnmounted(() => {
  try {
    offEvent('queue:new'); offEvent('queue:claimed')
    offEvent('queue:released'); offEvent('queue:status_changed')
    leaveRoom(`event:${eventId}:queue`)
  } catch { /* ignore */ }
})
</script>

<template>
  <div class="p-4 md:p-6 max-w-screen-lg mx-auto">
    <h1 class="text-xl font-heading font-bold text-text-heading mb-1">Antrian Tiket</h1>
    <p class="text-sm text-text-muted mb-5">Kelola dan konfirmasi permintaan tiket secara real-time.</p>

    <!-- Filter tabs -->
    <div class="flex gap-2 mb-5 overflow-x-auto pb-1">
      <button
        v-for="f in filters"
        :key="f.key"
        class="px-4 py-1.5 rounded-full text-sm font-semibold transition-all cursor-pointer shrink-0"
        :class="activeFilter === f.key
          ? 'bg-primary text-white shadow-sm'
          : 'bg-surface-card text-text-muted border border-border/50 hover:bg-surface'"
        @click="activeFilter = f.key"
      >
        {{ f.label }}
        <span class="ml-1 opacity-70">({{ tickets.filter(t => f.key === 'all' ? true : t.status === f.key).length }})</span>
      </button>
    </div>

    <SkeletonPage v-if="loading" type="list" />

    <div v-else-if="filteredTickets.length === 0" class="text-center py-24 bg-surface-card rounded-2xl border border-border/50">
      <span class="material-symbols-outlined text-5xl text-text-muted block mb-3">inbox</span>
      <h2 class="text-base font-heading font-bold text-text-heading mb-1">Tidak Ada Tiket</h2>
      <p class="text-sm text-text-muted">Belum ada permintaan tiket di kategori ini.</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="ticket in filteredTickets"
        :key="ticket.id"
        class="bg-surface-card rounded-2xl border border-border/50 overflow-hidden transition-shadow hover:shadow-md"
      >
        <!-- Card header -->
        <div class="p-4">
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-primary">person</span>
              </div>
              <div>
                <p class="font-semibold text-text-heading text-sm leading-tight">{{ ticket.profiles?.name || 'Pengguna' }}</p>
                <p class="text-xs text-text-muted">{{ ticket.profiles?.email || '' }}</p>
              </div>
            </div>
            <span
              class="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
              :class="statusBadge(ticket.status).cls"
            >{{ statusBadge(ticket.status).label }}</span>
          </div>

          <!-- Meta row -->
          <div class="flex items-center gap-3 text-xs text-text-muted mb-3 ml-[52px]">
            <span class="material-symbols-outlined text-base">confirmation_number</span>
            <span class="font-medium text-text-heading">{{ ticket.tier_name }}</span>
            <span class="opacity-40">·</span>
            <span>{{ formatTimeAgo(ticket.created_at) }}</span>
          </div>

          <!-- Claimed banner -->
          <div v-if="ticket.claimed_by" class="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/8 rounded-xl px-3 py-2 mb-3 ml-[52px]">
            <span class="material-symbols-outlined text-base">lock</span>
            <span>Sedang ditangani oleh <strong>{{ ticket.claimed_by_profile?.name || 'admin lain' }}</strong></span>
          </div>

          <!-- Action buttons for pending -->
          <div v-if="ticket.status === 'pending'" class="flex flex-wrap gap-2 ml-[52px]">
            <BaseButton
              v-if="!ticket.claimed_by"
              variant="primary" size="sm"
              :disabled="pendingAction !== null"
              @click="claimTicket(ticket.id)"
            >
              <span class="material-symbols-outlined text-sm mr-1">handshake</span>Ambil
            </BaseButton>
            <BaseButton
              v-if="ticket.claimed_by === currentUserId"
              variant="secondary" size="sm"
              :disabled="pendingAction !== null"
              @click="releaseTicket(ticket.id)"
            >
              <span class="material-symbols-outlined text-sm mr-1">lock_open</span>Lepaskan
            </BaseButton>
            <template v-if="canActOnTicket(ticket)">
              <BaseButton
                variant="primary" size="sm"
                :disabled="pendingAction !== null"
                @click="updateStatus(ticket.id, 'confirmed')"
              >
                <span class="material-symbols-outlined text-sm mr-1">check_circle</span>Konfirmasi
              </BaseButton>
              <BaseButton
                variant="danger" size="sm"
                :disabled="pendingAction !== null"
                @click="updateStatus(ticket.id, 'cancelled')"
              >
                <span class="material-symbols-outlined text-sm mr-1">cancel</span>Tolak
              </BaseButton>
            </template>
            <button
              v-if="canActOnTicket(ticket)"
              class="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-heading transition-colors px-3 py-1.5 rounded-lg hover:bg-surface cursor-pointer"
              :class="{ 'text-primary hover:text-primary': transcripts[ticket.id] !== undefined }"
              @click="fetchTranscript(ticket.id)"
            >
              <span class="material-symbols-outlined text-base">
                {{ transcripts[ticket.id] !== undefined ? 'expand_less' : 'chat_bubble' }}
              </span>
              {{ transcripts[ticket.id] !== undefined ? 'Tutup Transkrip' : 'Lihat Pesan' }}
            </button>
          </div>

          <!-- View transcript for non-pending -->
          <div v-if="ticket.status !== 'pending' && canActOnTicket(ticket)" class="ml-[52px]">
            <button
              class="flex items-center gap-1.5 text-xs transition-colors px-3 py-1.5 rounded-lg cursor-pointer"
              :class="transcripts[ticket.id] !== undefined
                ? 'text-primary bg-primary/8'
                : 'text-text-muted hover:text-text-heading hover:bg-surface'"
              @click="fetchTranscript(ticket.id)"
            >
              <span class="material-symbols-outlined text-base">
                {{ transcripts[ticket.id] !== undefined ? 'expand_less' : 'chat_bubble' }}
              </span>
              {{ transcripts[ticket.id] !== undefined ? 'Tutup Transkrip' : 'Lihat Pesan' }}
            </button>
          </div>
        </div>

        <!-- Transcript panel -->
        <div
          v-if="loadingTranscripts[ticket.id]"
          class="border-t border-border/30 px-4 py-3 flex items-center gap-2 text-sm text-text-muted bg-surface/50"
        >
          <span class="material-symbols-outlined text-base animate-spin">progress_activity</span>
          Memuat transkrip...
        </div>

        <div
          v-else-if="transcripts[ticket.id] !== undefined"
          class="border-t border-border/30 bg-surface/40"
        >
          <div class="px-4 py-2.5 flex items-center gap-2 border-b border-border/20">
            <span class="material-symbols-outlined text-base text-text-muted">chat</span>
            <span class="text-xs font-semibold text-text-muted uppercase tracking-wide">Transkrip Percakapan</span>
            <span class="text-xs text-text-muted ml-auto">{{ transcripts[ticket.id].length }} pesan</span>
          </div>

          <div v-if="transcripts[ticket.id].length === 0" class="px-4 py-6 text-center text-sm text-text-muted">
            Belum ada percakapan.
          </div>

          <div v-else class="px-4 py-3 space-y-2 max-h-56 overflow-y-auto">
            <div
              v-for="msg in transcripts[ticket.id]"
              :key="msg.id"
              class="flex gap-2"
              :class="msg.sender === 'you' ? 'flex-row-reverse' : 'flex-row'"
            >
              <!-- System message -->
              <div v-if="msg.type === 'system'" class="w-full text-center">
                <span class="inline-block text-[11px] text-text-muted bg-surface px-3 py-1 rounded-full border border-border/30">
                  {{ msg.content }}
                </span>
              </div>

              <!-- Avatar for other sender -->
              <template v-else>
                <div v-if="msg.sender === 'other'" class="w-6 h-6 rounded-full shrink-0 overflow-hidden bg-surface-variant flex items-center justify-center mt-1">
                  <img v-if="msg.avatar_url" :src="msg.avatar_url" class="w-full h-full object-cover" />
                  <span v-else class="material-symbols-outlined text-xs text-text-muted">person</span>
                </div>
                <div
                  class="max-w-[75%] px-3 py-2 rounded-xl text-xs leading-relaxed"
                  :class="{
                    'bg-primary text-white rounded-tr-sm': msg.sender === 'you',
                    'bg-surface-card text-text-heading border border-border/40 rounded-tl-sm': msg.sender === 'other'
                  }"
                >
                  <span v-if="msg.sender_name && msg.sender === 'other'" class="block text-[10px] font-semibold text-primary mb-0.5">{{ msg.sender_name }}</span>
                  <img
                    v-if="msg.image_url"
                    :src="msg.image_url"
                    alt="Gambar"
                    class="max-w-full rounded-lg mb-1.5"
                    style="max-height: 160px;"
                  />
                  <span v-if="msg.content">{{ msg.content }}</span>
                  <div class="text-[10px] mt-1 opacity-60">{{ formatDateTime(msg.at) }}</div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
