<template>
  <section class="px-6 py-16 max-w-6xl mx-auto">
    <div class="space-y-6 text-center mb-12">
      <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Transformasi workflow</p>
      <h2 class="text-3xl md:text-4xl font-heading font-bold text-text-heading">
        Dari chaos ke clarity
      </h2>
    </div>

    <!-- Before vs After Grid -->
    <div class="grid gap-8 md:grid-cols-2">
      <!-- Before -->
      <div class="space-y-4">
        <div class="flex items-center gap-3 mb-6">
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600">
            <span class="text-lg font-bold">×</span>
          </div>
          <h3 class="text-xl font-semibold text-text-heading">Sebelum Creatick</h3>
        </div>

        <!-- Issue cards -->
        <div v-for="issue in beforeIssues" :key="issue.title" class="rounded-3xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-5">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined text-red-600 mt-1">{{ issue.icon }}</span>
            <div>
              <p class="font-semibold text-red-900 dark:text-red-300">{{ issue.title }}</p>
              <p class="text-sm text-red-800 dark:text-red-200 mt-1">{{ issue.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- After -->
      <div class="space-y-4">
        <div class="flex items-center gap-3 mb-6">
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600">
            <span class="text-lg">✓</span>
          </div>
          <h3 class="text-xl font-semibold text-text-heading">Dengan Creatick</h3>
        </div>

        <!-- Solution cards -->
        <div v-for="solution in afterSolutions" :key="solution.title" class="rounded-3xl border border-green-200 bg-green-50 dark:bg-green-900/20 p-5">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined text-green-600 mt-1">{{ solution.icon }}</span>
            <div>
              <p class="font-semibold text-green-900 dark:text-green-300">{{ solution.title }}</p>
              <p class="text-sm text-green-800 dark:text-green-200 mt-1">{{ solution.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Impact metrics -->
    <div class="mt-12 grid gap-4 sm:grid-cols-4">
      <div class="rounded-3xl border border-border bg-surface-card p-6 text-center">
        <p class="text-3xl font-bold text-primary">80%</p>
        <p class="text-sm text-text-muted mt-2">Lebih cepat proses admin</p>
      </div>
      <div class="rounded-3xl border border-border bg-surface-card p-6 text-center">
        <p class="text-3xl font-bold text-primary">0</p>
        <p class="text-sm text-text-muted mt-2">DM spam untuk tiket</p>
      </div>
      <div class="rounded-3xl border border-border bg-surface-card p-6 text-center">
        <p class="text-3xl font-bold text-primary">100%</p>
        <p class="text-sm text-text-muted mt-2">Sinkronisasi data real-time</p>
      </div>
      <div class="rounded-3xl border border-border bg-surface-card p-6 text-center">
        <p class="text-3xl font-bold text-primary">5x</p>
        <p class="text-sm text-text-muted mt-2">Lebih cepat check-in</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const beforeIssues = [
  {
    title: 'WhatsApp chaos',
    description: 'Inbox admin penuh peserta tanya tiket, konfirmasi, dll. Sulit tracking siapa yang sudah bayar.',
    icon: 'sms'
  },
  {
    title: 'Bukti transfer tercecer',
    description: 'Screenshot pembayaran hilang di group chat, data tidak terpusat, admin bingung verifikasi.',
    icon: 'receipt_long'
  },
  {
    title: 'Spreadsheet tidak sinkron',
    description: 'Data peserta di berbagai tempat, kolom hilang, update manual. Rawan error dan double booking.',
    icon: 'grid_on'
  },
  {
    title: 'Check-in manual ribet',
    description: 'Admin buka spreadsheet saat event, cari nama di list, tandai hadir. Antrean panjang, lambat.',
    icon: 'schedule'
  },
  {
    title: 'Admin kesulitan koordinasi',
    description: 'Tim 5 orang, 5 opini. Sulit tahu siapa yang handle apa, tugas tumpang tindih, komunikasi kacau.',
    icon: 'people'
  },
  {
    title: 'Tidak ada analytics',
    description: 'Selesai event, admin gak tahu berapa sebenarnya revenue, attendance rate, atau insight peserta.',
    icon: 'analytics'
  }
]

const afterSolutions = [
  {
    title: 'One dashboard for all',
    description: 'Tiket request, pembayaran, admin, checkout, semua terlihat di satu tempat real-time.',
    icon: 'dashboard'
  },
  {
    title: 'Pembayaran terkelola otomatis',
    description: 'Peserta upload bukti, admin cek dan approve dengan satu klik. Tiket langsung aktif.',
    icon: 'verified'
  },
  {
    title: 'Data terpusat & sinkron',
    description: 'Semua data peserta, tiket, pembayaran di satu tempat. Real-time update, nggak perlu manual.',
    icon: 'cloud_sync'
  },
  {
    title: 'QR check-in super cepat',
    description: 'Scan QR di pintu, data langsung tercatat. 2 menit semua masuk, nggak ada antrean panjang.',
    icon: 'verified_user'
  },
  {
    title: 'Admin collab yang smooth',
    description: 'Assign role, semua bisa lihat real-time, komunikasi jelas. Nggak ada overlap tugas.',
    icon: 'group_work'
  },
  {
    title: 'Analytics & insight event',
    description: 'Selesai event, langsung lihat total revenue, attendance rate, customer insights di dashboard.',
    icon: 'insights'
  }
]
</script>
