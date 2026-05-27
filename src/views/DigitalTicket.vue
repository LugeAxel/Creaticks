<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import AppLayout from '@/components/layout/AppLayout.vue'
import QRCode from 'qrcode'

const route = useRoute()
const router = useRouter()
const { session } = useAuth()

const ticketId = route.params.id as string

interface TicketData {
  id: string
  event_title: string
  event_date: string
  event_location: string
  event_banner: string
  holder_name: string
  tier_name: string
  qr_data: string
}

const ticket = ref<TicketData | null>(null)
const loading = ref(true)
const error = ref('')
const qrCanvas = ref<HTMLCanvasElement | null>(null)

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

onMounted(async () => {
  const token = session.value?.access_token
  if (!token) {
    router.push('/login')
    return
  }

  try {
    const res = await fetch(`/api/tickets/${ticketId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) {
      const data = await res.json()
      error.value = data.error || 'Tiket tidak ditemukan'
      return
    }
    const data = await res.json()
    ticket.value = data.ticket

    await nextTick()
    if (qrCanvas.value && ticket.value) {
      QRCode.toCanvas(qrCanvas.value, ticket.value.qr_data, {
        width: 200,
        margin: 2,
        color: { dark: '#1a1a2e', light: '#ffffff' }
      })
    }
  } catch {
    error.value = 'Gagal memuat tiket'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AppLayout>
    <div class="min-h-screen bg-surface flex flex-col items-center px-4 py-8">
      <div class="w-full max-w-sm">
        <h1 class="text-2xl font-heading font-bold text-text-heading mb-2">Tiket Digital</h1>
        <p class="text-sm text-text-muted mb-6">Tunjukkan QR code ini saat masuk</p>

        <div v-if="loading" class="flex justify-center py-20">
          <span class="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
        </div>

        <div v-else-if="error" class="text-center py-10">
          <span class="material-symbols-outlined text-5xl text-text-muted mb-4">confirmation_number</span>
          <p class="text-sm text-text-muted">{{ error }}</p>
        </div>

        <div v-else-if="ticket" class="bg-surface-card rounded-2xl border border-border/50 overflow-hidden shadow-lg">
          <div v-if="ticket.event_banner" class="h-32 bg-surface-variant overflow-hidden">
            <img :src="ticket.event_banner" class="w-full h-full object-cover" />
          </div>
          <div v-else class="h-32 bg-surface-variant flex items-center justify-center">
            <span class="material-symbols-outlined text-4xl text-text-muted">image</span>
          </div>

          <div class="px-5 pt-4 pb-3">
            <h2 class="font-heading font-bold text-lg text-text-heading mb-1">{{ ticket.event_title }}</h2>
            <p class="text-xs text-text-muted flex items-center gap-1.5 mb-1">
              <span class="material-symbols-outlined text-[14px]">calendar_today</span>
              {{ formatDate(ticket.event_date) }}
            </p>
            <p class="text-xs text-text-muted flex items-center gap-1.5 mb-1">
              <span class="material-symbols-outlined text-[14px]">schedule</span>
              {{ formatTime(ticket.event_date) }}
            </p>
            <p v-if="ticket.event_location" class="text-xs text-text-muted flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[14px]">location_on</span>
              {{ ticket.event_location }}
            </p>
          </div>

          <div class="border-t border-dashed border-border/60 mx-5 relative">
            <div class="absolute -left-3 -top-2.5 w-5 h-5 rounded-full bg-surface border border-border/50"></div>
            <div class="absolute -right-3 -top-2.5 w-5 h-5 rounded-full bg-surface border border-border/50"></div>
          </div>

          <div class="px-5 pt-4 pb-5 text-center">
            <div class="flex justify-center mb-4">
              <canvas ref="qrCanvas" class="rounded-xl"></canvas>
            </div>
            <p class="text-sm font-semibold text-text mb-1">{{ ticket.holder_name }}</p>
            <p class="text-xs text-text-muted">{{ ticket.tier_name }}</p>
            <p class="text-xs text-text-muted mt-3 font-mono tracking-wider">{{ ticket.id }}</p>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
