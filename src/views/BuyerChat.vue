<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRoute } from 'vue-router'
import { fetchWithRetry } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { useCloudinary } from '@/composables/useCloudinary'
import AppLayout from '@/components/layout/AppLayout.vue'
import BackButton from '@/components/shared/BackButton.vue'

interface Thread {
  id: string
  event_id: string
  event_name: string
  ticket_request_id: string
  ticket_tier: string
  ticket_status: string
  last_message: { content: string; created_at: string; sender_id: string } | null
  is_active: boolean
  unread_count: number
}

interface Message {
  id: string
  thread_id: string
  sender_id: string
  content: string
  message_type: 'text' | 'system' | string
  image_url: string | null
  created_at: string
}

const route = useRoute()
const { user, session } = useAuth()
const { upload } = useCloudinary()
const threads = ref<Thread[]>([])
const activeThread = ref<Thread | null>(null)
const messages = ref<Message[]>([])
const messageText = ref('')
const loading = ref(true)
const sending = ref(false)
const uploadingImage = ref(false)
const error = ref('')
const chatChannel = ref<any>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const proofFileInput = ref<HTMLInputElement | null>(null)

// Payment proof form
const showProofForm = ref(false)
const proofFile = ref<File | null>(null)
const proofRef = ref('')
const proofBank = ref('')
const proofAmount = ref<number>(0)
const proofSubmitting = ref(false)
const proofError = ref('')

const bankOptions = ['BCA', 'Mandiri', 'BNI', 'BRI', 'GoPay', 'OVO', 'DANA', 'ShopeePay', 'Lainnya']

const isPendingPayment = computed(() => {
  return activeThread.value?.ticket_status === 'pending'
})

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return formatTime(dateStr)
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })
}

const isOutgoing = (msg: Message) => {
  return msg.sender_id === user.value?.id
}

const loadThreads = async () => {
  try {
    const token = session.value?.access_token
    const res = await fetchWithRetry('/api/chat/me', {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!res.ok) {
      const data = await res.json()
      error.value = data.error || 'Gagal memuat chat'
      return
    }

    const data = await res.json()
    threads.value = data.threads || []
  } catch {
    error.value = 'Gagal memuat chat'
  } finally {
    loading.value = false
  }
}

const openThread = async (thread: Thread) => {
  activeThread.value = thread
  messages.value = []
  const token = session.value?.access_token

  if (!token) return

  const res = await fetch(`/api/chat/thread/${thread.id}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (res.ok) {
    const data = await res.json()
    messages.value = data.messages || []
  }

  await nextTick()
  const container = document.querySelector('.messages-container')
  if (container) container.scrollTop = container.scrollHeight

  subscribeToThread(thread.id)
}

const sendMessage = async () => {
  if (!messageText.value.trim() || !activeThread.value || sending.value) return

  const content = messageText.value.trim()
  messageText.value = ''
  sending.value = true

  const token = session.value?.access_token
  if (!token) return

  const optimistic: Message = {
    id: 'temp_' + Date.now(),
    thread_id: activeThread.value.id,
    sender_id: user.value?.id || '',
    content,
    message_type: 'text',
    image_url: null,
    created_at: new Date().toISOString()
  }

  messages.value.push(optimistic)
  await nextTick()
  const container = document.querySelector('.messages-container')
  if (container) container.scrollTop = container.scrollHeight

  const res = await fetch(`/api/chat/thread/${activeThread.value.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content })
  })

  if (res.ok) {
    const data = await res.json()
    const idx = messages.value.findIndex(m => m.id === optimistic.id)
    if (idx !== -1) {
      messages.value[idx] = data.message
    }
  }

  sending.value = false
}

const handleFilePick = () => {
  fileInput.value?.click()
}

