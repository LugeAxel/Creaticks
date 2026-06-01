<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useEventContext } from '@/composables/useEventContext'
import { useToast } from '@/composables/useToast'
import BaseButton from '@/components/shared/BaseButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

const { showToast } = useToast()
const { event } = useEventContext()
const eventId = event.id

const loading = ref(true)
const saving = ref(false)

// Settings state
const claimMsgEnabled = ref(false)
const claimMsgTemplate = ref('Halo! Saya akan membantu proses tiket Anda. Silakan kirimkan bukti pembayaran di sini.')
const autoReleaseEnabled = ref(false)
const autoReleaseTimeout = ref(15)
const autoCloseEnabled = ref(false)
const autoCloseTimeout = ref(1440)
const paymentDeadlineMinutes = ref(30)

const fetchSettings = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('events')
      .select('claim_message_template_enabled, claim_message_template, auto_release_claims_enabled, auto_release_claims_timeout, auto_close_ticket_enabled, auto_close_ticket_timeout, payment_deadline_minutes')
      .eq('id', eventId)
      .single()

    if (!error && data) {
      claimMsgEnabled.value = !!data.claim_message_template_enabled
      claimMsgTemplate.value = data.claim_message_template || claimMsgTemplate.value
      autoReleaseEnabled.value = !!data.auto_release_claims_enabled
      autoReleaseTimeout.value = data.auto_release_claims_timeout ?? 15
      autoCloseEnabled.value = !!data.auto_close_ticket_enabled
      autoCloseTimeout.value = data.auto_close_ticket_timeout ?? 1440
      paymentDeadlineMinutes.value = data.payment_deadline_minutes ?? 30
    }
  } catch { /* ignore */ } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  saving.value = true

  // Snapshot current state for rollback
  const prev = {
    claimMsgEnabled: claimMsgEnabled.value,
    claimMsgTemplate: claimMsgTemplate.value,
    autoReleaseEnabled: autoReleaseEnabled.value,
    autoReleaseTimeout: autoReleaseTimeout.value,
    autoCloseEnabled: autoCloseEnabled.value,
    autoCloseTimeout: autoCloseTimeout.value,
    paymentDeadlineMinutes: paymentDeadlineMinutes.value
  }

  // Optimistic: show success immediately
  showToast('Pengaturan berhasil disimpan', 'success')

  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/events/${eventId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        claim_message_template_enabled: claimMsgEnabled.value,
        claim_message_template: claimMsgTemplate.value.trim(),
        auto_release_claims_enabled: autoReleaseEnabled.value,
        auto_release_claims_timeout: autoReleaseTimeout.value,
        auto_close_ticket_enabled: autoCloseEnabled.value,
        auto_close_ticket_timeout: autoCloseTimeout.value,
        payment_deadline_minutes: paymentDeadlineMinutes.value
      })
    })
    if (!res.ok) {
      // Revert on error
      claimMsgEnabled.value = prev.claimMsgEnabled
      claimMsgTemplate.value = prev.claimMsgTemplate
      autoReleaseEnabled.value = prev.autoReleaseEnabled
      autoReleaseTimeout.value = prev.autoReleaseTimeout
      autoCloseEnabled.value = prev.autoCloseEnabled
      autoCloseTimeout.value = prev.autoCloseTimeout
      paymentDeadlineMinutes.value = prev.paymentDeadlineMinutes
      const data = await res.json().catch(() => ({}))
      showToast(data.error || 'Gagal menyimpan pengaturan', 'error')
    }
  } catch {
    // Revert on error
    claimMsgEnabled.value = prev.claimMsgEnabled
    claimMsgTemplate.value = prev.claimMsgTemplate
    autoReleaseEnabled.value = prev.autoReleaseEnabled
    autoReleaseTimeout.value = prev.autoReleaseTimeout
    autoCloseEnabled.value = prev.autoCloseEnabled
    autoCloseTimeout.value = prev.autoCloseTimeout
    paymentDeadlineMinutes.value = prev.paymentDeadlineMinutes
    showToast('Gagal menyimpan pengaturan', 'error')
  } finally {
    saving.value = false
  }
}

onMounted(fetchSettings)
</script>

