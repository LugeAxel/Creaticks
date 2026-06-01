<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AppLayout from '@/components/layout/AppLayout.vue'
import BackButton from '@/components/shared/BackButton.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

interface Attendee {
  id: string
  user_id: string
  tier_name: string
  is_checked_in: boolean
  checked_in_at: string | null
  created_at: string
  profiles?: { name: string; email: string }
}

const route = useRoute()
const router = useRouter()
const eventId = route.params.eventId as string

const tickets = ref<Attendee[]>([])
const loading = ref(true)
const searchQuery = ref('')
const attendanceChannel = ref<any>(null)

const filteredTickets = computed(() => {
  if (!searchQuery.value.trim()) return tickets.value
  const q = searchQuery.value.toLowerCase()
  return tickets.value.filter(t => {
    const name = t.profiles?.name?.toLowerCase() || ''
    const email = t.profiles?.email?.toLowerCase() || ''
    return name.includes(q) || email.includes(q)
  })
})

const stats = computed(() => {
  const total = tickets.value.length
  const checkedIn = tickets.value.filter(t => t.is_checked_in).length
  return {
    total,
    checkedIn,
    percentage: total > 0 ? Math.round((checkedIn / total) * 100) : 0,
    remaining: total - checkedIn
  }
})

const recentCheckins = computed(() => {
  return tickets.value
    .filter(t => t.is_checked_in && t.checked_in_at)
    .sort((a, b) => new Date(b.checked_in_at!).getTime() - new Date(a.checked_in_at!).getTime())
    .slice(0, 10)
})

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

const exportCSV = () => {
  const headers = ['Nama', 'Email', 'Tier', 'Status', 'Waktu Check-in']
  const rows = tickets.value.map(t => [
    t.profiles?.name || '',
    t.profiles?.email || '',
    t.tier_name,
    t.is_checked_in ? 'Hadir' : 'Belum',
    t.checked_in_at ? formatDate(t.checked_in_at) : ''
  ])

  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `attendance-${eventId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const fetchAttendance = async () => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  try {
    const res = await fetch(`/api/tickets/event/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      tickets.value = data.tickets || []
    }
  } catch (e) {
    console.warn('Failed to fetch attendance:', e)
  } finally {
    loading.value = false
  }
}

