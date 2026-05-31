<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useEventContext } from '@/composables/useEventContext'
import { useToast } from '@/composables/useToast'
import BaseButton from '@/components/shared/BaseButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

const { showToast } = useToast()
const { event } = useEventContext()
const router = useRouter()
const eventId = event.id

interface RefundRequest {
  id: string
  ticket_id: string
  buyer_id: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  review_note: string | null
  requested_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  buyer_profile: { name: string; email: string } | null
  ticket_tier: string
  ticket_status: string
  thread_id: string | null
  invoice: {
    total_amount: number
    proof_image_url: string | null
    transfer_reference: string | null
    sender_bank: string | null
  } | null
}

const refunds = ref<RefundRequest[]>([])
const loading = ref(true)
const activeFilter = ref<'all' | 'pending' | 'approved' | 'rejected'>('all')
const selectedRefund = ref<RefundRequest | null>(null)
const actionNote = ref('')
const actionLoading = ref(false)

const filteredRefunds = computed(() => {
  if (activeFilter.value === 'all') return refunds.value
  return refunds.value.filter(r => r.status === activeFilter.value)
})

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; cls: string; icon: string }> = {
    pending:  { label: 'Menunggu',   cls: 'bg-amber-500/10 text-amber-600',  icon: 'hourglass_empty' },
    approved: { label: 'Disetujui',  cls: 'bg-teal-500/10 text-teal-600',    icon: 'check_circle' },
    rejected: { label: 'Ditolak',    cls: 'bg-red-500/10 text-red-600',      icon: 'cancel' }
  }
  return map[status] || { label: status, cls: 'bg-gray-500/10 text-gray-600', icon: 'help' }
}

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })

const formatPrice = (n: number) => 'Rp ' + Number(n).toLocaleString('id-ID')

const fetchRefunds = async () => {
  loading.value = true
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/tickets/event/${eventId}/refunds`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      refunds.value = data.refunds || []
    } else {
      showToast('Gagal memuat antrean refund', 'error')
    }
  } catch {
    showToast('Gagal memuat antrean refund', 'error')
  } finally {
    loading.value = false
  }
}

const openDetail = (refund: RefundRequest) => {
  selectedRefund.value = refund
  actionNote.value = ''
}

const approveRefund = async () => {
  if (!selectedRefund.value) return
  actionLoading.value = true
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/tickets/refunds/${selectedRefund.value.id}/approve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ note: actionNote.value.trim() || undefined })
    })
    if (res.ok) {
      showToast('Refund berhasil disetujui. Inventaris +1 otomatis.', 'success')
      selectedRefund.value = null
      await fetchRefunds()
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error || 'Gagal menyetujui refund', 'error')
    }
  } catch {
    showToast('Gagal menyetujui refund', 'error')
  } finally {
    actionLoading.value = false
  }
}

const rejectRefund = async () => {
  if (!selectedRefund.value) return
  if (!actionNote.value.trim()) {
    showToast('Harap masukkan alasan penolakan', 'error')
    return
  }
  actionLoading.value = true
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/tickets/refunds/${selectedRefund.value.id}/reject`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ note: actionNote.value.trim() })
    })
    if (res.ok) {
      showToast('Refund berhasil ditolak', 'info')
      selectedRefund.value = null
      await fetchRefunds()
    } else {
      const data = await res.json().catch(() => ({}))
      showToast(data.error || 'Gagal menolak refund', 'error')
    }
  } catch {
    showToast('Gagal menolak refund', 'error')
  } finally {
    actionLoading.value = false
  }
}

const openChat = (refund: RefundRequest) => {
  if (refund.thread_id) {
    router.push(`/events/${eventId}/manage/chat?thread=${refund.thread_id}`)
  }
}

const filters = [
  { key: 'all' as const,      label: 'Semua' },
  { key: 'pending' as const,  label: 'Menunggu' },
  { key: 'approved' as const, label: 'Disetujui' },
  { key: 'rejected' as const, label: 'Ditolak' }
]

onMounted(fetchRefunds)
</script>

