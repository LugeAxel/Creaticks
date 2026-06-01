<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useEventContext } from '@/composables/useEventContext'
import { fetchWithRetry } from '@/lib/api'
import BaseButton from '@/components/shared/BaseButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

interface Invoice {
  id: string
  ticket_request_id: string
  invoice_number: string
  event_id: string
  buyer_name: string
  ticket_type: string
  quantity: number
  unit_price: number
  total_amount: number
  payment_date: string | null
  payment_method: string
  status: 'paid' | 'refunded' | 'cancelled'
  created_at: string
  transfer_reference: string
  sender_bank: string
  transfer_amount: number
  proof_image_url: string
}

const { event } = useEventContext()
const eventId = event.id

const invoices = ref<Invoice[]>([])
const loading = ref(true)
const searchQuery = ref('')
const dateFilter = ref<'all' | '7d' | '30d'>('all')
const selectedInvoice = ref<Invoice | null>(null)
const invoiceChannel = ref<any>(null)

const filteredInvoices = computed(() => {
  let result = invoices.value

  const q = searchQuery.value.toLowerCase().trim()
  if (q) {
    result = result.filter(inv => {
      const paymentDateStr = inv.payment_date
        ? new Date(inv.payment_date).toLocaleDateString('id-ID')
        : ''
      const createdDateStr = new Date(inv.created_at).toLocaleDateString('id-ID')
      return (
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.buyer_name.toLowerCase().includes(q) ||
        inv.ticket_type.toLowerCase().includes(q) ||
        (inv.transfer_reference || '').toLowerCase().includes(q) ||
        (inv.sender_bank || '').toLowerCase().includes(q) ||
        paymentDateStr.includes(q) ||
        createdDateStr.includes(q)
      )
    })
  }

  if (dateFilter.value !== 'all') {
    const now = Date.now()
    const cutoff = dateFilter.value === '7d' ? now - 7 * 86400000 : now - 30 * 86400000
    result = result.filter(inv => {
      if (!inv.payment_date) return true
      return new Date(inv.payment_date).getTime() >= cutoff
    })
  }

  return result
})

const stats = computed(() => {
  const total = invoices.value.length
  const paid = invoices.value.filter(inv => inv.status === 'paid').length
  const revenue = invoices.value
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + Number(inv.total_amount), 0)
  const returned = invoices.value.filter(inv => inv.status === 'refunded' || inv.status === 'cancelled').length
  return { total, paid, revenue, returned }
})

const formatPrice = (amount: number) => {
  return 'Rp ' + Number(amount).toLocaleString('id-ID')
}

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  })
}

const formatDateFull = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    paid: 'Lunas',
    refunded: 'Dikembalikan',
    cancelled: 'Dibatalkan'
  }
  return map[status] || status
}

const statusClass = (status: string) => {
  const map: Record<string, string> = {
    paid: 'bg-teal-500/10 text-teal-600',
    refunded: 'bg-amber-500/10 text-amber-600',
    cancelled: 'bg-red-500/10 text-red-600'
  }
  return map[status] || 'bg-orange-500/10 text-orange-600'
}

const exportCSV = async () => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const res = await fetchWithRetry(`/api/tickets/event/${eventId}/export/invoices?format=csv`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) return
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `invoices-${eventId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const fetchInvoices = async () => {
  try {
    const res = await fetchWithRetry(`/api/tickets/event/${eventId}/invoices`)
    if (res.ok) {
      const data = await res.json()
      invoices.value = data.invoices || []
    }
  } catch (e) {
    console.warn('Failed to fetch invoices:', e)
  } finally {
    loading.value = false
  }
}

const subscribeToRealtime = () => {
  invoiceChannel.value = supabase
    .channel(`invoices_${eventId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'invoices',
        filter: `event_id=eq.${eventId}`
      },
      async (payload: any) => {
        const updated = payload.new as Invoice
        const idx = invoices.value.findIndex(inv => inv.id === updated.id)
        if (payload.eventType === 'INSERT') {
          if (updated.status === 'paid') {
            invoices.value.unshift(updated)
          }
        } else if (payload.eventType === 'UPDATE') {
          if (idx !== -1) {
            invoices.value[idx] = { ...invoices.value[idx], ...updated }
          }
        } else if (payload.eventType === 'DELETE') {
          if (idx !== -1) {
            invoices.value.splice(idx, 1)
          }
        }
      }
    )
    .subscribe()
}

