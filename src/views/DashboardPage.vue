<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { fetchWithoutAuth } from '@/lib/api'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import EventCard from '@/components/shared/EventCard.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'
import type { User } from '@supabase/supabase-js'

const router = useRouter()
const user = ref<User | null>(null)
const upcomingEvents = ref<any[]>([])
const activeTickets = ref<any[]>([])
const history = ref<any[]>([])
const globalStats = ref<{
  recent_sales_1h: number
  total_sold: number
  checked_in_count: number
  event_count: number
} | null>(null)
const loading = ref(true)

const isCreator = computed(() => user.value?.user_metadata?.role === 'creator')

const firstName = computed(() => {
  return (user.value?.user_metadata?.name as string)?.split(' ')[0]
    || user.value?.email?.split('@')[0]
    || 'Pengguna'
})

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return `Selamat Pagi, ${firstName.value}!`
  if (h < 15) return `Selamat Siang, ${firstName.value}!`
  if (h < 19) return `Selamat Sore, ${firstName.value}!`
  return `Selamat Malam, ${firstName.value}!`
})

const nearestTicket = computed(() => {
  if (!activeTickets.value.length) return null
  return [...activeTickets.value].sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
  )[0]
})

const contextualSubtitle = computed(() => {
  if (!nearestTicket.value) {
    if (upcomingEvents.value.length > 0)
      return `Ada ${upcomingEvents.value.length} acara seru minggu ini. Yuk cari tiketnya!`
    return 'Belum ada tiket? Yuk jelajahi acara di sekitarmu!'
  }
  const diff = new Date(nearestTicket.value.event_date).getTime() - Date.now()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Acaramu dimulai hari ini! Siapkan QR-mu ya.'
  if (days <= 7) return `Kamu punya tiket untuk "${nearestTicket.value.event_name}" — ${daysUntil(nearestTicket.value.event_date)}`
  return `Kamu punya ${activeTickets.value.length} tiket aktif. Semangat!`
})

const historyCompletedCount = computed(() =>
  history.value.filter((h: any) => h.status === 'completed').length
)

const allTickets = computed(() => [...activeTickets.value, ...history.value])

const favoriteCategory = computed(() => {
  const cats = allTickets.value.map((t: any) => t.event_category).filter(Boolean)
  if (!cats.length) return ''
  const counts: Record<string, number> = {}
  cats.forEach(c => { counts[c] = (counts[c] || 0) + 1 })
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
})

const recommendedEvents = computed(() => {
  if (!favoriteCategory.value) return []
  return upcomingEvents.value.filter((e: any) => e.category === favoriteCategory.value)
})

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff <= 0) return 'Hari Ini'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (days === 0) return 'Hari Ini'
  if (days === 1) return 'Besok'
  if (hours < 24) return `${hours} Jam Lagi`
  return `${days} Hari Lagi`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

function formatFullDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
  })
}

function ticketUrgency(ticket: any): { border: string; badge: string | null; pulse?: boolean } {
  const diff = new Date(ticket.event_date).getTime() - Date.now()
  const hours = diff / (1000 * 60 * 60)
  if (hours <= 24) return { border: '#FF3B3B', badge: 'HARI INI', pulse: true }
  if (hours <= 72) return { border: '#FFB347', badge: 'SEGERA' }
  return { border: '#6C63FF', badge: null }
}

const fetchData = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const token = session.access_token

    const [eventsRes, ticketsRes] = await Promise.all([
      fetch('/api/events/published'),
      fetch('/api/tickets', { headers: { Authorization: `Bearer ${token}` } })
    ])

    if (eventsRes.ok) {
      const data = await eventsRes.json()
      const now = new Date()
      upcomingEvents.value = (data.events || [])
        .filter((e: any) => new Date(e.date) >= now)
        .slice(0, 5)
    }

    if (ticketsRes.ok) {
      const data = await ticketsRes.json()
      const now = new Date()
      activeTickets.value = (data.tickets || [])
        .filter((t: any) => new Date(t.event_date) >= now && t.status !== 'cancelled' && t.status !== 'expired')
      history.value = (data.tickets || [])
        .filter((t: any) => new Date(t.event_date) < now && t.status !== 'cancelled' && t.status !== 'expired')
    }

    // Fetch global platform stats
    const statsRes = await fetchWithoutAuth('/api/stats')
    if (statsRes.ok) globalStats.value = await statsRes.json()
  } catch {
    // fail silently
  }
}

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  user.value = session?.user ?? null
  await fetchData()
  loading.value = false
})
</script>