<template>
  <div class="p-4 md:p-6 max-w-screen-lg mx-auto">
    <h1 class="text-xl font-heading font-bold text-text-heading mb-1">Antrean Refund</h1>
    <p class="text-sm text-text-muted mb-5">
      Kelola permintaan refund dari pembeli. Menyetujui refund akan otomatis menambah inventaris tiket +1.
    </p>

    <!-- Filter tabs -->
    <div class="flex gap-2 mb-5 overflow-x-auto pb-1">
      <button
        v-for="f in filters"
        :key="f.key"
        class="px-4 py-1.5 rounded-full text-sm font-semibold transition-all cursor-pointer shrink-0"
        :class="activeFilter === f.key
          ? 'bg-primary text-white shadow-sm'
          : 'bg-surface-card text-text-muted border border-border/50 hover:bg-surface'"
        @click="activeFilter = f.key"
      >
        {{ f.label }}
        <span class="ml-1 opacity-70">({{ refunds.filter(r => f.key === 'all' ? true : r.status === f.key).length }})</span>
      </button>
    </div>

    <SkeletonPage v-if="loading" type="list" />

    <div v-else-if="filteredRefunds.length === 0" class="text-center py-24 bg-surface-card rounded-2xl border border-border/50">
      <span class="material-symbols-outlined text-5xl text-text-muted block mb-3">currency_exchange</span>
      <h2 class="text-base font-heading font-bold text-text-heading mb-1">Tidak Ada Permintaan Refund</h2>
      <p class="text-sm text-text-muted">Belum ada permintaan refund untuk acara ini.</p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="refund in filteredRefunds"
        :key="refund.id"
        class="bg-surface-card rounded-2xl border border-border/50 p-4 hover:shadow-md transition-shadow cursor-pointer"
        @click="openDetail(refund)"
      >
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-red-500">currency_exchange</span>
            </div>
            <div>
              <p class="font-semibold text-text-heading text-sm leading-tight">
                {{ refund.buyer_profile?.name || 'Pembeli' }}
              </p>
              <p class="text-xs text-text-muted">{{ refund.buyer_profile?.email || '' }}</p>
            </div>
          </div>
          <span
            class="text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1"
            :class="statusBadge(refund.status).cls"
          >
            <span class="material-symbols-outlined text-xs">{{ statusBadge(refund.status).icon }}</span>
            {{ statusBadge(refund.status).label }}
          </span>
        </div>

        <div class="ml-[52px] space-y-1.5">
          <div class="flex items-center gap-3 text-xs text-text-muted">
            <span class="material-symbols-outlined text-base">confirmation_number</span>
            <span class="font-medium text-text-heading">{{ refund.ticket_tier }}</span>
            <span class="opacity-40">·</span>
            <span>{{ formatDate(refund.requested_at) }}</span>
          </div>

          <div v-if="refund.invoice?.total_amount" class="flex items-center gap-2 text-xs">
            <span class="material-symbols-outlined text-base text-text-muted">payments</span>
            <span class="text-text-muted">Nilai refund:</span>
            <span class="font-semibold text-text-heading">{{ formatPrice(refund.invoice.total_amount) }}</span>
          </div>

          <div class="bg-surface rounded-lg px-3 py-2">
            <p class="text-xs text-text-muted line-clamp-2">{{ refund.reason }}</p>
          </div>

          <div v-if="refund.status === 'pending'" class="flex gap-2 pt-1" @click.stop>
            <BaseButton variant="primary" size="sm" @click="openDetail(refund)">
              <span class="material-symbols-outlined text-sm mr-1">open_in_new</span>Proses
            </BaseButton>
            <button
              v-if="refund.thread_id"
              class="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-surface cursor-pointer"
              @click="openChat(refund)"
            >
              <span class="material-symbols-outlined text-base">chat</span>Chat
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail / Action Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="selectedRefund"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          @click="selectedRefund = null"
        >
          <div
            class="bg-surface-card rounded-2xl border border-border/50 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            @click.stop
          >
            <!-- Modal Header -->
            <div class="p-5 border-b border-border/50 flex items-center justify-between">
              <div>
                <h3 class="text-sm font-bold text-text-heading">Detail Permintaan Refund</h3>
                <p class="text-xs text-text-muted mt-0.5">{{ selectedRefund.buyer_profile?.name }}</p>
              </div>
              <button
                class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-variant transition-colors cursor-pointer"
                @click="selectedRefund = null"
              >
                <span class="material-symbols-outlined text-lg text-text-muted">close</span>
              </button>
            </div>

            <div class="p-5 space-y-4">
              <!-- Status badge -->
              <div class="flex items-center justify-between">
                <span class="text-xs text-text-muted">Status</span>
                <span
                  class="text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1"
                  :class="statusBadge(selectedRefund.status).cls"
                >
                  <span class="material-symbols-outlined text-xs">{{ statusBadge(selectedRefund.status).icon }}</span>
                  {{ statusBadge(selectedRefund.status).label }}
                </span>
              </div>

              <!-- Buyer info -->
              <div class="bg-surface rounded-xl p-4 space-y-2 text-sm">
                <h4 class="text-xs font-semibold text-text-heading mb-1">Informasi Pembeli</h4>
                <div class="flex justify-between">
                  <span class="text-xs text-text-muted">Nama</span>
                  <span class="text-xs font-medium text-text-heading">{{ selectedRefund.buyer_profile?.name || '—' }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-xs text-text-muted">Email</span>
                  <span class="text-xs text-text-heading">{{ selectedRefund.buyer_profile?.email || '—' }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-xs text-text-muted">Tipe Tiket</span>
                  <span class="text-xs text-text-heading">{{ selectedRefund.ticket_tier }}</span>
                </div>
                <div v-if="selectedRefund.invoice?.total_amount" class="flex justify-between pt-1 border-t border-border/30">
                  <span class="text-xs font-semibold text-text-heading">Nilai Refund</span>
                  <span class="text-sm font-bold text-text-heading">{{ formatPrice(selectedRefund.invoice.total_amount) }}</span>
                </div>
              </div>

              <!-- Payment proof -->
              <div v-if="selectedRefund.invoice?.proof_image_url" class="bg-surface rounded-xl p-4">
                <h4 class="text-xs font-semibold text-text-heading mb-2">Bukti Pembayaran</h4>
                <a
                  :href="selectedRefund.invoice.proof_image_url"
                  target="_blank"
                  class="block rounded-lg overflow-hidden border border-border/50 hover:opacity-90 transition-opacity"
                >
                  <img
                    :src="selectedRefund.invoice.proof_image_url"
                    alt="Bukti Pembayaran"
                    class="w-full h-auto max-h-[200px] object-contain bg-white"
                  />
                </a>
                <div class="flex gap-3 mt-2 text-xs text-text-muted">
                  <span v-if="selectedRefund.invoice.sender_bank">Bank: {{ selectedRefund.invoice.sender_bank }}</span>
                  <span v-if="selectedRefund.invoice.transfer_reference">Ref: {{ selectedRefund.invoice.transfer_reference }}</span>
                </div>
              </div>

              <!-- Reason -->
              <div class="bg-surface rounded-xl p-4">
                <h4 class="text-xs font-semibold text-text-heading mb-2">Alasan Refund</h4>
                <p class="text-xs text-text-muted leading-relaxed">{{ selectedRefund.reason }}</p>
              </div>

              <!-- Chat link -->
              <button
                v-if="selectedRefund.thread_id"
                class="w-full flex items-center justify-center gap-2 text-sm text-primary border border-primary/30 hover:bg-primary/5 py-2.5 rounded-xl transition-colors cursor-pointer"
                @click="openChat(selectedRefund)"
              >
                <span class="material-symbols-outlined">chat</span>
                Buka Chat dengan Pembeli
              </button>

              <!-- Review note (for already reviewed) -->
              <div v-if="selectedRefund.status !== 'pending' && selectedRefund.review_note" class="bg-surface rounded-xl p-4">
                <h4 class="text-xs font-semibold text-text-heading mb-1">Catatan Review</h4>
                <p class="text-xs text-text-muted">{{ selectedRefund.review_note }}</p>
                <p class="text-[11px] text-text-muted mt-1">{{ selectedRefund.reviewed_at ? formatDate(selectedRefund.reviewed_at) : '' }}</p>
              </div>

              <!-- Action area for pending -->
              <div v-if="selectedRefund.status === 'pending'" class="space-y-3 pt-2 border-t border-border/30">
                <div>
                  <label class="text-xs font-medium text-text-muted block mb-1.5">
                    Catatan (wajib saat menolak)
                  </label>
                  <textarea
                    v-model="actionNote"
                    rows="3"
                    class="w-full px-3 py-2 rounded-xl border border-border/50 bg-surface text-sm text-text-heading resize-none outline-none focus:border-primary transition-colors"
                    placeholder="Tambahkan catatan untuk pembeli..."
                  />
                </div>

                <!-- Approve warning -->
                <div class="bg-teal-500/8 border border-teal-500/20 rounded-xl p-3">
                  <p class="text-xs text-teal-700 dark:text-teal-400">
                    <span class="material-symbols-outlined text-sm align-middle mr-1">info</span>
                    Menyetujui refund akan otomatis menambah inventaris tiket <strong>+1</strong> dan menutup thread chat.
                  </p>
                </div>

                <div class="flex gap-3">
                  <BaseButton
                    variant="danger"
                    class="flex-1"
                    :disabled="actionLoading"
                    @click="rejectRefund"
                  >
                    <span class="material-symbols-outlined text-sm mr-1">cancel</span>
                    Tolak Refund
                  </BaseButton>
                  <BaseButton
                    variant="primary"
                    class="flex-1"
                    :disabled="actionLoading"
                    @click="approveRefund"
                  >
                    <span v-if="actionLoading" class="material-symbols-outlined text-sm mr-1 animate-spin">progress_activity</span>
                    <span v-else class="material-symbols-outlined text-sm mr-1">check_circle</span>
                    Setujui Refund
                  </BaseButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