<template>
  <div class="p-4 md:p-6 max-w-2xl mx-auto">
    <h1 class="text-xl font-heading font-bold text-text-heading mb-1">Pengaturan Acara</h1>
    <p class="text-sm text-text-muted mb-6">Konfigurasi otomasi antrian dan pengaturan admin acara.</p>

    <SkeletonPage v-if="loading" type="list" />

    <template v-else>
      <!-- Claim Message Template -->
      <div class="bg-surface-card rounded-2xl border border-border/50 p-5 mb-4">
        <div class="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 class="text-sm font-semibold text-text-heading mb-0.5">Template Pesan Otomatis</h2>
            <p class="text-xs text-text-muted leading-relaxed">
              Saat admin mengambil (claim) antrian tiket, pesan ini akan dikirim otomatis ke buyer.
            </p>
          </div>
          <!-- Toggle -->
          <button
            class="relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer focus:outline-none"
            :class="claimMsgEnabled ? 'bg-primary' : 'bg-border'"
            @click="claimMsgEnabled = !claimMsgEnabled"
          >
            <span
              class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
              :class="claimMsgEnabled ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>

        <Transition name="slide-fade">
          <div v-if="claimMsgEnabled" class="space-y-2">
            <label class="text-xs font-medium text-text-muted">Isi Pesan Template</label>
            <textarea
              v-model="claimMsgTemplate"
              rows="4"
              class="w-full px-3 py-2.5 rounded-xl border border-border/50 bg-surface text-sm text-text-heading resize-none outline-none focus:border-primary transition-colors"
              placeholder="Tuliskan pesan yang akan dikirim otomatis..."
            />
            <p class="text-[11px] text-text-muted">
              Pesan ini dikirim sebagai pesan teks biasa dari akun admin yang mengambil antrian.
            </p>
            <div class="p-3 rounded-xl bg-surface border border-border/30">
              <p class="text-xs font-medium text-text-heading mb-1.5">Panduan placeholder:</p>
              <div class="flex items-center gap-2">
                <code class="text-xs font-mono text-primary bg-primary/5 px-1.5 py-0.5 rounded">{admin}</code>
                <span class="text-xs text-text-muted">Diganti dengan username admin yang mengambil antrian</span>
              </div>
            </div>
          </div>
        </Transition>

        <div v-if="!claimMsgEnabled" class="mt-2 p-3 rounded-xl bg-surface border border-border/30">
          <p class="text-xs text-text-muted italic">
            Template dinonaktifkan. Pesan sistem default akan digunakan saat admin mengambil antrian.
          </p>
        </div>
      </div>

      <!-- Auto-Release Claims -->
      <div class="bg-surface-card rounded-2xl border border-border/50 p-5 mb-6">
        <div class="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 class="text-sm font-semibold text-text-heading mb-0.5">Auto-Release Klaim Antrian</h2>
            <p class="text-xs text-text-muted leading-relaxed">
              Jika diaktifkan, admin yang sudah mengambil antrian akan dilepas otomatis setelah waktu tidak aktif tertentu.
            </p>
          </div>
          <button
            class="relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer focus:outline-none"
            :class="autoReleaseEnabled ? 'bg-primary' : 'bg-border'"
            @click="autoReleaseEnabled = !autoReleaseEnabled"
          >
            <span
              class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
              :class="autoReleaseEnabled ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>

        <Transition name="slide-fade">
          <div v-if="autoReleaseEnabled" class="space-y-3">
            <label class="text-xs font-medium text-text-muted">Waktu Tidak Aktif (menit)</label>
            <div class="flex items-center gap-3">
              <input
                v-model.number="autoReleaseTimeout"
                type="range"
                min="5"
                max="60"
                step="5"
                class="flex-1 accent-primary"
              />
              <span class="text-sm font-bold text-text-heading w-16 text-right">{{ autoReleaseTimeout }} menit</span>
            </div>
            <div class="flex justify-between text-[10px] text-text-muted">
              <span>5 menit</span>
              <span>30 menit</span>
              <span>60 menit</span>
            </div>
            <div class="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <p class="text-xs text-amber-700 dark:text-amber-400">
                <span class="material-symbols-outlined text-sm align-middle mr-1">info</span>
                Klaim akan dilepas otomatis setiap {{ autoReleaseTimeout }} menit jika tidak ada aktivitas konfirmasi.
              </p>
            </div>
          </div>
        </Transition>

        <div v-if="!autoReleaseEnabled" class="mt-2 p-3 rounded-xl bg-surface border border-border/30">
          <p class="text-xs text-text-muted italic">
            Auto-release dinonaktifkan. Admin harus melepaskan klaim secara manual.
          </p>
        </div>
      </div>

      <!-- Batas Waktu Pembayaran -->
      <div class="bg-surface-card rounded-2xl border border-border/50 p-5 mb-6">
        <div class="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 class="text-sm font-semibold text-text-heading mb-0.5">Batas Waktu Pembayaran</h2>
            <p class="text-xs text-text-muted leading-relaxed">
              Waktu yang diberikan kepada pembeli untuk melakukan pembayaran setelah memesan tiket.
            </p>
          </div>
        </div>

        <div class="space-y-3">
          <label class="text-xs font-medium text-text-muted">Durasi (menit)</label>
          <div class="flex items-center gap-3">
            <input
              v-model.number="paymentDeadlineMinutes"
              type="range"
              min="10"
              max="180"
              step="5"
              class="flex-1 accent-primary"
            />
            <span class="text-sm font-bold text-text-heading w-16 text-right">{{ paymentDeadlineMinutes }} menit</span>
          </div>
          <div class="flex justify-between text-[10px] text-text-muted">
            <span>10 menit</span>
            <span>60 menit</span>
            <span>180 menit</span>
          </div>
          <div class="p-3 rounded-xl bg-blue-500/8 border border-blue-500/20">
            <p class="text-xs text-blue-700 dark:text-blue-400">
              <span class="material-symbols-outlined text-sm align-middle mr-1">info</span>
              Tiket yang tidak dibayar akan otomatis dibatalkan setelah {{ paymentDeadlineMinutes }} menit.
            </p>
          </div>
        </div>
      </div>

      <!-- Auto-Close Tickets -->
      <div class="bg-surface-card rounded-2xl border border-border/50 p-5 mb-6">
        <div class="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 class="text-sm font-semibold text-text-heading mb-0.5">Auto-Tutup Tiket</h2>
            <p class="text-xs text-text-muted leading-relaxed">
              Jika diaktifkan, tiket yang sudah dikonfirmasi akan ditutup otomatis (status completed) setelah batas waktu tertentu.
            </p>
          </div>
          <button
            class="relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer focus:outline-none"
            :class="autoCloseEnabled ? 'bg-primary' : 'bg-border'"
            @click="autoCloseEnabled = !autoCloseEnabled"
          >
            <span
              class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
              :class="autoCloseEnabled ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>

        <Transition name="slide-fade">
          <div v-if="autoCloseEnabled" class="space-y-3">
            <label class="text-xs font-medium text-text-muted">Batas Waktu Setelah Konfirmasi (menit)</label>
            <div class="flex items-center gap-3">
              <input
                v-model.number="autoCloseTimeout"
                type="range"
                min="30"
                max="4320"
                step="30"
                class="flex-1 accent-primary"
              />
              <span class="text-sm font-bold text-text-heading w-20 text-right">{{ autoCloseTimeout }} menit</span>
            </div>
            <div class="flex justify-between text-[10px] text-text-muted">
              <span>30 menit</span>
              <span>1 hari</span>
              <span>3 hari</span>
            </div>
            <div class="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <p class="text-xs text-amber-700 dark:text-amber-400">
                <span class="material-symbols-outlined text-sm align-middle mr-1">info</span>
                Tiket akan ditutup otomatis {{ autoCloseTimeout }} menit ({{ Math.round(autoCloseTimeout / 60) }} jam) setelah dikonfirmasi. Chat thread juga akan ditutup.
              </p>
            </div>
          </div>
        </Transition>

        <div v-if="!autoCloseEnabled" class="mt-2 p-3 rounded-xl bg-surface border border-border/30">
          <p class="text-xs text-text-muted italic">
            Auto-tutup dinonaktifkan. Tiket harus ditutup secara manual.
          </p>
        </div>
      </div>

      <!-- Save Button -->
      <div class="flex justify-end">
        <BaseButton variant="primary" :disabled="saving" @click="saveSettings">
          <span v-if="saving" class="material-symbols-outlined text-sm mr-1 animate-spin">progress_activity</span>
          <span v-else class="material-symbols-outlined text-sm mr-1">save</span>
          {{ saving ? 'Menyimpan...' : 'Simpan Pengaturan' }}
        </BaseButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.25s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