const handleFileChange = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !activeThread.value || !session.value?.access_token) return

  uploadingImage.value = true
  try {
    const result = await upload(file, session.value.access_token, 'payment-proofs')

    const res = await fetch(`/api/chat/thread/${activeThread.value.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.value.access_token}` },
      body: JSON.stringify({ content: '📎 Bukti transfer', message_type: 'image', image_url: result.url })
    })

    if (res.ok) {
      const data = await res.json()
      messages.value.push(data.message)
      await nextTick()
      const container = document.querySelector('.messages-container')
      if (container) container.scrollTop = container.scrollHeight
    }
  } catch {
    // upload failed silently
  } finally {
    uploadingImage.value = false
    input.value = ''
  }
}

const submitProof = async () => {
  if (!activeThread.value || !session.value?.access_token) return

  // Validate
  if (!proofRef.value.trim()) {
    proofError.value = 'Nomor referensi wajib diisi'
    return
  }
  if (!proofBank.value) {
    proofError.value = 'Pilih bank/e-wallet tujuan'
    return
  }
  if (proofAmount.value <= 0) {
    proofError.value = 'Jumlah transfer wajib diisi'
    return
  }

  proofSubmitting.value = true
  proofError.value = ''

  try {
    let imageUrl = ''

    // Upload proof image if provided
    if (proofFile.value) {
      const result = await upload(proofFile.value, session.value.access_token, 'payment-proofs')
      imageUrl = result.url
    }

    // Send image message
    if (imageUrl) {
      const imgRes = await fetch(`/api/chat/thread/${activeThread.value.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.value.access_token}` },
        body: JSON.stringify({ content: '📎 Bukti transfer', message_type: 'image', image_url: imageUrl })
      })
      if (imgRes.ok) {
        const data = await imgRes.json()
        messages.value.push(data.message)
      }
    }

    // Send structured text message
    const textContent = `Bukti Transfer\nReferensi: ${proofRef.value}\nBank: ${proofBank.value}\nJumlah: Rp ${proofAmount.value.toLocaleString('id-ID')}`

    const textRes = await fetch(`/api/chat/thread/${activeThread.value.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.value.access_token}` },
      body: JSON.stringify({ content: textContent })
    })

    if (textRes.ok) {
      const data = await textRes.json()
      messages.value.push(data.message)
    }

    // Save proof data to backend
    const proofRes = await fetch(`/api/tickets/${activeThread.value.ticket_request_id}/proof`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.value.access_token}` },
      body: JSON.stringify({
        transfer_reference: proofRef.value,
        sender_bank: proofBank.value,
        transfer_amount: proofAmount.value,
        proof_image_url: imageUrl || ''
      })
    })

    if (!proofRes.ok) {
      const errData = await proofRes.json()
      proofError.value = errData.error || 'Gagal menyimpan bukti transfer'
      return
    }

    // Send system message
    await fetch(`/api/chat/thread/${activeThread.value.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.value.access_token}` },
      body: JSON.stringify({ content: 'Bukti transfer telah dikirim. Menunggu konfirmasi admin.', message_type: 'system' })
    })

    // Reset form
    showProofForm.value = false
    proofFile.value = null
    proofRef.value = ''
    proofBank.value = ''
    proofAmount.value = 0

    await nextTick()
    const container = document.querySelector('.messages-container')
    if (container) container.scrollTop = container.scrollHeight
  } catch {
    proofError.value = 'Gagal mengirim bukti transfer'
  } finally {
    proofSubmitting.value = false
  }
}

const subscribeToThread = (threadId: string) => {
  if (chatChannel.value) {
    supabase.removeChannel(chatChannel.value)
  }

  chatChannel.value = supabase
    .channel(`chat_${threadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `thread_id=eq.${threadId}`
      },
      async (payload: any) => {
        const newMsg = payload.new as Message
        const existing = messages.value.find(m => m.id === newMsg.id)
        if (!existing) {
          messages.value.push(newMsg)
          await nextTick()
          const container = document.querySelector('.messages-container')
          if (container) container.scrollTop = container.scrollHeight
        }
      }
    )
    .subscribe()
}

onMounted(async () => {
  await loadThreads()

  // Auto-open thread if ticketId was passed as query param
  const ticketId = route.query.ticketId as string | undefined
  if (ticketId && threads.value.length > 0) {
    const { data: threadFromTicket } = await supabase
      .from('chat_threads')
      .select('id')
      .eq('ticket_request_id', ticketId)
      .maybeSingle()

    if (threadFromTicket) {
      const match = threads.value.find(t => t.id === threadFromTicket.id)
      if (match) {
        await openThread(match)
      }
    }
  }
})

