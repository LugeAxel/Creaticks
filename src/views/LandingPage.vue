<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWithoutAuth } from '@/lib/api'
import AppLayout from '@/components/layout/AppLayout.vue'
import EventHeatmap from '@/components/maps/EventHeatmap.vue'
import HeroInteractiveDemo from '@/components/landing/HeroInteractiveDemo.vue'
import AnimatedStat from '@/components/landing/AnimatedStat.vue'
import TestimonialsSection from '@/components/landing/TestimonialsSection.vue'
import BeforeAfterSection from '@/components/landing/BeforeAfterSection.vue'
import WorkflowTimeline from '@/components/landing/WorkflowTimeline.vue'
import ComparisonSection from '@/components/landing/ComparisonSection.vue'
import FAQSection from '@/components/landing/FAQSection.vue'
import PricingSection from '@/components/landing/PricingSection.vue'
import LandingFooter from '@/components/landing/LandingFooter.vue'
import MapSkeleton from '@/components/landing/MapSkeleton.vue'

const router = useRouter()

const globalStats = ref<{
  recent_sales_1h: number
  total_sold: number
  checked_in_count: number
  event_count: number
} | null>(null)

const heatmapPoints = ref<Array<{ lat: number; lng: number; intensity: number; label: string; subtitle?: string }>>([])
const hasHeatmapEvents = computed(() => heatmapPoints.value.length > 0)

const painPoints = [
  {
    title: 'Bukti transfer tercecer',
    description: 'Screenshot berserakan dan bukti bayar hilang di grup chat.',
    icon: 'receipt_long'
  },
  {
    title: 'Peserta spam DM',
    description: 'Inbox penuh tanya tiket, konfirmasi, dan jadwal.',
    icon: 'chat_bubble'
  },
  {
    title: 'Spreadsheet berantakan',
    description: 'Data peserta dan tiket tidak sinkron, bikin panik.',
    icon: 'grid_on'
  },
  {
    title: 'Check-in manual',
    description: 'Antrean panjang dan verifikasi lambat di pintu masuk.',
    icon: 'qr_code_scanner'
  },
  {
    title: 'Admin kesulitan koordinasi',
    description: 'Tugas ganda dan komunikasi tim jadi tidak jelas.',
    icon: 'people'
  }
]

const operationFeatures = [
  {
    title: 'Request queue rapi',
    description: 'Tiket yang masuk langsung terurut, tanpa DM acak.',
    icon: 'inventory_2'
  },
  {
    title: 'Kolaborasi admin',
    description: 'Bagi peran, pantau tugas, dan selesaikan event bersama.',
    icon: 'group_work'
  },
  {
    title: 'Konfirmasi pembayaran',
    description: 'Bukti transfer terkelola, jadi tidak ada yang lewat.',
    icon: 'payments'
  },
  {
    title: 'Dashboard attendance',
    description: 'Lihat hadir, pending, dan kapasitas dalam satu tampilan.',
    icon: 'insights'
  },
  {
    title: 'QR scanner siap pakai',
    description: 'Scan cepat tanpa instalasi tambahan di hari H.',
    icon: 'qr_code'
  }
]

const socialMetrics = [
  { label: 'Event aktif', value: '58' },
  { label: 'Tiket terjual', value: '3.400' },
  { label: 'QR scan terbaru', value: '420' }
]

const loadHeatmap = async () => {
  try {
    const res = await fetch('/api/events/published?limit=30')
    if (!res.ok) return
    const data = await res.json()
    heatmapPoints.value = (data.events || [])
      .filter((event: any) => event.location_lat && event.location_lng)
      .map((event: any) => ({
        lat: Number(event.location_lat),
        lng: Number(event.location_lng),
        intensity: Math.min(5, Math.max(1, (event.ticket_tiers?.reduce((sum: number, tier: any) => sum + (tier.sold_count || 0), 0) || 1) / 10)),
        label: event.title,
        subtitle: event.location || 'Lokasi Acara'
      }))
  } catch (e) {
    console.warn('Failed to load heatmap:', e)
  }
}

onMounted(async () => {
  try {
    const res = await fetchWithoutAuth('/api/stats')
    if (res.ok) globalStats.value = await res.json()
  } catch (e) {
    console.warn('Failed to load global stats:', e)
  }
  await loadHeatmap()
})
</script>

