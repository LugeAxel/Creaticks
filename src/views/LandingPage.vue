<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWithoutAuth } from '@/lib/api'
import TestimonialMarquee from '@/components/landing/TestimonialMarquee.vue'
import type { Testimonial } from '@/components/landing/TestimonialMarquee.vue'
import EventHeatmap from '@/components/maps/EventHeatmap.vue'
import MapSkeleton from '@/components/landing/MapSkeleton.vue'
import AnimatedStat from '@/components/landing/AnimatedStat.vue'
import BeforeAfterSection from '@/components/landing/BeforeAfterSection.vue'
import FAQSection from '@/components/landing/FAQSection.vue'

const router = useRouter()

const scrolled = ref(false)
const mobileMenuOpen = ref(false)

const starsStyle = ref('')
const starsStyle2 = ref('')
const auroraStyle = ref('')

const generateStars = (count: number, sizeMax: number): string =>
  Array.from({ length: count }, () => {
    const x = Math.random() * 2560
    const y = Math.random() * 1440
    const s = Math.random() * sizeMax + 1
    const a = Math.random() * 0.3 + 0.2
    return `${x}px ${y}px 0 ${s}px rgba(255,255,255,${a.toFixed(2)})`
  }).join(', ')

const auroraColors = [
  { r: 108, g: 99, b: 255 },   // purple
  { r: 67, g: 198, b: 172 },   // teal
  { r: 255, g: 101, b: 132 },  // pink
  { r: 255, g: 178, b: 71 },   // gold
]

const generateAurora = (): string =>
  Array.from({ length: 12 }, (_, i) => {
    const c = auroraColors[i % auroraColors.length]
    const x = Math.random() * 100
    const y = Math.random() * 100
    const rx = Math.random() * 35 + 20
    const ry = Math.random() * 35 + 20
    const a = Math.random() * 0.12 + 0.08
    return `radial-gradient(ellipse ${rx.toFixed(0)}% ${ry.toFixed(0)}% at ${x.toFixed(0)}% ${y.toFixed(0)}%, rgba(${c.r},${c.g},${c.b},${a.toFixed(2)}) 0%, transparent 55%)`
  }).join(',\n    ')

const globalStats = ref<{
  recent_sales_1h: number
  total_sold: number
  checked_in_count: number
  event_count: number
} | null>(null)

const heatmapPoints = ref<Array<{ lat: number; lng: number; intensity: number; label: string; subtitle?: string }>>([])
const hasHeatmapEvents = ref(false)

const features = [
  { icon: 'confirmation_number', title: 'Jual Tiket Online', desc: 'Buat halaman tiket dalam menit, terima pembayaran langsung.' },
  { icon: 'group', title: 'Manajemen Peserta', desc: 'Cek in peserta dengan QR code, ekspor data kapan saja.' },
  { icon: 'bar_chart', title: 'Analitik Real-time', desc: 'Pantau penjualan, konversi, dan demografi peserta.' },
  { icon: 'smartphone', title: 'Akses dari Mana Saja', desc: 'Kelola acaramu dari HP, tablet, atau laptop.' },
  { icon: 'lock', title: 'Pembayaran Aman', desc: 'Transaksi terenkripsi, dana masuk langsung ke akunmu.' },
  { icon: 'bolt', title: 'Setup Kilat', desc: 'Dari daftar ke live dalam 5 menit. Tidak perlu coding.' }
]

const steps = [
  { num: 1, title: 'Daftar Akun', desc: 'Gratis, tanpa kartu kredit. Hanya perlu email dan password.' },
  { num: 2, title: 'Buat Acara', desc: 'Isi detail, upload poster, atur tiket dan harga.' },
  { num: 3, title: 'Sebarkan & Kelola', desc: 'Bagikan link, terima peserta, pantau live dashboard.' }
]