<template>
  <AppLayout title="Beranda">
    <div class="px-4 md:px-6 py-6 max-w-5xl mx-auto">
      <SkeletonPage v-if="loading" type="dashboard" />

      <section v-else class="space-y-7">
        <!-- Hero Greeting -->
        <div class="relative overflow-hidden rounded-2xl bg-surface-card border border-border/50 p-5 md:p-6">
          <div class="hero-bg absolute inset-0 pointer-events-none" />
          <div class="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div class="flex-1">
              <h1 class="text-2xl font-heading font-bold text-text-heading">{{ greeting }}</h1>
              <p class="text-sm text-text-muted mt-1 max-w-lg">{{ contextualSubtitle }}</p>
            </div>
            <div
              v-if="nearestTicket"
              class="shrink-0 rounded-2xl px-5 py-4 text-white min-w-[200px]"
              style="background-color: #6C63FF;"
            >
              <p class="text-xs font-medium text-white/70">Acara Terdekat</p>
              <p class="text-xl font-heading font-bold mt-0.5">{{ daysUntil(nearestTicket.event_date) }}</p>
              <p class="text-xs text-white/80 truncate mt-0.5">{{ nearestTicket.event_name }}</p>
              <button
                class="mt-2 text-[11px] font-semibold underline underline-offset-2 text-white/80 hover:text-white cursor-pointer"
                @click="router.push(`/tickets/${nearestTicket.id}`)"
              >
                Lihat Tiket
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          <button
            class="shrink-0 flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-variant transition-colors cursor-pointer"
            @click="router.push('/acara')"
          >
            <span class="material-symbols-outlined text-lg">search</span>
            Cari Acara
          </button>
          <button
            class="shrink-0 flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-variant transition-colors cursor-pointer"
            @click="router.push('/tiket')"
          >
            <span class="material-symbols-outlined text-lg">confirmation_number</span>
            Tiket Saya
          </button>
          <button v-if="isCreator"
            class="shrink-0 flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-variant transition-colors cursor-pointer"
            @click="router.push('/acara-saya')"
          >
            <span class="material-symbols-outlined text-lg">event</span>
            Acara Saya
          </button>
          <button v-if="isCreator"
            class="shrink-0 flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-variant transition-colors cursor-pointer"
            @click="router.push({ name: 'event-editor' })"
          >
            <span class="material-symbols-outlined text-lg">add_circle</span>
            Buat Acara
          </button>
        </div>

        <!-- Fun Fact -->
        <div v-if="favoriteCategory" class="bg-gradient-to-r from-primary/5 to-accent/5 rounded-2xl border border-primary/10 px-5 py-4">
          <p class="text-sm text-text-heading">
            <span class="font-semibold">Kamu suka acara {{ favoriteCategory }}!</span>
            <span class="text-text-muted"> Terus eksplorasi event seru di kategori ini.</span>
          </p>
        </div>

        <!-- Platform Stats -->
        <div v-if="globalStats" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="bg-surface-card rounded-xl border border-border/50 p-4 flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-lg text-primary">confirmation_number</span>
            </div>
            <div>
              <p class="text-xs text-text-muted">Total Tiket Terjual</p>
              <p class="text-sm font-bold text-text-heading">{{ globalStats.total_sold.toLocaleString('id-ID') }}</p>
            </div>
          </div>
          <div class="bg-surface-card rounded-xl border border-border/50 p-4 flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-lg text-warning">bolt</span>
            </div>
            <div>
              <p class="text-xs text-text-muted">Terjual 1 Jam</p>
              <p class="text-sm font-bold text-text-heading">{{ globalStats.recent_sales_1h.toLocaleString('id-ID') }} tiket</p>
            </div>
          </div>
          <div class="bg-surface-card rounded-xl border border-border/50 p-4 flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-lg text-success">groups</span>
            </div>
            <div>
              <p class="text-xs text-text-muted">Penonton Hadir</p>
              <p class="text-sm font-bold text-text-heading">{{ globalStats.checked_in_count.toLocaleString('id-ID') }} orang</p>
            </div>
          </div>
          <div class="bg-surface-card rounded-xl border border-border/50 p-4 flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-lg text-primary">event</span>
            </div>
            <div>
              <p class="text-xs text-text-muted">Acara Aktif</p>
              <p class="text-sm font-bold text-text-heading">{{ globalStats.event_count.toLocaleString('id-ID') }} acara</p>
            </div>
          </div>
        </div>

        <!-- Active Tickets -->
        <div v-if="activeTickets.length > 0">
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">
            {{ activeTickets.length === 1 ? 'Tiket Kamu' : `Tiket Kamu (${activeTickets.length})` }}
          </h2>
          <div class="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            <div
              v-for="ticket in activeTickets"
              :key="ticket.id"
              class="relative min-w-[260px] md:min-w-[300px] snap-start shrink-0"
            >
              <!-- Urgency top border -->
              <div
                v-if="ticketUrgency(ticket).badge"
                class="absolute -top-px left-4 right-4 h-[3px] rounded-t-xl z-10"
                :style="{ backgroundColor: ticketUrgency(ticket).border }"
              />
              <!-- Card -->
              <div class="bg-surface-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">
                <!-- Top zone: gradient + dot pattern -->
                <div
                  class="relative h-[120px] bg-gradient-to-br from-primary to-[#4A3FD4]"
                  :style="{
                    clipPath: 'polygon(0 0, 100% 0, 100% 82%, 0 100%)'
                  }"
                >
                  <div
                    class="absolute inset-0 opacity-10"
                    style="background-image: radial-gradient(circle, #fff 1px, transparent 1px); background-size: 16px 16px;"
                  />
                  <div class="absolute bottom-5 left-4 right-4">
                    <h3 class="text-white font-heading font-bold text-base drop-shadow-sm truncate">{{ ticket.event_name }}</h3>
                    <p class="text-white/80 text-xs mt-0.5">{{ formatDate(ticket.event_date) }}</p>
                  </div>
                  <!-- Urgency badge -->
                  <div
                    v-if="ticketUrgency(ticket).badge"
                    class="absolute top-3 right-3 z-10 px-2.5 py-0.5 rounded-full font-mono text-[9px] font-bold tracking-wider text-white shadow-lg"
                    :class="ticketUrgency(ticket).pulse ? 'badge-pulse' : ''"
                    :style="{ backgroundColor: ticketUrgency(ticket).border }"
                  >
                    {{ ticketUrgency(ticket).badge }}
                  </div>
                </div>
                <!-- Bottom zone -->
                <div class="px-4 py-4">
                  <div class="flex items-center justify-between mb-3">
                    <div>
                      <p class="text-sm font-semibold text-text-heading">{{ ticket.tier_name || 'Regular' }}</p>
                      <p class="text-xs text-text-muted font-mono mt-0.5">{{ ticket.ticket_id }}</p>
                    </div>
                    <span
                      class="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                      :class="ticket.status === 'confirmed' ? 'bg-success/10 text-success border border-success/20' : ticket.status === 'pending' ? 'bg-warning/10 text-warning border border-warning/20' : 'bg-error/10 text-error border border-error/20'"
                    >
                      {{ ticket.status === 'confirmed' ? 'Aktif' : ticket.status === 'pending' ? 'Menunggu' : 'Batal' }}
                    </span>
                  </div>
                  <BaseButton variant="primary" size="sm" fullWidth @click="router.push(`/tickets/${ticket.id}`)">
                    Tampilkan QR
                  </BaseButton>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Upcoming Events -->
        <div>
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide">Acara Untukmu</h2>
            <button class="text-xs font-semibold text-primary hover:underline cursor-pointer" @click="router.push('/acara')">
              Lihat Semua
            </button>
          </div>

          <div v-if="upcomingEvents.length > 0" class="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            <div
              v-for="ev in upcomingEvents"
              :key="ev.id"
              class="min-w-[200px] md:min-w-[220px] snap-start shrink-0"
            >
              <EventCard :event="ev" />
            </div>
          </div>

          <div v-else class="rounded-2xl border-2 border-dashed border-border/60 p-8 text-center">
            <span class="material-symbols-outlined text-5xl text-text-muted mb-3">explore</span>
            <h3 class="text-base font-heading font-semibold text-text-heading mb-1">Belum ada acara baru</h3>
            <p class="text-sm text-text-muted mb-4">Cek lagi nanti, atau bagikan Creatick ke temanmu yang punya event!</p>
            <BaseButton variant="primary" size="sm" @click="router.push('/acara')">Cari Acara</BaseButton>
          </div>
        </div>

        <!-- Recommendations -->
        <div v-if="recommendedEvents.length > 0">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide">Rekomendasi untukmu</h2>
          </div>
          <div class="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            <div
              v-for="ev in recommendedEvents"
              :key="ev.id"
              class="min-w-[200px] md:min-w-[220px] snap-start shrink-0"
            >
              <EventCard :event="ev" />
            </div>
          </div>
        </div>

        <!-- History -->
        <div v-if="history.length > 0">
          <div class="flex items-center gap-2 mb-4">
            <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide">Riwayat</h2>
            <span class="text-xs text-text-muted/70">({{ historyCompletedCount }} acara sudah kamu hadiri)</span>
          </div>
          <div class="space-y-3">
            <div
              v-for="item in history"
              :key="item.id"
              class="flex items-center justify-between bg-surface-card rounded-xl border border-border/50 p-4 cursor-pointer hover:shadow-sm transition-shadow"
              :class="item.status !== 'completed' ? 'opacity-60' : ''"
              :style="{
                borderLeft: `3px solid ${item.status === 'completed' ? '#43C6AC' : '#FF3B3B'}`,
                borderTopLeftRadius: '4px',
                borderBottomLeftRadius: '4px'
              }"
              @click="router.push(`/tickets/${item.id}`)"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-lg text-text-muted">confirmation_number</span>
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-text-heading truncate">{{ item.event_name }}</p>
                  <p class="text-xs text-text-muted">{{ formatDate(item.event_date) }}</p>
                </div>
              </div>
              <span
                class="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full"
                :class="item.status === 'completed' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'"
              >
                {{ item.status === 'completed' ? 'Selesai' : 'Batal' }}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </AppLayout>
</template>

<style scoped>
.hero-bg {
  background: linear-gradient(135deg, rgba(108,99,255,0.12), rgba(255,101,132,0.12), rgba(67,198,172,0.12), rgba(255,179,71,0.12));
  background-size: 300% 300%;
  animation: hue-shift 8s ease-in-out infinite alternate;
}

@keyframes hue-shift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.badge-pulse {
  animation: pulse-glow 1.5s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
</style>