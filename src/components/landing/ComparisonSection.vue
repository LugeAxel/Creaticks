<template>
  <section class="px-6 py-16 max-w-6xl mx-auto">
    <div class="space-y-6 text-center mb-12">
      <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Dibanding solusi lain</p>
      <h2 class="text-3xl md:text-4xl font-heading font-bold text-text-heading">
        Kenapa Creatick berbeda
      </h2>
      <p class="mx-auto max-w-2xl text-base text-text-muted leading-relaxed">
        Organizer event komunitas butuh lebih dari cuma form. Butuh workflow yang utuh.
      </p>
    </div>

    <!-- Comparison Table -->
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-border">
            <th class="py-3 md:py-4 px-2 md:px-4 text-left text-xs md:text-sm font-semibold text-text-heading">Fitur</th>
            <th class="py-3 md:py-4 px-2 md:px-4 text-center text-xs md:text-sm font-semibold text-text-heading">WA</th>
            <th class="hidden sm:table-cell py-3 md:py-4 px-2 md:px-4 text-center text-xs md:text-sm font-semibold text-text-heading">Google Forms</th>
            <th class="hidden sm:table-cell py-3 md:py-4 px-2 md:px-4 text-center text-xs md:text-sm font-semibold text-text-heading">Spreadsheet</th>
            <th class="py-3 md:py-4 px-2 md:px-4 text-center text-xs md:text-sm font-semibold text-primary">Creatick</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in comparisonRows" :key="row.feature">
            <tr class="border-b border-border hover:bg-surface-card/50 transition">
              <td class="py-3 md:py-4 px-2 md:px-4 text-xs md:text-sm font-medium text-text-heading">{{ row.feature }}</td>
              <td class="py-3 md:py-4 px-2 md:px-4 text-center">
                <span class="inline-flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-full text-xs md:text-sm" :class="getStatusClass(row.whatsapp)">
                  {{ getStatusIcon(row.whatsapp) }}
                </span>
              </td>
              <td class="hidden sm:table-cell py-3 md:py-4 px-2 md:px-4 text-center">
                <span class="inline-flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-full text-xs md:text-sm" :class="getStatusClass(row.googleForms)">
                  {{ getStatusIcon(row.googleForms) }}
                </span>
              </td>
              <td class="hidden sm:table-cell py-3 md:py-4 px-2 md:px-4 text-center">
                <span class="inline-flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-full text-xs md:text-sm" :class="getStatusClass(row.spreadsheet)">
                  {{ getStatusIcon(row.spreadsheet) }}
                </span>
              </td>
              <td class="py-3 md:py-4 px-2 md:px-4 text-center">
                <span class="inline-flex h-5 w-5 md:h-6 md:w-6 items-center justify-center rounded-full text-xs md:text-sm" :class="getStatusClass(row.creatick)">
                  {{ getStatusIcon(row.creatick) }}
                </span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Legend -->
    <div class="mt-8 flex flex-wrap items-center justify-center gap-6">
      <div class="flex items-center gap-2">
        <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-600">❌</span>
        <p class="text-sm text-text-muted">Tidak support</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-yellow-100 text-yellow-600">⚠️</span>
        <p class="text-sm text-text-muted">Manual / ribet</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-600">✅</span>
        <p class="text-sm text-text-muted">Built-in & otomatis</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const comparisonRows = [
  {
    feature: 'Tiket request',
    whatsapp: 'no',
    googleForms: 'yes',
    spreadsheet: 'no',
    creatick: 'yes'
  },
  {
    feature: 'Tracking pembayaran',
    whatsapp: 'no',
    googleForms: 'no',
    spreadsheet: 'manual',
    creatick: 'yes'
  },
  {
    feature: 'Multi-admin kolaborasi',
    whatsapp: 'manual',
    googleForms: 'no',
    spreadsheet: 'manual',
    creatick: 'yes'
  },
  {
    feature: 'Attendance dashboard',
    whatsapp: 'no',
    googleForms: 'no',
    spreadsheet: 'manual',
    creatick: 'yes'
  },
  {
    feature: 'QR check-in',
    whatsapp: 'no',
    googleForms: 'no',
    spreadsheet: 'no',
    creatick: 'yes'
  },
  {
    feature: 'Seat management',
    whatsapp: 'no',
    googleForms: 'manual',
    spreadsheet: 'manual',
    creatick: 'yes'
  },
  {
    feature: 'Real-time notifikasi',
    whatsapp: 'manual',
    googleForms: 'no',
    spreadsheet: 'no',
    creatick: 'yes'
  },
  {
    feature: 'Analytics event',
    whatsapp: 'no',
    googleForms: 'basic',
    spreadsheet: 'manual',
    creatick: 'yes'
  }
]

const getStatusClass = (status: string) => {
  switch (status) {
    case 'yes':
      return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-300'
    case 'no':
      return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
    case 'manual':
      return 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300'
    case 'basic':
      return 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300'
    default:
      return 'bg-border text-text-muted'
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'yes':
      return '✅'
    case 'no':
      return '❌'
    case 'manual':
      return '⚠️'
    case 'basic':
      return '⚠️'
    default:
      return '—'
  }
}
</script>