const integrations = [
  { name: 'WhatsApp', color: '#25D366' },
  { name: 'Instagram', color: '#E4405F' },
  { name: 'Google Calendar', color: '#4285F4' },
  { name: 'Google Maps', color: '#34A853' },
  { name: 'Midtrans', color: '#FF7940' },
  { name: 'GoPay', color: '#00AED6' },
  { name: 'OVO', color: '#5B2C8A' },
  { name: 'Dana', color: '#1A73E8' },
]

const testimonials: Testimonial[] = [
  { name: 'Rina Wijaya', handle: '@rinawijaya', initials: 'RW', quote: 'Akhirnya nemu platform ticketing yang cocok buat event komunitas. Peserta gak bingung lagi, admin pun senang. Setup-nya cepet banget.' },
  { name: 'Dimas Prakoso', handle: '@dimasprak', initials: 'DP', quote: 'Dulu pake Google Forms + Spreadsheet, sekarang semua beres di Creatick. QR check-in-nya bikin antrian pintu masuk jauh lebih cepat.' },
  { name: 'Sari Amalia', handle: '@sariamalia', initials: 'SA', quote: 'Pakai Creatick buat workshop bulanan. Peserta tinggal klik link, bayar, dapet tiket. Gak ada lagi chat pribadi nanyain harga.' },
  { name: 'Budi Santoso', handle: '@budisant', initials: 'BS', quote: 'Fitur multi-admin-nya paling berguna. Tim saya bisa bagi tugas tanpa ribet. Dashboard real-time bikin monitoring jadi mudah.' },
  { name: 'Fitri Handayani', handle: '@fitrih', initials: 'FH', quote: 'Awalnya ragu pindah dari platform lain. Tapi gratisan Creatick udah cukup buat event kecil-kecilan. Supportnya ramah banget.' },
  { name: 'Arief Nugroho', handle: '@ariefn', initials: 'AN', quote: 'Konsep "gratis untuk komunitas" beneran. Saya bikin 3 event tanpa bayar sepeser pun. Cocok buat organisasi kampus.' },
  { name: 'Dewi Lestari', handle: '@dewilestari', initials: 'DL', quote: 'Fitur export data-nya lengkap. Sisa tiket, siapa yang hadir, semua rapi. Bikin laporan pertanggungjawaban jadi gampang.' },
  { name: 'Rizky Hidayat', handle: '@rizkyhid', initials: 'RH', quote: 'Penggunaannya intuitif, gak perlu pelatihan. Tim kreator bisa langsung paham dalam 5 menit. Recomended banget!' },
  { name: 'Indah Permata', handle: '@indahp', initials: 'IP', quote: 'Dari pendaftaran sampe check-in, semuanya terintegrasi. Peserta gak perlu download aplikasi tambahan. Ini yang bikin beda.' },
  { name: 'Adi Pratama', handle: '@adipratama', initials: 'AP', quote: 'Creatick bikin acara meetup komunitas jadi profesional. Link tiket bisa dibagi di Instagram, WhatsApp, semua masuk otomatis.' }
]

const handleScroll = () => {
  scrolled.value = window.scrollY > 20
}

const scrollTo = (id: string) => {
  mobileMenuOpen.value = false
  const el = document.getElementById(id)
  el?.scrollIntoView({ behavior: 'smooth' })
}

