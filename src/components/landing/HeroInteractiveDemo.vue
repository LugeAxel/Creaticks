<template>
  <div class="rounded-4xl border border-border bg-surface-card p-6 shadow-xl shadow-primary/5">
    <!-- Step Indicator -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <div v-for="i in 5" :key="i" class="flex items-center gap-2">
          <button
            :class="[
              'relative h-2.5 w-2.5 rounded-full transition duration-300',
              currentStep === i ? 'bg-primary w-6' : 'bg-border cursor-pointer hover:bg-text-muted'
            ]"
            @click="goToStep(i)"
            :aria-label="`Step ${i}`"
          />
          <div v-if="i < 5" :class="['h-px w-3 transition', currentStep >= i + 1 ? 'bg-primary' : 'bg-border']" />
        </div>
      </div>
      <button
        @click="toggleAutoplay"
        class="text-xs font-semibold text-text-muted hover:text-text-heading transition"
      >
        {{ isAutoplayEnabled ? 'Pause' : 'Play' }}
      </button>
    </div>

    <!-- Dashboard Content -->
    <div class="rounded-2xl bg-white/90 p-6 dark:bg-slate-900/50">
      <!-- Step 1: Request Ticket -->
      <div v-show="currentStep === 1" class="space-y-4 min-h-[200px]">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-text-muted">Peserta</p>
            <h3 class="text-lg font-semibold text-slate-950 dark:text-text-heading mt-1">Minta Tiket</h3>
          </div>
          <span class="rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
            Baru
          </span>
        </div>
        <div class="space-y-3">
          <div class="rounded-3xl border border-border bg-slate-50 dark:bg-slate-800 p-4">
            <p class="text-sm font-semibold text-slate-950 dark:text-text-heading">Workshop Kreative | 2 tiket</p>
            <p class="text-xs text-text-muted mt-1">Dari: Ahmad Pratama</p>
          </div>
          <div class="rounded-3xl border border-border bg-slate-50 dark:bg-slate-800 p-4 opacity-60">
            <p class="text-sm font-semibold text-slate-950 dark:text-text-heading">Kopdar Developer | 1 tiket</p>
            <p class="text-xs text-text-muted mt-1">Dari: Siti Nurhaliza</p>
          </div>
        </div>
      </div>

      <!-- Step 2: Upload Payment -->
      <div v-show="currentStep === 2" class="space-y-4 min-h-[200px]">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-text-muted">Peserta</p>
            <h3 class="text-lg font-semibold text-slate-950 dark:text-text-heading mt-1">Upload Bukti Pembayaran</h3>
          </div>
          <span class="rounded-full bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1 text-xs font-semibold text-yellow-700 dark:text-yellow-300">
            Pending
          </span>
        </div>
        <div class="rounded-3xl border border-dashed border-primary bg-primary/5 p-6 text-center">
          <span class="material-symbols-outlined text-4xl text-primary mx-auto block">upload_file</span>
          <p class="text-sm font-semibold text-slate-950 dark:text-text-heading mt-3">Bukti Transfer Terkirim</p>
          <p class="text-xs text-text-muted mt-1">Rp 100.000 → BRI 0234567890</p>
        </div>
      </div>

      <!-- Step 3: Admin Confirms -->
      <div v-show="currentStep === 3" class="space-y-4 min-h-[200px]">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-text-muted">Admin</p>
            <h3 class="text-lg font-semibold text-slate-950 dark:text-text-heading mt-1">Konfirmasi Pembayaran</h3>
          </div>
          <span class="rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
            Review
          </span>
        </div>
        <div class="space-y-3">
          <div class="rounded-3xl border border-border bg-slate-50 dark:bg-slate-800 p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-slate-950 dark:text-text-heading">Ahmad Pratama</p>
                <p class="text-xs text-text-muted mt-1">2 tiket • Rp 200.000</p>
              </div>
              <button class="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success hover:bg-success/20 transition">
                Setujui
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 4: QR Activated -->
      <div v-show="currentStep === 4" class="space-y-4 min-h-[200px]">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-text-muted">Peserta</p>
            <h3 class="text-lg font-semibold text-slate-950 dark:text-text-heading mt-1">QR Tiket Aktif</h3>
          </div>
          <span class="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">Aktif</span>
        </div>
        <div class="rounded-3xl bg-slate-950 p-6 flex items-center justify-center">
          <div class="text-center text-white">
            <span class="material-symbols-outlined text-5xl inline-block mb-3">qr_code_2</span>
            <p class="text-sm font-semibold">Tiket Aktif</p>
            <p class="text-xs text-slate-300 mt-1">WS-2024-001</p>
          </div>
        </div>
      </div>

      <!-- Step 5: Check-in Success -->
      <div v-show="currentStep === 5" class="space-y-4 min-h-[200px]">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-text-muted">Admin</p>
            <h3 class="text-lg font-semibold text-slate-950 dark:text-text-heading mt-1">Hari H - Check-in</h3>
          </div>
          <span class="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">Hadir</span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-3xl border border-success bg-success/10 p-4 text-center">
            <p class="text-3xl font-bold text-text-heading">42</p>
            <p class="text-sm text-text-muted mt-1">Check-in hari ini</p>
          </div>
          <div class="rounded-3xl border border-border bg-slate-50 dark:bg-slate-800 p-4 text-center">
            <p class="text-3xl font-bold text-text-heading">8</p>
            <p class="text-sm text-text-muted mt-1">Pending check-in</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <div class="flex items-center justify-between mt-6">
      <button
        @click="previousStep"
        :disabled="currentStep === 1"
        class="rounded-full border border-border bg-surface-card px-4 py-2 text-sm font-semibold text-text hover:border-primary hover:text-primary transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        ← Sebelumnya
      </button>
      <p class="text-xs text-text-muted">Langkah {{ currentStep }} dari 5</p>
      <button
        @click="nextStep"
        :disabled="currentStep === 5"
        class="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-light transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Selanjutnya →
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const currentStep = ref(1)
const isAutoplayEnabled = ref(true)
let autoplayInterval: NodeJS.Timeout | null = null

const nextStep = () => {
  if (currentStep.value < 5) {
    currentStep.value++
  } else {
    currentStep.value = 1
  }
}

const previousStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

const goToStep = (step: number) => {
  currentStep.value = step
  if (autoplayInterval) {
    clearInterval(autoplayInterval)
    autoplayInterval = null
  }
  isAutoplayEnabled.value = false
}

const toggleAutoplay = () => {
  isAutoplayEnabled.value = !isAutoplayEnabled.value
  if (isAutoplayEnabled.value) {
    startAutoplay()
  } else if (autoplayInterval) {
    clearInterval(autoplayInterval)
    autoplayInterval = null
  }
}

const startAutoplay = () => {
  if (autoplayInterval) {
    clearInterval(autoplayInterval)
  }
  autoplayInterval = setInterval(() => {
    nextStep()
  }, 3500)
}

onMounted(() => {
  if (isAutoplayEnabled.value) {
    startAutoplay()
  }
})

onUnmounted(() => {
  if (autoplayInterval) {
    clearInterval(autoplayInterval)
  }
})
</script>