onUnmounted(() => {
  if (chatChannel.value) {
    supabase.removeChannel(chatChannel.value)
  }
})
</script>

<template>
  <AppLayout title="Chat Penyelenggara">
    <div class="px-4 md:px-6 py-6 max-w-6xl mx-auto">
      <div class="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 class="text-xl font-heading font-bold text-text-heading">Chat Penyelenggara</h1>
          <p class="text-sm text-text-muted mt-1">Lihat percakapan tiket kamu dengan penyelenggara acara.</p>
        </div>
        <BackButton label="Kembali" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <div class="bg-surface-card border border-border/50 rounded-3xl overflow-hidden h-[calc(100vh-160px)] lg:h-auto">
          <div class="p-4 border-b border-border/50">
            <h2 class="font-semibold text-text-heading">Percakapan</h2>
          </div>

          <div class="overflow-y-auto h-[calc(100vh-220px)] lg:h-[calc(100vh-260px)]">
            <div v-if="loading" class="flex items-center justify-center py-10">
              <span class="material-symbols-outlined text-3xl text-primary animate-spin">sync</span>
            </div>

            <div v-else-if="error" class="px-4 py-10 text-center text-sm text-text-muted">
              {{ error }}
            </div>

            <div v-else-if="threads.length === 0" class="px-4 py-10 text-center">
              <span class="material-symbols-outlined text-4xl text-text-muted mb-3">chat</span>
              <p class="text-sm text-text-muted">Belum ada percakapan. Permintaan tiketmu akan membuat thread secara otomatis.</p>
            </div>

            <div v-else class="divide-y divide-border/30">
              <button
                v-for="thread in threads"
                :key="thread.id"
                @click="openThread(thread)"
                class="w-full text-left p-4 hover:bg-surface/50 transition-colors cursor-pointer"
                :class="activeThread?.id === thread.id ? 'bg-primary/5' : ''"
              >
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="font-semibold text-text-heading text-sm truncate">{{ thread.event_name }}</p>
                    <p class="text-xs text-text-muted truncate">{{ thread.ticket_tier }} · {{ thread.ticket_status }}</p>
                  </div>
                  <div class="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">{{ thread.unread_count || '' }}</div>
                </div>
                <p class="text-xs text-text-muted mt-2 truncate">{{ thread.last_message?.content || 'Belum ada pesan' }}</p>
              </button>
            </div>
          </div>
        </div>

        <div class="bg-surface-card border border-border/50 rounded-3xl overflow-hidden flex flex-col min-h-[400px]">
          <div class="px-5 py-4 border-b border-border/50">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-semibold text-text-heading">{{ activeThread?.event_name || 'Pilih percakapan untuk mulai' }}</p>
                <p v-if="activeThread" class="text-xs text-text-muted">{{ activeThread.ticket_tier }} · {{ activeThread.ticket_status }}</p>
              </div>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto messages-container p-5 space-y-4">
            <div v-if="!activeThread" class="flex items-center justify-center h-full text-center text-text-muted">
              <div>
                <span class="material-symbols-outlined text-5xl text-text-muted mb-4">chat</span>
                <p class="text-sm">Pilih percakapan di sisi kiri untuk melihat pesan.</p>
              </div>
            </div>

            <div v-else>
              <div v-for="message in messages" :key="message.id" class="flex" :class="isOutgoing(message) ? 'justify-end' : 'justify-start'">
                <div :class="[`max-w-[85%] rounded-3xl px-4 py-3 text-sm`, message.message_type === 'system' ? 'bg-surface-variant text-text-muted italic' : isOutgoing(message) ? 'bg-primary text-white' : 'bg-surface-variant text-text']">
                  <img
                    v-if="message.image_url"
                    :src="message.image_url"
                    alt="Bukti transfer"
                    class="max-w-full rounded-xl mb-2"
                    style="max-height: 240px;"
                  />
                  <p v-if="message.content" class="whitespace-pre-wrap break-words">{{ message.content }}</p>
                  <p class="text-[10px] text-text-muted mt-1 text-right" :class="isOutgoing(message) ? 'text-white/60' : ''">{{ formatDate(message.created_at) }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Payment Proof Form -->
          <div v-if="activeThread && isPendingPayment" class="px-4 pt-4 border-t border-border/50 bg-surface-card">
            <div v-if="!showProofForm" class="mb-4">
              <button
                class="w-full py-2.5 text-sm font-semibold text-primary border-2 border-dashed border-primary/30 rounded-xl hover:bg-primary/5 transition-colors cursor-pointer"
                @click="showProofForm = true"
              >
                <span class="material-symbols-outlined text-[16px] align-middle mr-1">upload</span>
                Kirim Bukti Transfer
              </button>
            </div>
            <div v-else class="mb-4 p-4 rounded-xl bg-surface-variant space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-semibold text-text-heading">Kirim Bukti Transfer</h3>
                <button class="text-text-muted hover:text-text-heading cursor-pointer" @click="showProofForm = false">
                  <span class="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
              <div>
                <label class="text-xs font-medium text-text-muted block mb-1">Screenshot Bukti Transfer</label>
                <button
                  class="w-full py-2 text-xs font-semibold text-text-muted border border-dashed border-border rounded-xl hover:bg-surface/50 transition-colors cursor-pointer"
                  :class="{ 'border-primary/50 text-primary': proofFile }"
                  @click="fileInput?.click()"
                >
                  <span class="material-symbols-outlined text-[14px] align-middle mr-1">image</span>
                  {{ proofFile ? proofFile.name : 'Pilih gambar' }}
                </button>
                <input ref="proofFileInput" type="file" accept="image/*" class="hidden" @change="e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) proofFile = f }" />
              </div>
              <div>
                <label class="text-xs font-medium text-text-muted block mb-1">Nomor Referensi *</label>
                <input v-model="proofRef" type="text" placeholder="Contoh: BCA-20260607-91823" class="w-full rounded-xl border border-border/50 bg-white/90 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
              </div>
              <div>
                <label class="text-xs font-medium text-text-muted block mb-1">Bank/E-Wallet Tujuan *</label>
                <select v-model="proofBank" class="w-full rounded-xl border border-border/50 bg-white/90 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20">
                  <option value="">Pilih bank</option>
                  <option v-for="bank in bankOptions" :key="bank" :value="bank">{{ bank }}</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-medium text-text-muted block mb-1">Jumlah Transfer *</label>
                <input v-model.number="proofAmount" type="number" min="0" placeholder="Rp" class="w-full rounded-xl border border-border/50 bg-white/90 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20" />
              </div>
              <p v-if="proofError" class="text-xs text-error">{{ proofError }}</p>
              <button
                class="w-full py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-light disabled:opacity-50 transition-colors cursor-pointer"
                :disabled="proofSubmitting"
                @click="submitProof"
              >
                {{ proofSubmitting ? 'Mengirim...' : 'Kirim Bukti Transfer' }}
              </button>
            </div>
          </div>

          <div class="p-4 border-t border-border/50 bg-surface-card">
            <div class="flex gap-2">
              <button
                class="rounded-2xl bg-surface-variant px-3 py-3 text-text-muted hover:text-text-heading hover:bg-surface-dim transition-colors cursor-pointer disabled:opacity-30"
                :disabled="!activeThread || sending || uploadingImage"
                @click="handleFilePick"
              >
                <span class="material-symbols-outlined text-[20px]">{{ uploadingImage ? 'sync' : 'attach_file' }}</span>
              </button>
              <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="handleFileChange" />
              <input
                v-model="messageText"
                type="text"
                placeholder="Ketik pesan..."
                class="flex-1 rounded-2xl border border-border/50 bg-white/90 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                @keyup.enter="sendMessage"
                :disabled="!activeThread || sending"
              />
              <button
                class="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                @click="sendMessage"
                :disabled="!activeThread || sending || uploadingImage"
              >
                Kirim
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