onMounted(async () => {
  window.addEventListener('scroll', handleScroll)

  starsStyle.value = generateStars(80, 1)
  starsStyle2.value = generateStars(50, 2)
  auroraStyle.value = generateAurora()

  try {
    const res = await fetchWithoutAuth('/api/stats')
    if (res.ok) globalStats.value = await res.json()
  } catch (_e) { /* ignore */ }

  try {
    const res = await fetch('/api/events/published?limit=30')
    if (res.ok) {
      const data = await res.json()
      const points = (data.events || [])
        .filter((e: any) => e.location_lat && e.location_lng)
        .map((e: any) => ({
          lat: Number(e.location_lat),
          lng: Number(e.location_lng),
          intensity: Math.min(5, Math.max(1, (e.ticket_tiers?.reduce((s: number, t: any) => s + (t.sold_count || 0), 0) || 1) / 10)),
          label: e.title,
          subtitle: e.location || 'Lokasi Acara'
        }))
      heatmapPoints.value = points
      hasHeatmapEvents.value = points.length > 0
    }
  } catch (_e) { /* ignore */ }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        observer.unobserve(entry.target)
      }
    })
  }, { threshold: 0.1 })

  setTimeout(() => {
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
  }, 100)
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div class="lp-root min-h-screen bg-surface font-body text-text">
    <div class="stars-layer" :style="{ boxShadow: starsStyle }" />
    <div class="stars-layer twinkle" :style="{ boxShadow: starsStyle2 }" />
    <div class="aurora-mesh" aria-hidden="true" :style="{ background: auroraStyle }" />
    <!-- ===== NAV ===== -->
    <nav
      class="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      :class="scrolled ? 'bg-surface/85 backdrop-blur-xl border-b border-border shadow-xs' : 'bg-transparent'"
    >
      <div class="max-w-6xl mx-auto px-6 h-16 md:h-18 flex items-center justify-between">
        <router-link to="/" class="flex items-center gap-2 shrink-0">
          <img src="/creatick_logo.png" alt="Creaticks" class="h-8 w-auto" />
          <span class="font-heading font-bold text-text-heading text-lg tracking-tight">Creaticks</span>
        </router-link>

        <div class="hidden md:flex items-center gap-8">
          <button @click="scrollTo('features')" class="text-sm font-medium text-text-muted hover:text-text-heading transition cursor-pointer">Fitur</button>
          <button @click="scrollTo('pricing')" class="text-sm font-medium text-text-muted hover:text-text-heading transition cursor-pointer">Harga</button>
          <button @click="scrollTo('faq')" class="text-sm font-medium text-text-muted hover:text-text-heading transition cursor-pointer">FAQ</button>
          <button @click="scrollTo('testimonials')" class="text-sm font-medium text-text-muted hover:text-text-heading transition cursor-pointer">Testimoni</button>
        </div>

        <div class="flex items-center gap-2">
          <router-link
            to="/daftar?role=creator"
            class="hidden md:inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-light transition active:scale-[0.97]"
          >
            Mulai Gratis
          </router-link>
          <button
            @click="mobileMenuOpen = !mobileMenuOpen"
            class="md:hidden flex items-center justify-center w-10 h-10 rounded-full text-text-heading hover:bg-surface-card transition"
            :aria-label="mobileMenuOpen ? 'Tutup menu' : 'Buka menu'"
          >
            <span class="material-symbols-outlined">{{ mobileMenuOpen ? 'close' : 'menu' }}</span>
          </button>
        </div>
      </div>

      <transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div v-if="mobileMenuOpen" class="md:hidden border-t border-border bg-surface px-6 py-5 space-y-3 shadow-lg">
          <button @click="scrollTo('features')" class="block w-full text-left py-2 text-sm font-medium text-text hover:text-text-heading transition cursor-pointer">Fitur</button>
          <button @click="scrollTo('pricing')" class="block w-full text-left py-2 text-sm font-medium text-text hover:text-text-heading transition cursor-pointer">Harga</button>
          <button @click="scrollTo('faq')" class="block w-full text-left py-2 text-sm font-medium text-text hover:text-text-heading transition cursor-pointer">FAQ</button>
          <button @click="scrollTo('testimonials')" class="block w-full text-left py-2 text-sm font-medium text-text hover:text-text-heading transition cursor-pointer">Testimoni</button>
          <router-link
            to="/daftar?role=creator"
            @click="mobileMenuOpen = false"
            class="block text-center rounded-full bg-primary px-5 py-3 text-sm font-semibold text-on-primary mt-4"
          >
            Mulai Gratis
          </router-link>
        </div>
      </transition>
    </nav>

    <!-- ===== HERO ===== -->
    <section class="hero-section relative min-h-screen flex items-center overflow-hidden">
      <div class="hero-noise" aria-hidden="true" />

      <div class="relative z-10 w-full max-w-4xl mx-auto px-6 pt-28 pb-16 md:pt-36 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs md:text-sm font-semibold text-primary mb-6 md:mb-8 reveal">
          Release
        </div>

        <img src="/creatick_logo.png" alt="Creaticks" class="hero-logo h-16 md:h-20 lg:h-24 w-auto mx-auto mb-3 md:mb-5 reveal" />

        <div class="font-righteous creaticks-gradient creaticks-glow text-5xl md:text-7xl lg:text-8xl mb-2 md:mb-4 reveal">
          Creaticks
        </div>

        <h1 class="font-nunito hero-glow text-3xl md:text-5xl lg:text-5xl font-heading font-extrabold text-text-heading leading-[1.1] mb-5 md:mb-6 reveal">
          Kelola Acara.<br/>
          <span class="text-primary">Tanpa Ribet.</span>
        </h1>

        <p class="max-w-2xl mx-auto text-base md:text-lg text-text-muted leading-relaxed mb-8 md:mb-10 reveal">
          Jual tiket, kelola peserta, dan bangun komunitasmu dari satu tempat <br/>mulai dalam hitungan menit.
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 mb-6 md:mb-8 reveal">
          <router-link
            to="/daftar?role=creator"
            class="inline-flex items-center rounded-full bg-primary px-7 md:px-9 py-3.5 text-sm md:text-base font-semibold text-on-primary hover:bg-primary-light transition hover:scale-[1.03] active:scale-[0.97]"
          >
            Buat Acaramu
            <span class="material-symbols-outlined ml-2 text-[1.2em]">arrow_forward</span>
          </router-link>
          <button
            @click="scrollTo('features')"
            class="inline-flex items-center rounded-full border-2 border-border px-7 md:px-9 py-3.5 text-sm md:text-base font-semibold text-text hover:border-primary hover:text-primary transition"
          >
            Lihat Demo
          </button>
        </div>

        <p class="text-xs md:text-sm text-text-muted reveal">
          Dipercaya oleh <span class="font-semibold text-text-heading">2,000+</span> penyelenggara acara komunitas
        </p>
      </div>
    </section>

    <!-- ===== STATS COUNTER ===== -->
    <section v-if="globalStats" class="px-6 py-12 md:py-16 max-w-5xl mx-auto reveal">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <div class="glass-stat-wrap rounded-3xl"><AnimatedStat :value="globalStats.total_sold" label="Tiket Terjual" format="number" /></div>
        <div class="glass-stat-wrap rounded-3xl"><AnimatedStat :value="globalStats.event_count" label="Event Aktif" format="number" /></div>
        <div class="glass-stat-wrap rounded-3xl"><AnimatedStat :value="globalStats.checked_in_count" label="Peserta Hadir" format="number" /></div>
        <div class="glass-stat-wrap rounded-3xl"><AnimatedStat :value="globalStats.recent_sales_1h" label="Terjual 1 Jam" format="number" /></div>
      </div>
    </section>

    <!-- ===== FEATURES ===== -->
    <section id="features" class="px-6 py-16 md:py-24 max-w-6xl mx-auto">
      <div class="mb-10 md:mb-14 reveal">
        <p class="text-primary font-heading font-bold text-sm md:text-base tracking-wide">
          <span class="mr-1.5 inline-block">&#8250;</span> Semua yang Kamu Butuhkan
        </p>
        <h2 class="text-2xl md:text-4xl font-heading font-bold text-text-heading mt-2">
          Fitur Lengkap untuk Acaramu
        </h2>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        <div
          v-for="(f, i) in features"
          :key="f.title"
          class="feature-card rounded-2xl border border-border glass-card p-5 md:p-6 transition duration-200 reveal"
          :style="{ transitionDelay: `${i * 80}ms` }"
        >
          <div class="w-11 h-11 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <span class="material-symbols-outlined text-primary text-xl md:text-2xl" style="font-variation-settings: 'FILL' 1">{{ f.icon }}</span>
          </div>
          <h3 class="text-base md:text-lg font-semibold text-text-heading mb-2">{{ f.title }}</h3>
          <p class="text-sm text-text-muted leading-relaxed">{{ f.desc }}</p>
        </div>
      </div>
    </section>

    <!-- ===== HEATMAP ===== -->
    <section class="px-6 py-16 md:py-24 max-w-6xl mx-auto reveal">
      <div class="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] items-start">
        <div class="space-y-6">
          <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Peta aktivitas</p>
          <h2 class="text-3xl md:text-4xl font-heading font-bold text-text-heading">
            Event lokal bergerak bersama Creatick
          </h2>
          <p class="max-w-xl text-base text-text-muted leading-relaxed">
            Lihat event aktif di Indonesia, tiket yang laku, dan scan QR saat acara berjalan.
          </p>
        </div>

        <div class="rounded-2xl border border-border glass-card shadow-xl shadow-primary/5 overflow-hidden">
          <div class="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <p class="text-sm font-semibold text-text-heading">Live activity</p>
              <p class="text-xs text-text-muted">Peta event komunitas</p>
            </div>
            <span class="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">Real-time</span>
          </div>

          <div class="relative">
            <EventHeatmap v-if="hasHeatmapEvents" :points="heatmapPoints" title="" containerClass="h-[300px] md:h-[420px] min-h-[300px]" />
            <MapSkeleton v-else />
          </div>
        </div>
      </div>
    </section>

    <!-- ===== BEFORE AFTER ===== -->
    <div class="reveal">
      <BeforeAfterSection />
    </div>

    <!-- ===== HOW IT WORKS ===== -->
    <section class="px-6 py-16 md:py-24 max-w-5xl mx-auto">
      <div class="mb-10 md:mb-14 text-center reveal">
        <p class="text-primary font-heading font-bold text-sm md:text-base tracking-wide">
          <span class="mr-1.5 inline-block">&#8250;</span> Mulai dalam 3 Langkah
        </p>
        <h2 class="text-2xl md:text-4xl font-heading font-bold text-text-heading mt-2">
          Dari Nol ke Acara Live dalam Hitungan Menit
        </h2>
      </div>

      <div class="flex flex-col md:flex-row items-start gap-6 md:gap-0 relative">
        <div
          v-for="(step, i) in steps"
          :key="step.num"
          class="flex-1 flex md:flex-col items-start md:items-center gap-4 md:gap-5 md:text-center relative reveal"
          :style="{ transitionDelay: `${i * 120}ms` }"
        >
          <div class="relative flex items-center">
            <div class="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary text-white font-heading font-bold flex items-center justify-center text-base md:text-lg shrink-0 shadow-md shadow-primary/20">
              {{ step.num }}
            </div>
            <div
              v-if="i < steps.length - 1"
              class="hidden md:block absolute top-1/2 left-full w-[calc(100%-3rem)] h-0.5 -translate-y-1/2 bg-border"
              style="margin-left: 1.5rem;"
            />
          </div>
          <div class="md:mt-4">
            <h3 class="text-base md:text-lg font-semibold text-text-heading">{{ step.title }}</h3>
            <p class="text-sm text-text-muted mt-1 leading-relaxed">{{ step.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== TESTIMONIALS ===== -->
    <section id="testimonials" class="py-16 md:py-24 overflow-hidden reveal">
      <div class="px-6 mb-10 md:mb-14 text-center">
        <p class="text-primary font-heading font-bold text-sm md:text-base tracking-wide">
          <span class="mr-1.5 inline-block">&#8250;</span> Kata Mereka
        </p>
        <h2 class="text-2xl md:text-4xl font-heading font-bold text-text-heading mt-2">
          Yang Bilang Creatick Itu Mantap
        </h2>
      </div>

      <div class="space-y-4 md:space-y-6">
        <TestimonialMarquee :quotes="testimonials" :reverse="false" />
        <TestimonialMarquee :quotes="testimonials" :reverse="true" />
      </div>
    </section>

    <!-- ===== INTEGRATIONS ===== -->
    <section class="px-6 py-16 md:py-24 max-w-5xl mx-auto reveal">
      <div class="mb-10 md:mb-14 text-center">
        <p class="text-primary font-heading font-bold text-sm md:text-base tracking-wide">
          <span class="mr-1.5 inline-block">&#8250;</span> Terhubung dengan Tools Favoritmu
        </p>
        <h2 class="text-2xl md:text-4xl font-heading font-bold text-text-heading mt-2">
          Integrasi yang Memudahkan Alur Kerjamu
        </h2>
      </div>

      <div class="flex flex-wrap justify-center gap-3">
        <span
          v-for="item in integrations"
          :key="item.name"
          class="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition hover:scale-105 glass-pill"
          :style="{ color: item.color }"
        >
          {{ item.name }}
        </span>
      </div>
    </section>

    <!-- ===== PRICING ===== -->
    <section id="pricing" class="px-6 py-16 md:py-24 max-w-4xl mx-auto reveal">
      <div class="mb-10 md:mb-14 text-center">
        <p class="text-primary font-heading font-bold text-sm md:text-base tracking-wide">
          <span class="mr-1.5 inline-block">&#8250;</span> Pilihan yang Tepat
        </p>
        <h2 class="text-2xl md:text-4xl font-heading font-bold text-text-heading mt-2">
          Harga yang Adil untuk Komunitas
        </h2>
      </div>

      <div class="max-w-md mx-auto">
        <div class="rounded-2xl border-2 border-border glass-card p-6 md:p-8 transition hover:shadow-lg">
          <h3 class="text-lg font-heading font-bold text-text-heading">Free</h3>
          <p class="text-3xl md:text-4xl font-heading font-bold text-text-heading mt-3 mb-1">Gratis</p>
          <p class="text-sm text-text-muted mb-6">Selamanya untuk event komunitas</p>
          <ul class="space-y-3 mb-8">
            <li class="flex items-start gap-3 text-sm text-text">
              <span class="material-symbols-outlined text-success text-base mt-0.5">check_circle</span>
              Event tak terbatas
            </li>
            <li class="flex items-start gap-3 text-sm text-text">
              <span class="material-symbols-outlined text-success text-base mt-0.5">check_circle</span>
              Multi-admin & kolaborasi tim
            </li>
            <li class="flex items-start gap-3 text-sm text-text">
              <span class="material-symbols-outlined text-success text-base mt-0.5">check_circle</span>
              Analitik lengkap
            </li>
            <li class="flex items-start gap-3 text-sm text-text">
              <span class="material-symbols-outlined text-success text-base mt-0.5">check_circle</span>
              QR check-in
            </li>
            <li class="flex items-start gap-3 text-sm text-text">
              <span class="material-symbols-outlined text-success text-base mt-0.5">check_circle</span>
              Kustomisasi tiket & branding
            </li>
          </ul>
          <router-link
            to="/daftar?role=creator"
            class="block text-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary hover:bg-primary-light transition"
          >
            Mulai Gratis
          </router-link>
        </div>
      </div>
    </section>

    <!-- ===== FAQ ===== -->
    <div class="reveal">
      <FAQSection />
    </div>

    <!-- ===== CTA BANNER ===== -->
    <section class="mx-4 md:mx-6 mb-16 md:mb-24 rounded-2xl md:rounded-3xl bg-gradient-to-br from-[#6C63FF] to-[#7C72F0] overflow-hidden reveal">
      <div class="px-8 md:px-16 py-14 md:py-20 text-center relative">
        <div class="absolute inset-0 cta-noise" aria-hidden="true" />

        <div class="relative z-10">
          <h2 class="text-2xl md:text-4xl font-heading font-bold text-white mb-4 leading-tight">
            Siap Mulai? Bergabung dengan ribuan penyelenggara acara komunitas.
          </h2>
          <p class="text-white/80 text-sm md:text-base mb-8 max-w-xl mx-auto">
            Gratis selamanya untuk event komunitas. Tidak perlu kartu kredit.
          </p>
          <router-link
            to="/daftar?role=creator"
            class="inline-flex items-center rounded-full bg-white px-8 py-3.5 text-sm md:text-base font-semibold text-primary hover:bg-white/90 transition hover:scale-[1.03] active:scale-[0.97]"
          >
            Buat Acara Gratis
            <span class="material-symbols-outlined ml-2 text-[1.2em]">arrow_forward</span>
          </router-link>
        </div>
      </div>
    </section>

    <!-- ===== FOOTER ===== -->
    <footer class="border-t border-border bg-[#1A1D23] px-6 py-12 md:py-16">
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-2 gap-8 md:grid-cols-5 mb-12">
          <div class="col-span-2 md:col-span-2 space-y-3">
            <div class="flex items-center gap-2">
              <img src="/creatick_logo.png" alt="Creaticks" class="h-8 w-auto" />
              <span class="font-heading font-bold text-text-heading text-lg tracking-tight">Creaticks</span>
            </div>
            <p class="text-sm text-text-muted leading-relaxed max-w-xs">
              Platform ticketing untuk event komunitas lokal. Kelola tiket, pembayaran, dan check-in dalam satu dashboard.
            </p>
            <p class="text-xs text-text-muted italic">Dibangun untuk komunitas Indonesia.</p>
          </div>

          <div class="space-y-3">
            <h4 class="text-sm font-semibold text-text-heading">Produk</h4>
            <nav class="space-y-2.5">
              <button @click="scrollTo('features')" class="block text-sm text-text-muted hover:text-primary transition cursor-pointer">Fitur</button>
              <router-link to="/daftar?role=creator" class="block text-sm text-text-muted hover:text-primary transition">Buat Event</router-link>
              <router-link to="/acara" class="block text-sm text-text-muted hover:text-primary transition">Cari Event</router-link>
              <button @click="scrollTo('pricing')" class="block text-sm text-text-muted hover:text-primary transition cursor-pointer">Harga</button>
            </nav>
          </div>

          <div class="space-y-3">
            <h4 class="text-sm font-semibold text-text-heading">Komunitas</h4>
            <nav class="space-y-2.5">
              <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Blog</a>
              <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Discord</a>
              <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Instagram</a>
              <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Tutorial</a>
            </nav>
          </div>

          <div class="space-y-3">
            <h4 class="text-sm font-semibold text-text-heading">Legal</h4>
            <nav class="space-y-2.5">
              <router-link to="/syarat-dan-ketentuan" class="block text-sm text-text-muted hover:text-primary transition">Syarat & Ketentuan</router-link>
              <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Kebijakan Privasi</a>
              <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Cookies</a>
            </nav>
          </div>
        </div>

        <div class="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <p class="text-xs text-text-muted">&copy; 2026 Creatick. Dikembangkan untuk komunitas Indonesia.</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>

.lp-root {
  --color-surface: #111318;
  --color-surface-b: #191B21;
  --color-surface-card: #1A1D23;
  --color-surface-container: #1A1D23;
  --color-surface-container-lowest: #0D0F13;
  --color-surface-variant: #252830;
  --color-surface-dim: #0D0F13;
  --color-border: #2E3138;
  --color-text-heading: #E8E8ED;
  --color-text: #C0C2CD;
  --color-text-muted: #90929E;
  --color-primary: #7C72F0;
  --color-primary-light: #9E96FF;
  --color-primary-dark: #6C63FF;
  --color-on-primary: #111318;
  --color-on-surface: #E8E8ED;
  --color-on-surface-variant: #C0C2CD;
  --color-inverse-surface: #E8E8ED;
  --color-inverse-on-surface: #1A1D23;
  --color-outline: #3A3D45;
  --color-outline-variant: #2E3138;
}

.aurora-mesh {
  position: fixed;
  inset: -100%;
  z-index: 1;
  animation: aurora-drift 30s ease-in-out infinite alternate;
  pointer-events: none;
}

.hero-noise {
  position: absolute;
  inset: 0;
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
  pointer-events: none;
}

@keyframes aurora-drift {
  0% {
    transform: translate(0%, 0%) scale(1) rotate(0deg);
    opacity: 0.6;
  }
  25% {
    transform: translate(5%, 3%) scale(1.05) rotate(1deg);
    opacity: 1;
  }
  50% {
    transform: translate(-3%, 5%) scale(1.1) rotate(-1deg);
    opacity: 0.85;
  }
  75% {
    transform: translate(3%, -2%) scale(1.03) rotate(0.5deg);
    opacity: 0.9;
  }
  100% {
    transform: translate(-5%, 3%) scale(0.95) rotate(-0.5deg);
    opacity: 0.7;
  }
}

.feature-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(108, 99, 255, 0.08);
}

@keyframes text-glow {
  0% { text-shadow: 0 0 20px rgba(108, 99, 255, 0.15), 0 0 40px rgba(108, 99, 255, 0.08); }
  50% { text-shadow: 0 0 30px rgba(108, 99, 255, 0.35), 0 0 60px rgba(108, 99, 255, 0.18), 0 0 100px rgba(108, 99, 255, 0.06); }
  100% { text-shadow: 0 0 20px rgba(108, 99, 255, 0.2), 0 0 40px rgba(108, 99, 255, 0.1); }
}

.hero-glow {
  animation: text-glow 3s ease-in-out infinite alternate;
}

.font-nunito {
  font-family: 'Nunito', sans-serif;
  font-weight: 900;
}

.creaticks-glow {
  animation: creaticks-text-glow 3s ease-in-out infinite alternate;
}

@keyframes creaticks-text-glow {
  0% { filter: drop-shadow(0 0 20px rgba(108, 99, 255, 0.18)) drop-shadow(0 0 40px rgba(108, 99, 255, 0.1)); }
  50% { filter: drop-shadow(0 0 30px rgba(108, 99, 255, 0.4)) drop-shadow(0 0 60px rgba(108, 99, 255, 0.22)) drop-shadow(0 0 100px rgba(108, 99, 255, 0.08)); }
  100% { filter: drop-shadow(0 0 20px rgba(108, 99, 255, 0.22)) drop-shadow(0 0 40px rgba(108, 99, 255, 0.12)); }
}

.font-righteous {
  font-family: 'Righteous', cursive;
  letter-spacing: 0.02em;
}

.creaticks-gradient {
  background: linear-gradient(135deg,
    rgba(108, 99, 255, 1),
    rgba(255, 101, 132, 1),
    rgba(67, 198, 172, 1),
    rgba(255, 178, 71, 1)
  );
  background-size: 300% 300%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: hue-shift 8s ease-in-out infinite alternate;
}

@keyframes hue-shift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.hero-logo {
  animation: float 4s ease-in-out infinite;
  filter: drop-shadow(0 8px 24px rgba(108, 99, 255, 0.35))
          drop-shadow(0 0 60px rgba(108, 99, 255, 0.15));
}

.hero-logo:hover {
  filter: drop-shadow(0 8px 24px rgba(108, 99, 255, 0.5))
          drop-shadow(0 0 80px rgba(108, 99, 255, 0.25));
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.glass-card {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
}

.glass-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.08) 0%,
    transparent 40%,
    rgba(108, 99, 255, 0.04) 70%,
    transparent 100%
  );
  pointer-events: none;
}

.glass-stat-wrap {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
}

.glass-stat-wrap::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.08) 0%,
    transparent 40%,
    rgba(108, 99, 255, 0.04) 70%,
    transparent 100%
  );
  pointer-events: none;
}

.glass-stat-wrap :deep(> div) {
  background: transparent !important;
  border: none !important;
}

.glass-pill {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.cta-noise {
  opacity: 0.04;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
}

.reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.5s ease-out, transform 0.5s ease-out;
}

.reveal.visible {
  opacity: 1;
  transform: translateY(0);
}

.stars-layer {
  position: fixed;
  inset: 0;
  width: 1px;
  height: 1px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}

.twinkle {
  animation: star-twinkle 4s ease-in-out infinite alternate;
}

@keyframes star-twinkle {
  0% { opacity: 0.5; }
  100% { opacity: 0.8; }
}
</style>
