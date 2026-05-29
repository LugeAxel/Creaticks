<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import type { User } from '@supabase/supabase-js'

const router = useRouter()
const user = ref<User | null>(null)
const upcomingEvents = ref<any[]>([])
const activeTickets = ref<any[]>([])
const history = ref<any[]>([])
const loading = ref(true)

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

const formatFullDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric'
  })
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
      activeTickets.value = (data.tickets || []).filter((t: any) => new Date(t.event_date) >= now)
      history.value = (data.tickets || []).filter((t: any) => new Date(t.event_date) < now)
    }
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
      <div class="mb-6">
        <h1 class="text-xl font-heading font-bold text-text-heading">
          Hai, {{ (user?.user_metadata?.name as string)?.split(' ')[0] || user?.email?.split('@')[0] || 'Pengguna' }}!
        </h1>
        <p class="text-sm text-text-muted mt-1">Temukan event seru dan kelola tiket kamu di sini.</p>
      </div>

      <section v-if="loading" class="flex items-center justify-center py-12">
        <span class="material-symbols-outlined text-3xl text-primary animate-spin">sync</span>
      </section>

      <section v-else class="space-y-8">
        <!-- Upcoming Events -->
        <div v-if="upcomingEvents.length > 0">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide">Event Mendatang</h2>
            <button class="text-xs font-semibold text-primary hover:underline cursor-pointer" @click="router.push('/acara')">Lihat Semua</button>
          </div>
          <div class="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            <div
              v-for="ev in upcomingEvents"
              :key="ev.id"
              class="min-w-[260px] md:min-w-[300px] snap-start shrink-0 cursor-pointer"
              @click="router.push(`/events/${ev.id}`)"
            >
              <div class="bg-surface-card rounded-2xl border border-border/50 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div class="h-32 bg-surface-variant overflow-hidden">
                  <img v-if="ev.banner_url" :src="ev.banner_url" :alt="ev.title" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
                    <span class="material-symbols-outlined text-3xl text-primary/40">event</span>
                  </div>
                </div>
                <div class="p-4">
                  <p class="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1">{{ ev.category || 'Event' }}</p>
                  <h3 class="text-sm font-heading font-bold text-text-heading truncate">{{ ev.title }}</h3>
                  <p class="text-xs text-text-muted mt-1.5 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[12px]">calendar_today</span>
                    {{ formatFullDate(ev.date) }}
                  </p>
                  <p v-if="ev.location" class="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                    <span class="material-symbols-outlined text-[12px]">location_on</span>
                    {{ ev.location }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- CTA when no events -->
        <div v-else class="bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl border border-primary/20 p-6 text-center">
          <span class="material-symbols-outlined text-4xl text-primary mb-3">explore</span>
          <h2 class="text-headline-sm font-heading font-semibold text-text-heading mb-1">Cari Event Menarik</h2>
          <p class="text-sm text-text-muted mb-4">Temukan event seru di sekitar kamu dan dapatkan tiketnya!</p>
          <BaseButton variant="primary" size="md" @click="router.push('/acara')">Jelajahi Event</BaseButton>
        </div>

        <!-- Active Tickets -->
        <div v-if="activeTickets.length > 0">
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Tiket Aktif</h2>
          <div class="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            <div
              v-for="ticket in activeTickets"
              :key="ticket.id"
              class="relative min-w-[260px] md:min-w-[300px] snap-start shrink-0"
            >
              <div class="absolute inset-0 translate-x-1.5 translate-y-1.5 bg-primary/15 rounded-2xl" />
              <div class="relative bg-surface-card rounded-2xl border border-border/50 overflow-hidden shadow-sm">
                <div class="h-32 bg-gradient-to-br from-primary to-primary-dark relative">
                  <div class="absolute inset-0 opacity-10" style="background-image: radial-gradient(circle, #fff 1px, transparent 1px); background-size: 16px 16px;"></div>
                  <div class="absolute bottom-3 left-4 right-4">
                    <h3 class="text-white font-heading font-bold text-lg drop-shadow-sm">{{ ticket.event_name }}</h3>
                    <p class="text-white/80 text-xs">{{ formatDate(ticket.event_date) }}</p>
                  </div>
                </div>
                <div class="px-4 py-4">
                  <div class="flex items-center justify-between mb-3">
                    <div>
                      <p class="text-sm font-semibold text-text-heading">{{ ticket.tier_name || 'Regular' }}</p>
                      <p class="text-xs text-text-muted">{{ ticket.ticket_id }}</p>
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

        <!-- History -->
        <div v-if="history.length > 0">
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Riwayat</h2>
          <div class="space-y-3">
            <div
              v-for="item in history"
              :key="item.id"
              class="flex items-center justify-between bg-surface-card rounded-xl border border-border/50 p-4"
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