onMounted(() => {
  fetchInvoices()
  subscribeToRealtime()
})

onUnmounted(() => {
  if (invoiceChannel.value) {
    supabase.removeChannel(invoiceChannel.value as any)
  }
})
</script>

<template>
  <div class="p-4 md:p-6 max-w-screen-lg mx-auto">
    <h1 class="text-xl font-heading font-bold text-text-heading mb-6">Invoice</h1>

    <SkeletonPage v-if="loading" type="list" />

    <template v-else>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="bg-surface-card rounded-xl border border-border/50 p-4 text-center">
          <p class="text-2xl font-heading font-bold text-text-heading">{{ stats.total }}</p>
          <p class="text-xs text-text-muted">Total Invoice</p>
        </div>
        <div class="bg-surface-card rounded-xl border border-border/50 p-4 text-center">
          <p class="text-2xl font-heading font-bold text-teal-500">{{ stats.paid }}</p>
          <p class="text-xs text-text-muted">Lunas</p>
        </div>
        <div class="bg-surface-card rounded-xl border border-border/50 p-4 text-center">
          <p class="text-2xl font-heading font-bold text-primary">{{ formatPrice(stats.revenue) }}</p>
          <p class="text-xs text-text-muted">Total Pendapatan</p>
        </div>
        <div class="bg-surface-card rounded-xl border border-border/50 p-4 text-center">
          <p class="text-2xl font-heading font-bold text-amber-500">{{ stats.returned }}</p>
          <p class="text-xs text-text-muted">Dikembalikan</p>
        </div>
      </div>

      <div class="bg-surface-card rounded-xl border border-border/50 p-4">
        <div class="flex items-center gap-3 mb-4">
          <div class="flex-1 relative">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-lg">search</span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Cari invoice..."
              class="w-full pl-10 pr-4 py-2 rounded-xl border border-border/50 bg-surface text-sm outline-none focus:border-teal-500 transition-colors"
            />
          </div>
          <div class="hidden md:flex items-center gap-1 bg-surface rounded-xl border border-border/50 p-0.5">
            <button
              class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer"
              :class="dateFilter === 'all' ? 'bg-surface-card text-text-heading shadow-sm' : 'text-text-muted hover:text-text-heading'"
              @click="dateFilter = 'all'"
            >Semua</button>
            <button
              class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer"
              :class="dateFilter === '7d' ? 'bg-surface-card text-text-heading shadow-sm' : 'text-text-muted hover:text-text-heading'"
              @click="dateFilter = '7d'"
            >7 Hari</button>
            <button
              class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer"
              :class="dateFilter === '30d' ? 'bg-surface-card text-text-heading shadow-sm' : 'text-text-muted hover:text-text-heading'"
              @click="dateFilter = '30d'"
            >30 Hari</button>
          </div>
          <select
            v-model="dateFilter"
            class="md:hidden text-xs rounded-xl border border-border/50 bg-surface px-3 py-2 text-text-heading outline-none"
          >
            <option value="all">Semua</option>
            <option value="7d">7 Hari</option>
            <option value="30d">30 Hari</option>
          </select>
          <BaseButton variant="secondary" size="sm" @click="exportCSV">
            <span class="material-symbols-outlined text-sm mr-1">download</span>
            Export CSV
          </BaseButton>
        </div>

        <div v-if="filteredInvoices.length === 0" class="text-center py-10">
          <span class="material-symbols-outlined text-4xl text-text-muted mb-3">receipt</span>
          <p class="text-sm text-text-muted">Belum ada invoice untuk acara ini</p>
        </div>

        <div class="md:hidden space-y-2">
          <div
            v-for="inv in filteredInvoices"
            :key="inv.id"
            class="flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-surface-card cursor-pointer active:bg-surface transition-colors"
            @click="selectedInvoice = inv"
          >
            <div class="flex-1 min-w-0">
              <p class="text-xs font-mono text-text-muted truncate">{{ inv.invoice_number }}</p>
              <p class="text-sm font-semibold text-text-heading truncate">{{ inv.buyer_name }}</p>
              <p class="text-xs text-text-muted">{{ inv.ticket_type }} · {{ inv.quantity }}x {{ formatPrice(inv.total_amount) }}</p>
              <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  :class="statusClass(inv.status)"
                >{{ statusLabel(inv.status) }}</span>
                <span v-if="inv.transfer_reference" class="text-[10px] text-text-muted">Ref: {{ inv.transfer_reference }}</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <p class="text-xs text-text-muted">{{ inv.payment_date ? formatDate(inv.payment_date) : '-' }}</p>
              <span class="material-symbols-outlined text-lg text-text-muted mt-1">chevron_right</span>
            </div>
          </div>
        </div>

        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-text-muted border-b border-border/50">
                <th class="pb-3 font-semibold whitespace-nowrap">No. Invoice</th>
                <th class="pb-3 font-semibold whitespace-nowrap">Pembeli</th>
                <th class="pb-3 font-semibold whitespace-nowrap">Tiket</th>
                <th class="pb-3 font-semibold whitespace-nowrap">Qty</th>
                <th class="pb-3 font-semibold whitespace-nowrap">Total Bayar</th>
                <th class="pb-3 font-semibold whitespace-nowrap">Ref Transfer</th>
                <th class="pb-3 font-semibold whitespace-nowrap">Bank</th>
                <th class="pb-3 font-semibold whitespace-nowrap">Tgl Bayar</th>
                <th class="pb-3 font-semibold whitespace-nowrap">Status</th>
                <th class="pb-3 font-semibold whitespace-nowrap">Bukti</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inv in filteredInvoices"
                :key="inv.id"
                class="border-b border-border/30 cursor-pointer hover:bg-surface-card/50 transition-colors"
                @click="selectedInvoice = inv"
              >
                <td class="py-3 font-mono text-[11px] text-text-heading font-medium whitespace-nowrap">{{ inv.invoice_number }}</td>
                <td class="py-3 text-text-heading font-medium whitespace-nowrap">{{ inv.buyer_name }}</td>
                <td class="py-3 text-text-muted whitespace-nowrap">{{ inv.ticket_type }}</td>
                <td class="py-3 text-text-muted text-center">{{ inv.quantity }}</td>
                <td class="py-3 text-text-heading font-medium whitespace-nowrap">{{ formatPrice(inv.total_amount) }}</td>
                <td class="py-3 text-text-muted text-xs font-mono max-w-[120px] truncate">{{ inv.transfer_reference || '-' }}</td>
                <td class="py-3 text-text-muted whitespace-nowrap">{{ inv.sender_bank || '-' }}</td>
                <td class="py-3 text-text-muted text-xs whitespace-nowrap">{{ inv.payment_date ? formatDate(inv.payment_date) : '-' }}</td>
                <td class="py-3">
                  <span
                    class="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                    :class="statusClass(inv.status)"
                  >{{ statusLabel(inv.status) }}</span>
                </td>
                <td class="py-3">
                  <a
                    v-if="inv.proof_image_url"
                    :href="inv.proof_image_url"
                    target="_blank"
                    class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    @click.stop
                  >
                    <span class="material-symbols-outlined text-sm">visibility</span>
                    Lihat
                  </a>
                  <span v-else class="text-xs text-text-muted">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- Detail modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="selectedInvoice"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          @click="selectedInvoice = null"
        >
          <div
            class="bg-surface-card rounded-2xl border border-border/50 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            @click.stop
          >
            <div class="p-5 border-b border-border/50 flex items-center justify-between">
              <h3 class="text-sm font-bold text-text-heading">Detail Invoice</h3>
              <button
                class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-variant transition-colors cursor-pointer"
                @click="selectedInvoice = null"
              >
                <span class="material-symbols-outlined text-lg text-text-muted">close</span>
              </button>
            </div>

            <div class="p-5 space-y-4 text-sm" v-if="selectedInvoice">
              <div class="bg-surface rounded-xl p-4 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-text-muted text-xs">No. Invoice</span>
                  <span class="font-mono text-xs font-bold text-text-heading">{{ selectedInvoice.invoice_number }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-text-muted text-xs">Status</span>
                  <span
                    class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    :class="statusClass(selectedInvoice.status)"
                  >{{ statusLabel(selectedInvoice.status) }}</span>
                </div>
              </div>

              <div class="bg-surface rounded-xl p-4 space-y-2">
                <h4 class="text-xs font-semibold text-text-heading mb-2">Informasi Pembeli</h4>
                <div class="flex items-center justify-between">
                  <span class="text-text-muted text-xs">Nama</span>
                  <span class="text-xs font-medium text-text-heading">{{ selectedInvoice.buyer_name }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-text-muted text-xs">Tipe Tiket</span>
                  <span class="text-xs text-text-heading">{{ selectedInvoice.ticket_type }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-text-muted text-xs">Jumlah</span>
                  <span class="text-xs text-text-heading">{{ selectedInvoice.quantity }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-text-muted text-xs">Harga Satuan</span>
                  <span class="text-xs text-text-heading">{{ formatPrice(selectedInvoice.unit_price) }}</span>
                </div>
                <div class="flex items-center justify-between pt-2 border-t border-border/30">
                  <span class="text-xs font-semibold text-text-heading">Total Bayar</span>
                  <span class="text-sm font-bold text-text-heading">{{ formatPrice(selectedInvoice.total_amount) }}</span>
                </div>
              </div>

              <div class="bg-surface rounded-xl p-4 space-y-2">
                <h4 class="text-xs font-semibold text-text-heading mb-2">Transfer</h4>
                <div class="flex items-center justify-between">
                  <span class="text-text-muted text-xs">Ref Transfer</span>
                  <span class="text-xs font-mono text-text-heading">{{ selectedInvoice.transfer_reference || '-' }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-text-muted text-xs">Bank</span>
                  <span class="text-xs text-text-heading">{{ selectedInvoice.sender_bank || '-' }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-text-muted text-xs">Jumlah Transfer</span>
                  <span class="text-xs text-text-heading">{{ selectedInvoice.transfer_amount ? formatPrice(selectedInvoice.transfer_amount) : '-' }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-text-muted text-xs">Metode</span>
                  <span class="text-xs text-text-heading">{{ selectedInvoice.payment_method }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-text-muted text-xs">Tgl Bayar</span>
                  <span class="text-xs text-text-heading">{{ selectedInvoice.payment_date ? formatDateFull(selectedInvoice.payment_date) : '-' }}</span>
                </div>
              </div>

              <div v-if="selectedInvoice.proof_image_url" class="bg-surface rounded-xl p-4">
                <h4 class="text-xs font-semibold text-text-heading mb-2">Bukti Transfer</h4>
                <a
                  :href="selectedInvoice.proof_image_url"
                  target="_blank"
                  class="block rounded-lg overflow-hidden border border-border/50 hover:opacity-90 transition-opacity"
                >
                  <img
                    :src="selectedInvoice.proof_image_url"
                    alt="Bukti Transfer"
                    class="w-full h-auto max-h-[300px] object-contain bg-white"
                  />
                </a>
                <p class="text-[10px] text-text-muted mt-1 text-center">Klik untuk buka di tab baru</p>
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
