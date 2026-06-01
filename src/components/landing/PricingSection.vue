<template>
  <section class="px-6 py-16 max-w-4xl mx-auto">
    <div class="space-y-6 text-center mb-12">
      <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Transparan & terjangkau</p>
      <h2 class="text-3xl md:text-4xl font-heading font-bold text-text-heading">
        Harga yang adil untuk komunitas
      </h2>
    </div>

    <!-- Pricing Card -->
    <div class="rounded-4xl border border-border bg-surface-card p-10 shadow-xl shadow-primary/5">
      <div class="grid gap-8 md:grid-cols-2 items-center">
        <!-- Left: Features -->
        <div class="space-y-5">
          <div class="space-y-2">
            <h3 class="text-2xl font-semibold text-text-heading">Creatick</h3>
            <p class="text-4xl font-bold text-primary">Gratis</p>
            <p class="text-sm text-text-muted">Untuk event komunitas lokal</p>
          </div>

          <div class="space-y-4 border-t border-border pt-6">
            <div v-for="feature in features" :key="feature" class="flex items-start gap-3">
              <span class="material-symbols-outlined text-lg text-success mt-0.5">check_circle</span>
              <p class="text-sm text-text-heading">{{ feature }}</p>
            </div>
          </div>
        </div>

        <!-- Right: Notes -->
        <div class="rounded-3xl bg-white/90 dark:bg-slate-900/50 p-6 space-y-4">
          <div class="space-y-2">
            <p class="text-sm font-semibold text-slate-950 dark:text-text-heading">Tidak ada biaya tersembunyi</p>
            <p class="text-xs text-text-muted">Setup gratis, transaksi gratis, support gratis.</p>
          </div>
          <div class="space-y-2 border-t border-border pt-4">
            <p class="text-sm font-semibold text-slate-950 dark:text-text-heading">Tidak perlu kartu kredit</p>
            <p class="text-xs text-text-muted">Langsung bisa pakai setelah daftar akun.</p>
          </div>
          <div class="space-y-2 border-t border-border pt-4">
            <p class="text-sm font-semibold text-slate-950 dark:text-text-heading">Transparan tentang masa depan</p>
            <p class="text-xs text-text-muted">
              Jika ada perubahan harga, kami akan announce dulu dengan waktu transisi yang cukup.
              Existing organizer akan dapat benefit awal.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom CTA -->
    <div class="mt-12 text-center">
      <button
        @click="$router.push('/daftar?role=creator')"
        class="inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 text-base font-semibold text-white hover:bg-primary-light transition"
      >
        Mulai Event Gratis
        <span class="material-symbols-outlined">arrow_forward</span>
      </button>
      <p class="text-xs text-text-muted mt-4">Tidak perlu kartu kredit untuk memulai</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const features = [
  'Unlimited event',
  'Unlimited peserta',
  'Tiket request management',
  'QR code tickets',
  'Attendance scanning',
  'Multi-admin collaboration',
  'Payment tracking',
  'Seat management',
  'Event dashboard',
  'Real-time analytics'
]
</script>