<template>
  <AppLayout>
    <!-- Hero Section with Interactive Demo -->
    <section class="px-6 pt-20 pb-16 max-w-6xl mx-auto">
      <div class="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
        <div class="space-y-6 text-center lg:text-left">
          <span class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            Untuk panitia kampus, komunitas, creator, dan workshop lokal
          </span>
          <h1 class="text-4xl md:text-5xl lg:text-6xl font-heading font-extrabold text-text-heading leading-tight">
            Event penuh.<br/>
            <span class="text-primary">Operasional tetap tenang.</span>
          </h1>
          <p class="max-w-2xl text-lg text-text-muted leading-relaxed">
            Kelola tiket, pembayaran, admin, dan check-in dalam satu dashboard. Creatick membuat event komunitas jadi lebih mudah.
          </p>

          <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
            <button
              class="inline-flex items-center justify-center rounded-2xl bg-primary px-8 py-3.5 text-base font-semibold text-white transition hover:bg-primary-light"
              @click="router.push('/daftar?role=creator')"
            >
              Buat Event Gratis →
            </button>
            <button
              class="inline-flex items-center justify-center rounded-2xl border border-border bg-surface-card px-8 py-3.5 text-base font-semibold text-text hover:border-primary hover:text-primary transition"
              @click="router.push('/acara')"
            >
              Lihat Event Aktif
            </button>
          </div>

          <div class="flex flex-col gap-2 pt-4 text-sm text-text-muted">
            <p>✓ Gratis selamanya untuk event komunitas</p>
            <p>✓ Tidak perlu kartu kredit untuk memulai</p>
          </div>
        </div>

        <!-- Interactive Demo -->
        <div class="relative">
          <HeroInteractiveDemo />
        </div>
      </div>
    </section>

    <!-- Real Statistics Section (PHASE 2) -->
    <section v-if="globalStats" class="px-6 py-16 max-w-6xl mx-auto">
      <h2 class="text-2xl font-heading font-bold text-text-heading text-center mb-10">
        Komunitas lokal sudah percaya Creatick
      </h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
        <AnimatedStat :value="globalStats.total_sold" label="Tiket Terjual" format="number" />
        <AnimatedStat :value="globalStats.event_count" label="Event Aktif" format="number" />
        <AnimatedStat :value="globalStats.checked_in_count" label="Peserta Hadir" format="number" />
        <AnimatedStat :value="globalStats.recent_sales_1h" label="Terjual 1 Jam" format="number" />
      </div>
    </section>

    <!-- Testimonials Section (PHASE 3) -->
    <TestimonialsSection />

    <!-- Before vs After Section (PHASE 4) -->
    <BeforeAfterSection />

    <!-- Workflow Timeline Section (PHASE 5) -->
    <WorkflowTimeline />

    <!-- Social Proof Map Section -->
    <section class="px-6 py-16 max-w-6xl mx-auto">
      <div class="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] items-start">
        <div class="space-y-6">
          <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Peta aktivitas</p>
          <h2 class="text-3xl md:text-4xl font-heading font-bold text-text-heading">
            Event lokal bergerak bersama Creatick
          </h2>
          <p class="max-w-xl text-base text-text-muted leading-relaxed">
            Lihat event aktif di Indonesia, tiket yang laku, dan scan QR saat acara berjalan. Social proof lokal yang membuat platform terasa nyata.
          </p>

          <div class="grid gap-4 sm:grid-cols-3">
            <template v-for="metric in socialMetrics" :key="metric.label">
              <div class="rounded-3xl border border-border bg-surface-card p-4 text-center">
                <p class="text-2xl font-semibold text-text-heading">{{ metric.value }}</p>
                <p class="mt-2 text-sm text-text-muted">{{ metric.label }}</p>
              </div>
            </template>
          </div>
        </div>

        <div class="rounded-4xl border border-border bg-surface-card shadow-xl shadow-primary/5 overflow-hidden">
          <div class="flex items-center justify-between border-b border-border px-6 py-4 bg-white/90 dark:bg-slate-900/50">
            <div>
              <p class="text-sm font-semibold text-text-heading">Live activity</p>
              <p class="text-xs text-text-muted">Peta event komunitas</p>
            </div>
            <span class="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">Real-time</span>
          </div>

          <div class="relative">
            <EventHeatmap v-if="hasHeatmapEvents" :points="heatmapPoints" title="Event aktif di seluruh Indonesia" containerClass="h-[420px] min-h-[300px]" />
            <MapSkeleton v-else />
            <div class="absolute bottom-4 left-4 flex flex-wrap gap-2">
              <span class="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Event lokal</span>
              <span class="rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">QR scan</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Creator Operations Section -->
    <section class="px-6 py-16 max-w-6xl mx-auto">
      <div class="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] items-start">
        <div class="space-y-6">
          <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Operasi creator</p>
          <h2 class="text-3xl md:text-4xl font-heading font-bold text-text-heading">
            Dari 5 admin sampai 500 peserta, semua bisa di-handle
          </h2>
          <p class="max-w-xl text-base text-text-muted leading-relaxed">
            Creatick menyederhanakan operasional event komunitas, agar kamu tetap fokus pada acara, bukan pada rumitnya koordinasi lapangan.
          </p>

          <div class="grid gap-4">
            <template v-for="feature in operationFeatures" :key="feature.title">
              <div class="rounded-3xl border border-border bg-surface-card p-5 transition hover:-translate-y-1">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-primary">{{ feature.icon }}</span>
                  <div>
                    <h3 class="text-lg font-semibold text-text-heading">{{ feature.title }}</h3>
                    <p class="mt-1 text-sm text-text-muted">{{ feature.description }}</p>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="rounded-4xl border border-border bg-surface-card p-8 shadow-xl shadow-primary/5">
          <div class="grid gap-4">
            <div class="rounded-3xl border border-border bg-white/90 dark:bg-slate-900/50 p-6">
              <p class="text-sm uppercase tracking-[0.24em] text-text-muted">Operasional event</p>
              <h3 class="mt-3 text-2xl font-semibold text-slate-950 dark:text-text-heading">Dashboard panitia</h3>
              <p class="mt-2 text-sm text-text-muted">Semua admin dan aktivitas dikumpulkan di tampilan yang mudah di-scan.</p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-3xl bg-primary/5 p-4">
                <p class="text-3xl font-bold text-text-heading">500</p>
                <p class="text-sm text-text-muted">Peserta per event</p>
              </div>
              <div class="rounded-3xl bg-surface-card border border-border p-4">
                <p class="text-3xl font-bold text-text-heading">5</p>
                <p class="text-sm text-text-muted">Admin aktif</p>
              </div>
            </div>
            <div class="rounded-3xl border border-border bg-white/90 dark:bg-slate-900/50 p-4">
              <p class="font-semibold text-slate-950 dark:text-text-heading">Atur role, komentar internal, dan prioritas tugas.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Comparison Section (PHASE 6) -->
    <ComparisonSection />

    <!-- FAQ Section (PHASE 7) -->
    <FAQSection />

    <!-- Pricing Section (PHASE 12) -->
    <PricingSection />

    <!-- Final CTA Section -->
    <section class="px-6 pb-20 max-w-6xl mx-auto">
      <div class="rounded-4xl border border-border bg-surface-card p-10 shadow-xl shadow-primary/5">
        <div class="grid gap-8 lg:grid-cols-2 items-center text-center lg:text-left">
          <div class="space-y-6">
            <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Mulai sekarang</p>
            <h2 class="text-3xl md:text-4xl font-heading font-bold text-text-heading">
              Event komunitas yang rapi dimulai dari sini
            </h2>
            <p class="max-w-xl text-base text-text-muted leading-relaxed">
              Tidak perlu setup rumit. Daftar, buat event, dan mulai terima tiket dalam hitungan menit.
            </p>

            <div class="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <button
                class="inline-flex items-center justify-center rounded-2xl bg-primary px-8 py-4 text-base font-semibold text-white transition hover:bg-primary-light"
                @click="router.push('/daftar?role=creator')"
              >
                Buat Event Sekarang
                <span class="material-symbols-outlined ml-2">arrow_forward</span>
              </button>
              <button
                class="inline-flex items-center justify-center rounded-2xl border border-border bg-surface-card px-8 py-4 text-base font-semibold text-text hover:border-primary hover:text-primary transition"
                @click="router.push('/acara')"
              >
                Jelajahi Event
              </button>
            </div>

            <p class="text-xs text-text-muted">✓ Gratis selamanya · ✓ Tanpa kartu kredit · ✓ Support lokal</p>
          </div>

          <div class="hidden lg:grid grid-cols-2 gap-4">
            <div class="rounded-3xl border border-border bg-white/95 dark:bg-slate-900/50 p-6 text-center">
              <p class="text-3xl font-bold text-text-heading">1.000+</p>
              <p class="text-xs text-text-muted mt-2">Tiket managed</p>
            </div>
            <div class="rounded-3xl border border-border bg-white/95 dark:bg-slate-900/50 p-6 text-center">
              <p class="text-3xl font-bold text-text-heading">20+</p>
              <p class="text-xs text-text-muted mt-2">Event active</p>
            </div>
            <div class="rounded-3xl border border-border bg-white/95 dark:bg-slate-900/50 p-6 text-center">
              <p class="text-3xl font-bold text-text-heading">95%</p>
              <p class="text-xs text-text-muted mt-2">Check-in smooth</p>
            </div>
            <div class="rounded-3xl border border-border bg-white/95 dark:bg-slate-900/50 p-6 text-center">
              <p class="text-3xl font-bold text-text-heading">0 sec</p>
              <p class="text-xs text-text-muted mt-2">Setup time</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </AppLayout>

  <!-- Footer (PHASE 8) -->
  <LandingFooter />
</template>
