<template>
  <section class="px-6 pb-16 max-w-6xl mx-auto" :class="[initialClass, isVisible ? visibleClass : '', transitionClass]" ref="elementRef">
    <div class="space-y-6 text-center mb-12">
      <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Alur event</p>
      <h2 class="text-3xl md:text-4xl font-heading font-bold text-text-heading">
        Dari permintaan sampai check-in, semua terlihat
      </h2>
      <p class="mx-auto max-w-2xl text-base text-text-muted leading-relaxed">
        Setiap langkah dalam workflow event community dibuat untuk clarity dan efficiency.
      </p>
    </div>

    <!-- Desktop Timeline -->
    <div class="hidden lg:block">
      <div class="grid grid-cols-5 gap-4">
        <template v-for="(step, index) in workflowSteps" :key="step.label">
          <div class="relative">
            <!-- Timeline connector -->
            <div v-if="index < 4" class="absolute top-12 left-[calc(100%+0.5rem)] w-[calc(100%-1rem)] h-1 bg-gradient-to-r from-primary to-border" />

            <!-- Step card -->
            <div
              class="relative rounded-3xl border border-border bg-surface-card p-6 text-center group transition hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10"
            >
              <!-- Step number -->
              <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary text-lg font-bold mb-4">
                {{ index + 1 }}
              </div>

              <!-- Step label -->
              <h3 class="text-lg font-semibold text-text-heading mb-2">{{ step.label }}</h3>

              <!-- Step description -->
              <p class="text-sm text-text-muted leading-relaxed">{{ step.detail }}</p>

              <!-- Icon -->
              <span class="material-symbols-outlined text-3xl text-primary/40 mx-auto block mt-4 group-hover:text-primary transition">
                {{ step.icon }}
              </span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Mobile Timeline (Vertical) -->
    <div class="lg:hidden space-y-6">
      <template v-for="(step, index) in workflowSteps" :key="step.label">
        <div class="relative flex gap-6">
          <!-- Timeline dot and line -->
          <div class="relative flex flex-col items-center">
            <div
              class="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-4 border-surface-card bg-primary text-white text-sm font-semibold"
            >
              {{ index + 1 }}
            </div>
            <div v-if="index < 4" class="absolute top-10 h-12 w-1 bg-gradient-to-b from-primary to-border" />
          </div>

          <!-- Step content -->
          <div class="pb-6 pt-2">
            <h3 class="text-lg font-semibold text-text-heading">{{ step.label }}</h3>
            <p class="text-sm text-text-muted mt-1">{{ step.detail }}</p>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRevealAnimation } from '@/composables/useRevealAnimation'

const { elementRef, isVisible, initialClass, visibleClass, transitionClass } = useRevealAnimation('fade-up')

const workflowSteps = [
  {
    label: 'Request Tiket',
    detail: 'Peserta minta tiket via link, tim dapat notifikasi real-time',
    icon: 'request_page'
  },
  {
    label: 'Upload Pembayaran',
    detail: 'Peserta upload bukti transfer, terlihat di dashboard',
    icon: 'receipt_long'
  },
  {
    label: 'Konfirmasi Admin',
    detail: 'Admin cek bukti dan approve atau reject dengan satu klik',
    icon: 'done_all'
  },
  {
    label: 'QR Ticket Aktif',
    detail: 'Tiket digital langsung aktif dengan QR yang bisa di-scan',
    icon: 'qr_code_2'
  },
  {
    label: 'Check-in Event',
    detail: 'Scan QR di pintu, attendance tercatat otomatis real-time',
    icon: 'how_to_reg'
  }
]
</script>