const subscribeToRealtime = () => {
  attendanceChannel.value = supabase
    .channel(`attendance_${eventId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'ticket_requests',
        filter: `event_id=eq.${eventId}`
      },
      async (payload: any) => {
        const updated = payload.new as Attendee
        const idx = tickets.value.findIndex(t => t.id === updated.id)
        if (idx !== -1) {
          tickets.value[idx] = { ...tickets.value[idx], ...updated }
        }
      }
    )
    .subscribe()
}

onMounted(() => {
  fetchAttendance()
  subscribeToRealtime()
})

onUnmounted(() => {
  if (attendanceChannel.value) {
    supabase.removeChannel(attendanceChannel.value as any)
  }
})
</script>

<template>
  <AppLayout>
    <div class="min-h-screen bg-surface p-4 pb-28">
      <div class="max-w-screen-lg mx-auto">
        <div class="flex items-center gap-3 mb-6">
          <BackButton />
          <h1 class="text-xl font-heading font-bold text-text-heading">Kehadiran</h1>
        </div>

        <SkeletonPage v-if="loading" type="list" />

        <template v-else>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div class="bg-surface-card rounded-2xl border border-border/50 p-4 text-center">
              <p class="text-2xl font-heading font-bold text-text-heading">{{ stats.total }}</p>
              <p class="text-xs text-text-muted">Total Tiket</p>
            </div>
            <div class="bg-surface-card rounded-2xl border border-border/50 p-4 text-center">
              <p class="text-2xl font-heading font-bold text-teal-500">{{ stats.checkedIn }}</p>
              <p class="text-xs text-text-muted">Check-in</p>
            </div>
            <div class="bg-surface-card rounded-2xl border border-border/50 p-4 text-center">
              <p class="text-2xl font-heading font-bold text-primary">{{ stats.percentage }}%</p>
              <p class="text-xs text-text-muted">Persentase</p>
            </div>
            <div class="bg-surface-card rounded-2xl border border-border/50 p-4 text-center">
              <p class="text-2xl font-heading font-bold text-amber-500">{{ stats.remaining }}</p>
              <p class="text-xs text-text-muted">Sisa</p>
            </div>
          </div>

          <div v-if="recentCheckins.length > 0" class="bg-surface-card rounded-2xl border border-border/50 p-4 mb-6">
            <h3 class="text-sm font-semibold text-text-heading mb-3">Check-in Terbaru</h3>
            <div class="space-y-2">
              <div
                v-for="attendee in recentCheckins"
                :key="attendee.id"
                class="flex items-center gap-3 text-sm"
              >
                <span class="w-2 h-2 rounded-full bg-teal-500 shrink-0"></span>
                <span class="font-medium text-text-heading">{{ attendee.profiles?.name }}</span>
                <span class="text-xs text-text-muted">{{ attendee.tier_name }}</span>
                <span class="text-xs text-text-muted ml-auto">{{ attendee.checked_in_at ? formatTime(attendee.checked_in_at) : '' }}</span>
              </div>
            </div>
          </div>

          <div class="bg-surface-card rounded-2xl border border-border/50 p-4">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex-1 relative">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-lg">search</span>
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Cari peserta..."
                  class="w-full pl-10 pr-4 py-2 rounded-xl border border-border/50 bg-surface text-sm outline-none focus:border-teal-500 transition-colors"
                />
              </div>
              <BaseButton variant="secondary" size="sm" @click="exportCSV">
                <span class="material-symbols-outlined text-sm mr-1">download</span>
                Export CSV
              </BaseButton>
            </div>

            <div v-if="filteredTickets.length === 0" class="text-center py-10">
              <span class="material-symbols-outlined text-4xl text-text-muted mb-3">people</span>
              <p class="text-sm text-text-muted">Tidak ada peserta ditemukan</p>
            </div>

            <div class="md:hidden space-y-2">
              <div
                v-for="ticket in filteredTickets"
                :key="ticket.id"
                class="flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-surface-card"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-text-heading truncate">{{ ticket.profiles?.name || 'Unknown' }}</p>
                  <p class="text-xs text-text-muted truncate">{{ ticket.profiles?.email || '' }}</p>
                  <div class="flex items-center gap-2 mt-1.5">
                    <span class="text-[11px] text-text-muted bg-surface px-1.5 py-0.5 rounded">{{ ticket.tier_name }}</span>
                    <span
                      class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      :class="ticket.is_checked_in ? 'bg-teal-500/10 text-teal-600' : 'bg-amber-500/10 text-amber-600'"
                    >{{ ticket.is_checked_in ? 'Hadir' : 'Belum' }}</span>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <span class="text-[11px] text-text-muted">{{ ticket.checked_in_at ? formatTime(ticket.checked_in_at) : '-' }}</span>
                </div>
              </div>
            </div>

            <div class="hidden md:block overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left text-xs text-text-muted border-b border-border/50">
                    <th class="pb-3 font-semibold">Nama</th>
                    <th class="pb-3 font-semibold">Email</th>
                    <th class="pb-3 font-semibold">Tier</th>
                    <th class="pb-3 font-semibold">Status</th>
                    <th class="pb-3 font-semibold">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="ticket in filteredTickets"
                    :key="ticket.id"
                    class="border-b border-border/30"
                  >
                    <td class="py-3 text-text-heading font-medium">{{ ticket.profiles?.name || 'Unknown' }}</td>
                    <td class="py-3 text-text-muted">{{ ticket.profiles?.email || '' }}</td>
                    <td class="py-3 text-text-muted">{{ ticket.tier_name }}</td>
                    <td class="py-3">
                      <span
                        class="text-xs font-semibold px-2 py-1 rounded-full"
                        :class="ticket.is_checked_in ? 'bg-teal-500/10 text-teal-600' : 'bg-amber-500/10 text-amber-600'"
                      >{{ ticket.is_checked_in ? 'Hadir' : 'Belum' }}</span>
                    </td>
                    <td class="py-3 text-text-muted text-xs">{{ ticket.checked_in_at ? formatTime(ticket.checked_in_at) : '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>
    </div>
  </AppLayout>
</template>
