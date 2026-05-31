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
const stats = ref<{
  totalEvents: number
  totalSold: number
  totalRevenue: number
  todayScans: number
  activeEvents: any[]
  recentActivity: any[]
} | null>(null)
const loading = ref(true)

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric'
  })
}

const formatCurrency = (amount: number) => {
  return `Rp ${amount.toLocaleString('id-ID')}`
}

const activityLabel = (action: string) => {
  const labels: Record<string, string> = {
    invited: 'mengundang admin baru',
    accepted: 'menerima undangan',
    rejected: 'menolak undangan',
    removed: 'menghapus admin',
    roles_updated: 'memperbarui role admin',
    claim_ticket: 'mengklaim tiket',
    release_ticket: 'melepaskan tiket',
    confirm_ticket: 'mengonfirmasi tiket',
    cancel_ticket: 'membatalkan tiket'
  }
  return labels[action] || action
}

const activityIcon = (action: string) => {
  const icons: Record<string, string> = {
    invited: 'person_add',
    accepted: 'check_circle',
    rejected: 'cancel',
    removed: 'remove_circle',
    roles_updated: 'edit',
    claim_ticket: 'touch_app',
    release_ticket: 'undo',
    confirm_ticket: 'check_circle',
    cancel_ticket: 'cancel'
  }
  return icons[action] || 'history'
}

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  user.value = session?.user ?? null

  try {
    const token = session?.access_token
    const res = await fetch('/api/events/creator-stats', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (res.ok) {
      stats.value = await res.json()
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

      <div v-else-if="stats">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div class="bg-surface-card rounded-xl border border-border/50 p-4">
            <p class="text-2xl font-heading font-bold text-text-heading">{{ stats.activeEvents.length }}</p>
            <p class="text-xs text-text-muted mt-1">Acara Aktif</p>
          </div>
          <div class="bg-surface-card rounded-xl border border-border/50 p-4">
            <p class="text-2xl font-heading font-bold text-text-heading">{{ stats.totalSold }}</p>
            <p class="text-xs text-text-muted mt-1">Tiket Terjual</p>
          </div>
          <div class="bg-surface-card rounded-xl border border-border/50 p-4">
            <p class="text-2xl font-heading font-bold text-text-heading">{{ formatCurrency(stats.totalRevenue) }}</p>
            <p class="text-xs text-text-muted mt-1">Pendapatan</p>
          </div>
          <div class="bg-surface-card rounded-xl border border-border/50 p-4">
            <p class="text-2xl font-heading font-bold text-text-heading">{{ stats.todayScans }}</p>
            <p class="text-xs text-text-muted mt-1">Scan Hari Ini</p>
          </div>
        </div>

        <div v-if="stats.activeEvents.length > 0" class="space-y-4 mb-8">
          <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide">Acara Aktif</h2>
          <div
            v-for="ev in stats.activeEvents"
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
                <span>{{ ev.ticketSold }} / {{ ev.ticketQuota }} tiket terjual</span>
                <span>{{ ev.ticketQuota > 0 ? ev.soldPct : 0 }}%</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-surface-variant overflow-hidden mb-4">
                <div class="h-full rounded-full bg-primary" :style="{ width: ev.ticketQuota > 0 ? ev.soldPct + '%' : '0%' }"></div>
              </div>

              <div class="flex gap-2">
                <BaseButton variant="outline" size="sm" @click="router.push(`/events/${ev.id}/manage/overview`)">Kelola</BaseButton>
                <BaseButton variant="ghost" size="sm" @click="router.push(`/events/${ev.id}`)">Lihat Halaman</BaseButton>
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
          <div v-if="stats.recentActivity.length > 0" class="relative pl-6 space-y-4">
            <div class="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border"></div>
            <div v-for="act in stats.recentActivity" :key="act.id" class="relative flex items-start gap-3">
              <div class="absolute -left-[19px] w-3 h-3 rounded-full bg-primary/30 border-2 border-primary"></div>
              <span class="material-symbols-outlined text-sm text-primary mt-0.5">{{ activityIcon(act.action) }}</span>
              <div>
                <p class="text-xs text-text">
                  <span class="font-semibold">{{ act.performer }}</span>
                  <span class="text-text-muted"> {{ activityLabel(act.action) }}</span>
                </p>
                <p class="text-[10px] text-text-muted mt-0.5">{{ formatDate(act.createdAt) }}</p>
              </div>
            </div>
          </div>
          <div v-else class="relative pl-6">
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
