<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'
import type { User } from '@supabase/supabase-js'

const router = useRouter()
const user = ref<User | null>(null)
const events = ref<any[]>([])
const loading = ref(true)

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

const activeEvents = computed(() =>
  events.value.filter(e => e.status === 'published' || e.status === 'draft')
)

const totalSold = computed(() => {
  let count = 0
  events.value.forEach(e => {
    if (e.ticket_count) count += e.ticket_count
  })
  return count
})
const totalRevenue = computed(() => {
  let rev = 0
  events.value.forEach(e => {
    if (e.total_revenue) rev += e.total_revenue
  })
  return rev
})

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  user.value = session?.user ?? null

  try {
    const token = session?.access_token
    const res = await fetch('/api/events', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (res.ok) {
      const data = await res.json()
      events.value = data.events || []
    }
  } catch {
    // silent
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AppLayout title="Dashboard">
    <div class="px-4 md:px-6 py-6 max-w-5xl mx-auto">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 class="text-xl font-heading font-bold text-text-heading">
            Selamat datang, {{ (user?.user_metadata?.name as string)?.split(' ')[0] || user?.email?.split('@')[0] || 'Kreator' }}!
          </h1>
          <p class="text-sm text-text-muted mt-1">Kelola acara dan pantau performa di sini.</p>
        </div>
        <div class="flex gap-2">
          <BaseButton variant="outline" size="md" @click="router.push('/events/saya')">
            Acara Saya
          </BaseButton>
          <BaseButton variant="accent" size="md" @click="router.push({ name: 'event-editor' })">
            <span class="material-symbols-outlined text-lg">add</span>
            Buat Acara
          </BaseButton>
        </div>
      </div>

      <SkeletonPage v-if="loading" type="dashboard" />

      <div v-else>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div class="bg-surface-card rounded-xl border border-border/50 p-4">
            <p class="text-2xl font-heading font-bold text-text-heading">{{ activeEvents.length }}</p>
            <p class="text-xs text-text-muted mt-1">Acara Aktif</p>
          </div>
          <div class="bg-surface-card rounded-xl border border-border/50 p-4">
            <p class="text-2xl font-heading font-bold text-text-heading">{{ totalSold }}</p>
            <p class="text-xs text-text-muted mt-1">Tiket Terjual</p>
          </div>
          <div class="bg-surface-card rounded-xl border border-border/50 p-4">
            <p class="text-2xl font-heading font-bold text-text-heading">Rp {{ totalRevenue.toLocaleString('id-ID') }}</p>
            <p class="text-xs text-text-muted mt-1">Pendapatan</p>
          </div>
          <div class="bg-surface-card rounded-xl border border-border/50 p-4">
            <p class="text-2xl font-heading font-bold text-text-heading">0</p>
            <p class="text-xs text-text-muted mt-1">Scan Hari Ini</p>
          </div>
        </div>

        <div v-if="activeEvents.length > 0" class="space-y-4 mb-8">
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide">Acara Aktif</h2>
          <div
            v-for="ev in activeEvents"
            :key="ev.id"
            class="bg-surface-card rounded-2xl border border-border/50 overflow-hidden"
          >
            <div v-if="ev.banner_url" class="h-32 bg-surface-variant overflow-hidden">
              <img :src="ev.banner_url" :alt="ev.title" class="w-full h-full object-cover" />
            </div>
            <div class="p-5">
              <div class="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h3 class="text-headline-sm font-heading font-semibold text-text-heading">{{ ev.title }}</h3>
                  <p class="text-xs text-text-muted mt-1">{{ formatDate(ev.date) }} {{ ev.location ? '- ' + ev.location : '' }}</p>
                </div>
                <span
                  class="shrink-0 text-[10px] font-semibold px-3 py-1 rounded-full"
                  :class="ev.status === 'published' ? 'bg-success/10 text-success border border-success/20' : 'bg-warning/10 text-warning border border-warning/20'"
                >
                  {{ ev.status === 'published' ? 'Published' : 'Draft' }}
                </span>
              </div>

              <div class="flex items-center justify-between text-xs text-text-muted mb-4">
                <span>0 / 0 tiket terjual</span>
                <span>0%</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-surface-variant overflow-hidden mb-4">
                <div class="h-full rounded-full bg-primary" style="width: 0%"></div>
              </div>

              <div class="flex gap-2">
                <BaseButton variant="outline" size="sm" @click="router.push(`/creator/events`)">Kelola</BaseButton>
                <BaseButton variant="ghost" size="sm" @click="router.push(`/acara`)">Lihat Pembeli</BaseButton>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="bg-surface-card rounded-2xl border border-border/50 p-8 text-center mb-8">
          <span class="material-symbols-outlined text-5xl text-text-muted mb-4">rocket_launch</span>
          <h2 class="text-headline-sm font-heading font-semibold text-text-heading mb-2">Punya Acara Baru?</h2>
          <p class="text-sm text-text-muted mb-6">Buat acara pertama kamu dan mulai jual tiket secara digital.</p>
          <BaseButton variant="accent" @click="router.push({ name: 'event-editor' })">
            Buat Acara
          </BaseButton>
        </div>

        <div class="bg-surface-card rounded-2xl border border-border/50 p-5">
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Aktivitas Tim</h2>
          <div class="relative pl-6 space-y-4">
            <div class="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border"></div>
            <div class="relative flex items-start gap-3">
              <div class="absolute -left-[19px] w-3 h-3 rounded-full bg-primary/30 border-2 border-primary"></div>
              <p class="text-xs text-text-muted">Belum ada aktivitas tim. Undang admin untuk mulai kolaborasi.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
