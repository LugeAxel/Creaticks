<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useEventContext } from '@/composables/useEventContext'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

const { event } = useEventContext()
const eventId = event.id

const loading = ref(true)

interface TierData {
  name: string
  price: number
  sold_count: number
  quota: number
}

const analytics = ref<{
  tiers: TierData[]
  status_counts: { confirmed: number; pending: number; cancelled: number }
  total_sold: number
  total_revenue: number
} | null>(null)

const formatPrice = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID')

const totalAll = computed(() => {
  if (!analytics.value) return 0
  const s = analytics.value.status_counts
  return (s.confirmed || 0) + (s.pending || 0) + (s.cancelled || 0)
})

// Compute SVG pie chart segments
const pieSegments = computed(() => {
  if (!analytics.value || totalAll.value === 0) return []
  const s = analytics.value.status_counts
  const data = [
    { label: 'Confirmed', value: s.confirmed || 0, color: '#14b8a6' },
    { label: 'Pending',   value: s.pending   || 0, color: '#f59e0b' },
    { label: 'Dibatalkan',value: s.cancelled  || 0, color: '#ef4444' }
  ]
  const total = data.reduce((a, d) => a + d.value, 0)
  if (total === 0) return []

  let cumAngle = -Math.PI / 2
  const cx = 80; const cy = 80; const r = 70

  return data.map(d => {
    const angle = (d.value / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(cumAngle)
    const y1 = cy + r * Math.sin(cumAngle)
    cumAngle += angle
    const x2 = cx + r * Math.cos(cumAngle)
    const y2 = cy + r * Math.sin(cumAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
    return { ...d, path, pct: Math.round((d.value / total) * 100) }
  })
})

// Bar chart max
const barMax = computed(() => {
  if (!analytics.value) return 1
  return Math.max(...(analytics.value.tiers || []).map(t => t.sold_count || 0), 1)
})

const fetchAnalytics = async () => {
  loading.value = true
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/tickets/event/${eventId}/analytics`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      analytics.value = await res.json()
    }
  } catch { /* ignore */ } finally {
    loading.value = false
  }
}

onMounted(fetchAnalytics)
</script>

<template>
  <div class="p-4 md:p-6 max-w-screen-lg mx-auto">
    <h1 class="text-xl font-heading font-bold text-text-heading mb-1">Analitik</h1>
    <p class="text-sm text-text-muted mb-6">Ringkasan penjualan dan distribusi tiket untuk acara ini.</p>

    <SkeletonPage v-if="loading" type="list" />

    <template v-else-if="analytics">
      <!-- KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-surface-card rounded-2xl border border-border/50 p-4 text-center">
          <p class="text-2xl font-heading font-bold text-primary">{{ analytics.total_sold }}</p>
          <p class="text-xs text-text-muted mt-1">Tiket Terjual</p>
        </div>
        <div class="bg-surface-card rounded-2xl border border-border/50 p-4 text-center">
          <p class="text-2xl font-heading font-bold text-teal-500">{{ analytics.status_counts.confirmed || 0 }}</p>
          <p class="text-xs text-text-muted mt-1">Dikonfirmasi</p>
        </div>
        <div class="bg-surface-card rounded-2xl border border-border/50 p-4 text-center">
          <p class="text-2xl font-heading font-bold text-amber-500">{{ analytics.status_counts.pending || 0 }}</p>
          <p class="text-xs text-text-muted mt-1">Menunggu</p>
        </div>
        <div class="bg-surface-card rounded-2xl border border-border/50 p-4 text-center">
          <p class="text-lg font-heading font-bold text-text-heading break-words">{{ formatPrice(analytics.total_revenue) }}</p>
          <p class="text-xs text-text-muted mt-1">Total Pendapatan</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <!-- Pie chart: Status Distribution -->
        <div class="bg-surface-card rounded-2xl border border-border/50 p-5">
          <h2 class="text-sm font-semibold text-text-heading mb-4">Distribusi Status Tiket</h2>

          <div v-if="totalAll === 0" class="flex items-center justify-center h-40 text-sm text-text-muted">
            Belum ada data.
          </div>

          <div v-else class="flex items-center gap-6">
            <!-- SVG Pie -->
            <div class="shrink-0">
              <svg width="160" height="160" viewBox="0 0 160 160">
                <g v-if="pieSegments.length > 0">
                  <path
                    v-for="(seg, i) in pieSegments"
                    :key="i"
                    :d="seg.path"
                    :fill="seg.color"
                    class="transition-opacity hover:opacity-80 cursor-default"
                  />
                </g>
                <!-- Center hole -->
                <circle cx="80" cy="80" r="32" fill="var(--color-surface-card, #1e1e2a)" />
                <text x="80" y="76" text-anchor="middle" class="text-xs fill-text-muted" font-size="10" fill="currentColor" opacity="0.6">Total</text>
                <text x="80" y="90" text-anchor="middle" font-size="16" font-weight="700" fill="currentColor">{{ totalAll }}</text>
              </svg>
            </div>

            <!-- Legend -->
            <div class="flex-1 space-y-2">
              <div v-for="seg in pieSegments" :key="seg.label" class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: seg.color }" />
                  <span class="text-xs text-text-muted">{{ seg.label }}</span>
                </div>
                <div class="text-right">
                  <span class="text-xs font-bold text-text-heading">{{ seg.value }}</span>
                  <span class="text-[10px] text-text-muted ml-1">({{ seg.pct }}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Bar Chart: Tier Sales -->
        <div class="bg-surface-card rounded-2xl border border-border/50 p-5">
          <h2 class="text-sm font-semibold text-text-heading mb-4">Penjualan per Tipe Tiket</h2>

          <div v-if="!analytics.tiers || analytics.tiers.length === 0" class="flex items-center justify-center h-40 text-sm text-text-muted">
            Belum ada tipe tiket.
          </div>

          <div v-else class="space-y-4">
            <div v-for="tier in analytics.tiers" :key="tier.name" class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-medium text-text-heading truncate max-w-[140px]">{{ tier.name }}</span>
                <span class="text-text-muted shrink-0 ml-2">{{ tier.sold_count || 0 }} / {{ tier.quota > 0 ? tier.quota : '∞' }}</span>
              </div>
              <div class="h-2 rounded-full bg-surface overflow-hidden">
                <div
                  class="h-full rounded-full bg-primary transition-all duration-700"
                  :style="{ width: barMax > 0 ? `${Math.round(((tier.sold_count || 0) / barMax) * 100)}%` : '0%' }"
                />
              </div>
              <div class="text-[10px] text-text-muted">
                {{ formatPrice(tier.price || 0) }} / tiket
                <span v-if="tier.quota > 0" class="ml-2 opacity-60">
                  · {{ Math.max(0, tier.quota - (tier.sold_count || 0)) }} sisa
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tier Table Summary -->
      <div class="bg-surface-card rounded-2xl border border-border/50 p-5">
        <h2 class="text-sm font-semibold text-text-heading mb-4">Detail Tipe Tiket</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-text-muted border-b border-border/50">
                <th class="pb-3 font-semibold">Tipe Tiket</th>
                <th class="pb-3 font-semibold text-right">Harga</th>
                <th class="pb-3 font-semibold text-right">Kuota</th>
                <th class="pb-3 font-semibold text-right">Terjual</th>
                <th class="pb-3 font-semibold text-right">Sisa</th>
                <th class="pb-3 font-semibold text-right">Pendapatan</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="tier in analytics.tiers"
                :key="tier.name"
                class="border-b border-border/20 last:border-0"
              >
                <td class="py-3 font-medium text-text-heading">{{ tier.name }}</td>
                <td class="py-3 text-right text-text-muted">{{ formatPrice(tier.price || 0) }}</td>
                <td class="py-3 text-right text-text-muted">{{ tier.quota > 0 ? tier.quota : '∞' }}</td>
                <td class="py-3 text-right font-bold text-text-heading">{{ tier.sold_count || 0 }}</td>
                <td class="py-3 text-right text-text-muted">
                  <span v-if="tier.quota > 0">{{ Math.max(0, tier.quota - (tier.sold_count || 0)) }}</span>
                  <span v-else class="text-text-muted">—</span>
                </td>
                <td class="py-3 text-right font-semibold text-teal-500">
                  {{ formatPrice((tier.sold_count || 0) * (tier.price || 0)) }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="border-t border-border/50">
                <td colspan="3" class="pt-3 text-xs font-semibold text-text-muted">Total</td>
                <td class="pt-3 text-right font-bold text-text-heading">{{ analytics.total_sold }}</td>
                <td></td>
                <td class="pt-3 text-right font-bold text-primary">{{ formatPrice(analytics.total_revenue) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </template>

    <div v-else class="text-center py-24 bg-surface-card rounded-2xl border border-border/50">
      <span class="material-symbols-outlined text-5xl text-text-muted block mb-3">bar_chart</span>
      <p class="text-sm text-text-muted">Gagal memuat data analitik. Coba refresh halaman.</p>
    </div>
  </div>
</template>
