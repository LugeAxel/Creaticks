<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import type { User } from '@supabase/supabase-js'

const router = useRouter()
const user = ref<User | null>(null)
const activeTickets = ref<any[]>([])
const history = ref<any[]>([])
const loading = ref(true)

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

const fetchTickets = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/tickets', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
    if (res.ok) {
      const data = await res.json()
      const now = new Date()
      activeTickets.value = (data.tickets || []).filter((t: any) => new Date(t.event_date) >= now)
      history.value = (data.tickets || []).filter((t: any) => new Date(t.event_date) < now)
    }
  } catch {
    // ticket_requests table may not exist yet
  }
}

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  user.value = session?.user ?? null
  await fetchTickets()
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
        <p class="text-sm text-text-muted mt-1">Kelola tiket kamu di sini.</p>
      </div>

      <section v-if="loading" class="flex items-center justify-center py-12">
        <span class="material-symbols-outlined text-3xl text-primary animate-spin">sync</span>
      </section>

      <section v-else>
        <div v-if="activeTickets.length > 0" class="mb-8">
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Tiket Aktif</h2>
          <div class="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            <div
              v-for="ticket in activeTickets"
              :key="ticket.id"
              class="relative min-w-[280px] md:min-w-[340px] snap-start shrink-0"
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

        <div v-else class="mb-8 bg-surface-card rounded-2xl border border-border/50 p-8 text-center">
          <span class="material-symbols-outlined text-4xl text-text-muted mb-3">confirmation_number</span>
          <h2 class="text-headline-sm font-heading font-semibold text-text-heading mb-1">Belum ada tiket</h2>
          <p class="text-sm text-text-muted">Kamu belum memiliki tiket aktif. Cari event dan minta tiket sekarang!</p>
        </div>

        <div v-if="history.length > 0" class="mb-8">
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
          <button v-if="history.length > 5" class="w-full mt-4 text-sm font-semibold text-primary hover:underline py-2 cursor-pointer" @click="fetchTickets">
            Muat Lebih Banyak
          </button>
        </div>
      </section>
    </div>
  </AppLayout>
</template>
