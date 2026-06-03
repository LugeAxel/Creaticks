<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useEventContext } from '@/composables/useEventContext'
import { supabase } from '@/lib/supabase'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'
import SeatMap from '@/components/seats/SeatMap.vue'
import type { SeatData, TierInfo } from '@/components/seats/SeatMap.vue'

const router = useRouter()
const { event } = useEventContext()

const stats = ref({ total: 0, pending: 0, checkedIn: 0, revenue: 0 })
const loading = ref(true)

const seats = ref<SeatData[]>([])
const seatMapGrid = ref({ gridX: 0, gridY: 0 })
const seatMapTiers = ref<TierInfo[]>([])
const selectedSeat = ref<SeatData | null>(null)
const showOwnerModal = ref(false)

const seatMapEnabled = computed(() => seatMapGrid.value.gridX > 0 && seatMapGrid.value.gridY > 0)

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

onMounted(async () => {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const [statsRes, seatsRes] = await Promise.all([
      fetch(`/api/tickets/event/${event.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch(`/api/events/${event.id}/seats/overview`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ])
    if (statsRes.ok) {
      const data = await statsRes.json()
      const tickets = data.tickets || []
      stats.value = {
        total: tickets.length,
        pending: tickets.filter((t: any) => t.status === 'pending').length,
        checkedIn: tickets.filter((t: any) => t.is_checked_in).length,
        revenue: tickets.filter((t: any) => t.status === 'confirmed').length * 50000
      }
    }
    if (seatsRes.ok) {
      const data = await seatsRes.json()
      const rawSeats = data.seats || []
      seats.value = rawSeats.map((s: any) => ({
        id: s.id,
        seat_code: s.seat_code,
        tier_id: s.tier_id,
        x: s.x,
        y: s.y,
        status: s.status === 'sold' ? 'owned' : s.status,
        owner_name: s.owner_name
      }))
      if ((event as any).seat_map) {
        const sm = typeof (event as any).seat_map === 'string' ? JSON.parse((event as any).seat_map) : (event as any).seat_map
        if (sm?.gridX && sm?.gridY) {
          seatMapGrid.value = { gridX: sm.gridX, gridY: sm.gridY }
        }
      }
      if ((event as any).ticket_tiers) {
        seatMapTiers.value = (event as any).ticket_tiers.map((t: any) => ({
          id: t.id,
          name: t.name,
          price: t.price,
          color: t.color || '#6C63FF'
        }))
      }
    }
  } catch (e) {
    console.warn('Failed to fetch overview data:', e)
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

    <SkeletonPage v-if="loading" type="stats" />

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

      <div v-if="seatMapEnabled" class="bg-surface-card rounded-xl border border-border/50 p-5">
        <h2 class="text-sm font-semibold text-text-heading mb-4">Denah Kursi</h2>
        <div class="overflow-x-auto">
          <SeatMap
            :seats="seats"
            :gridX="seatMapGrid.gridX"
            :gridY="seatMapGrid.gridY"
            :tiers="seatMapTiers"
            :readonly="true"
            :showOwnerInfo="true"
            :cellSize="28"
            @info="(s) => { selectedSeat = s; showOwnerModal = true }"
          />
        </div>
      </div>

      <!-- Owner Info Modal -->
      <div v-if="showOwnerModal && selectedSeat" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" @click.self="showOwnerModal = false">
        <div class="bg-surface-card rounded-2xl shadow-xl p-6 max-w-sm w-full">
          <div class="flex items-center gap-3 mb-4">
            <span class="material-symbols-outlined text-2xl text-primary">event_seat</span>
            <h3 class="text-lg font-heading font-bold text-text-heading">Info Kursi</h3>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-text-muted">Kursi</span>
              <span class="font-semibold text-text-heading">{{ selectedSeat.seat_code }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Status</span>
              <span class="font-semibold" :class="selectedSeat.status === 'checked_in' ? 'text-teal-500' : 'text-amber-600'">{{ selectedSeat.status === 'checked_in' ? 'Check-in' : 'Terjual' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-muted">Pemilik</span>
              <span class="font-semibold text-text-heading">{{ selectedSeat.owner_name || '-' }}</span>
            </div>
          </div>
          <button class="mt-5 w-full py-2 rounded-xl bg-primary text-white text-sm font-semibold cursor-pointer hover:bg-primary/90 transition" @click="showOwnerModal = false">
            Tutup
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
