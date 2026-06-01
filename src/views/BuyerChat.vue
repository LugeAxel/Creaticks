<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchWithRetry } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { useCloudinary } from '@/composables/useCloudinary'
import AppLayout from '@/components/layout/AppLayout.vue'
import BackButton from '@/components/shared/BackButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

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
const error = ref('')
const hasMore = ref(false)
const loadingMore = ref(false)
const chatChannel = ref<any>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const visibleCount = ref(5)
const displayedThreads = computed(() => threads.value.slice(0, visibleCount.value))
const hasMoreThreads = computed(() => threads.value.length > visibleCount.value)
const loadMoreThreads = () => { visibleCount.value += 5 }

// Payment proof form
const showProofForm = ref(false)
const proofFile = ref<File | null>(null)
const proofPreviewUrl = ref('')

const removeProofFile = () => {
  if (proofPreviewUrl.value) {
    URL.revokeObjectURL(proofPreviewUrl.value)
    proofPreviewUrl.value = ''
  }
  proofFile.value = null
  showProofForm.value = false
}

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

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-600' },
    confirmed: { label: 'Confirmed', cls: 'bg-teal-500/10 text-teal-600' },
    cancelled: { label: 'Dibatalkan', cls: 'bg-red-500/10 text-red-600' }
  }
  return map[status] || { label: status, cls: 'bg-gray-500/10 text-gray-600' }
}

const isOutgoing = (msg: Message) => {
  return msg.sender_id === user.value?.id
}

watch(proofFile, (file) => {
  if (proofPreviewUrl.value) {
    URL.revokeObjectURL(proofPreviewUrl.value)
  }
  proofPreviewUrl.value = file ? URL.createObjectURL(file) : ''
})

const loadThreads = async () => {
  try {
    const res = await fetchWithRetry('/api/chat/me')

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
  hasMore.value = false
  loadingMore.value = false

  const res = await fetchWithRetry(`/api/chat/thread/${thread.id}?limit=50`, {})
  if (res.ok) {
    const data = await res.json()
    messages.value = data.messages || []
    hasMore.value = !!data.has_more
  }

  // Mark thread as read
  await fetchWithRetry(`/api/chat/thread/${thread.id}/read`, { method: 'PUT' })
  thread.unread_count = 0

  await nextTick()
  const container = document.querySelector('.messages-container')
  if (container) container.scrollTop = container.scrollHeight

  subscribeToThread(thread.id)
}

const loadOlderMessages = async () => {
  if (!activeThread.value || loadingMore.value || !hasMore.value) return
  loadingMore.value = true

  const oldest = messages.value.length > 0 ? messages.value[0].created_at : undefined
  const before = oldest ? `&before=${encodeURIComponent(oldest)}` : ''

  const res = await fetchWithRetry(`/api/chat/thread/${activeThread.value.id}?limit=50${before}`, {})
  if (res.ok) {
    const data = await res.json()
    messages.value = [...(data.messages || []), ...messages.value]
    hasMore.value = !!data.has_more
    await nextTick()
    const container = document.querySelector('.messages-container')
    if (container) {
      const firstNewMsg = container.querySelector('[data-message-id]')
      if (firstNewMsg) firstNewMsg.scrollIntoView({ block: 'start' })
    }
  }
  loadingMore.value = false
}

const onMessagesScroll = (e: Event) => {
  const el = e.target as HTMLElement
  if (el.scrollTop < 80 && hasMore.value && !loadingMore.value) {
    loadOlderMessages()
  }
}

const sendMessage = async () => {
  if (!messageText.value.trim() || !activeThread.value || sending.value) return

  const content = messageText.value.trim()
  messageText.value = ''
  sending.value = true

  const idempotencyKey = crypto.randomUUID?.() ?? Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)

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

  const res = await fetchWithRetry(`/api/chat/thread/${activeThread.value.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, message_type: 'text' }),
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }
  })

  if (res.ok) {
    const data = await res.json()
    const idx = messages.value.findIndex(m => m.id === optimistic.id)
    if (idx >= 0) {
      messages.value[idx] = data.message
    }
  } else {
    // Remove optimistic message on failure
    messages.value = messages.value.filter(m => m.id !== optimistic.id)
  }

  sending.value = false
  await nextTick()
  const container = document.querySelector('.messages-container')
  if (container) container.scrollTop = container.scrollHeight
}

const handleFilePick = () => {
  fileInput.value?.click()
}

const handleFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  proofFile.value = file
  showProofForm.value = true
  input.value = ''
}

const submitProof = async () => {
  if (!activeThread.value) return

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
      const result = await upload(proofFile.value, session.value?.access_token || '', 'payment-proofs')
      imageUrl = result.url
    }

    // Save proof data to backend FIRST (before sending any messages)
    const proofRes = await fetchWithRetry(`/api/tickets/${activeThread.value.ticket_request_id}/proof`, {
      method: 'PUT',
      body: JSON.stringify({
        transfer_reference: proofRef.value,
        sender_bank: proofBank.value,
        transfer_amount: proofAmount.value,
        proof_image_url: imageUrl || ''
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    if (!proofRes.ok) {
      const errData = await proofRes.json()
      proofError.value = errData.error || 'Gagal menyimpan bukti transfer'
      return
    }

    // Send image message
    if (imageUrl) {
      const imgRes = await fetchWithRetry(`/api/chat/thread/${activeThread.value.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: 'Bukti transfer', message_type: 'image', image_url: imageUrl }),
        headers: { 'Content-Type': 'application/json' }
      })
      if (imgRes.ok) {
        const data = await imgRes.json()
        messages.value.push(data.message)
      }
    }

    // Send structured text message
    const textContent = `Bukti Transfer\nReferensi: ${proofRef.value}\nBank: ${proofBank.value}\nJumlah: Rp ${proofAmount.value.toLocaleString('id-ID')}`

    const textRes = await fetchWithRetry(`/api/chat/thread/${activeThread.value.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: textContent }),
      headers: { 'Content-Type': 'application/json' }
    })

    if (textRes.ok) {
      const data = await textRes.json()
      messages.value.push(data.message)
    }

    // Send system message
    await fetchWithRetry(`/api/chat/thread/${activeThread.value.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Bukti transfer telah dikirim. Menunggu konfirmasi admin.', message_type: 'system' }),
      headers: { 'Content-Type': 'application/json' }
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
  if (proofPreviewUrl.value) {
    URL.revokeObjectURL(proofPreviewUrl.value)
  }
  if (chatChannel.value) {
    supabase.removeChannel(chatChannel.value)
  }
})
</script>

<template>
  <AppLayout title="Chat Penyelenggara">
    <div class="h-dvh flex flex-col overflow-hidden px-4 md:px-6 max-w-6xl mx-auto">
      <div class="shrink-0 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 class="text-xl font-heading font-bold text-text-heading">Chat Penyelenggara</h1>
          <p class="text-sm text-text-muted mt-1">Lihat percakapan tiket kamu dengan penyelenggara acara.</p>
        </div>
        <BackButton label="Kembali" />
      </div>

      <div class="flex flex-col md:flex-row flex-1 overflow-hidden rounded-3xl border border-border/50 bg-surface-card">
        <div :class="['md:w-80 border-r border-border/50 bg-surface-card overflow-y-auto', activeThread ? 'hidden md:block' : '']">
          <div class="p-4 border-b border-border/50">
            <h2 class="font-semibold text-text-heading">Percakapan</h2>
          </div>

          <div class="overflow-y-auto">
            <SkeletonPage v-if="loading" type="chat" />

            <div v-else-if="error" class="px-4 py-10 text-center text-sm text-text-muted">
              {{ error }}
            </div>

            <div v-else-if="threads.length === 0" class="px-4 py-10 text-center">
              <span class="material-symbols-outlined text-4xl text-text-muted mb-3">chat</span>
              <p class="text-sm text-text-muted">Belum ada percakapan. Permintaan tiketmu akan membuat thread secara otomatis.</p>
            </div>

            <div v-else class="divide-y divide-border/30">
              <button
                v-for="thread in displayedThreads"
                :key="thread.id"
                @click="openThread(thread)"
                class="w-full text-left p-4 hover:bg-surface/50 transition-colors cursor-pointer"
                :class="activeThread?.id === thread.id ? 'bg-teal-500/5' : ''"
              >
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center shrink-0">
                    <span class="material-symbols-outlined text-teal-600 text-lg">confirmation_number</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                      <p class="font-semibold text-text-heading text-sm truncate">{{ thread.event_name }}</p>
                      <p v-if="thread.last_message" class="text-xs text-text-muted shrink-0">{{ formatDate(thread.last_message.created_at) }}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-text-muted truncate">{{ thread.last_message?.content || 'Belum ada pesan' }}</span>
                      <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" :class="statusBadge(thread.ticket_status).cls">{{ thread.ticket_tier }}</span>
                    </div>
                  </div>
                  <div v-if="thread.unread_count > 0" class="w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {{ thread.unread_count }}
                  </div>
                </div>
              </button>
              <div v-if="hasMoreThreads" class="p-3 text-center">
                <button
                  class="px-4 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-full hover:bg-primary/5 transition-colors cursor-pointer"
                  @click="loadMoreThreads"
                >
                  Muat lebih banyak ({{ threads.length - visibleCount }})
                </button>
              </div>
            </div>
          </div>
        </div>

        <div :class="['flex-1 flex flex-col overflow-hidden', !activeThread ? 'hidden md:flex' : '']">
          <div class="shrink-0 px-5 py-4 border-b border-border/50 bg-surface-card">
            <div class="flex items-center gap-3">
              <button class="md:hidden cursor-pointer" @click="activeThread = null">
                <span class="material-symbols-outlined">arrow_back</span>
              </button>
              <div class="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-teal-600">storefront</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-text-heading text-sm truncate">{{ activeThread?.event_name || 'Pilih percakapan untuk mulai' }}</p>
                <p v-if="activeThread" class="text-xs text-text-muted truncate">{{ activeThread.ticket_tier }}</p>
              </div>
            </div>
          </div>

          <div v-if="!activeThread" class="flex-1 flex items-center justify-center">
              <div class="text-center">
                <span class="material-symbols-outlined text-5xl text-text-muted mb-4">chat</span>
                <p class="text-text-muted text-sm">Pilih percakapan untuk mulai</p>
              </div>
          </div>

          <div v-else class="flex-1 overflow-y-auto messages-container p-5 space-y-4" @scroll="onMessagesScroll">
              <div v-if="loadingMore" class="flex justify-center py-3">
                <span class="material-symbols-outlined text-lg text-text-muted animate-spin">sync</span>
              </div>
              <div v-if="hasMore && !loadingMore" class="text-center py-2">
                <button @click="loadOlderMessages" class="text-xs text-primary font-semibold cursor-pointer hover:underline">Muat pesan lama</button>
              </div>
              <div
                v-for="msg in messages"
                :key="msg.id"
                :data-message-id="msg.id"
                class="flex"
                :class="msg.message_type === 'system' ? 'justify-center' : (isOutgoing(msg) ? 'justify-end' : 'justify-start')"
              >
                <div
                  v-if="msg.message_type === 'system'"
                  class="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-2"
                >
                  <p class="text-xs text-amber-700 text-center whitespace-pre-wrap">{{ msg.content }}</p>
                  <p class="text-[10px] text-amber-500/70 text-center mt-1">{{ formatTime(msg.created_at) }}</p>
                </div>
                <div
                  v-else
                  class="max-w-[80%] rounded-2xl px-4 py-2.5"
                  :class="isOutgoing(msg)
                    ? 'bg-teal-500 text-white rounded-br-md'
                    : 'bg-surface-card border border-border/50 rounded-bl-md'"
                >
                  <img
                    v-if="msg.image_url"
                    :src="msg.image_url"
                    alt="Gambar"
                    class="max-w-full rounded-xl mb-2"
                    style="max-height: 200px;"
                  />
                  <p v-if="msg.content" class="text-sm whitespace-pre-wrap break-words">{{ msg.content }}</p>
                  <p
                    class="text-[10px] mt-1"
                    :class="isOutgoing(msg) ? 'text-white/70' : 'text-text-muted'"
                  >{{ formatTime(msg.created_at) }}</p>
                </div>
              </div>
            </div>

          <!-- Payment Proof Form -->
          <div v-if="activeThread && isPendingPayment" class="px-4 pt-4 border-t border-border/50 bg-surface-card">
            <div v-if="!showProofForm" class="mb-4">
              <button
                class="w-full py-2.5 text-sm font-semibold text-teal-600 border-2 border-dashed border-teal-500/30 rounded-xl hover:bg-teal-500/5 transition-colors cursor-pointer"
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
                <div v-if="proofFile" class="relative rounded-xl overflow-hidden border border-border/50 bg-surface-card">
                  <img :src="proofPreviewUrl" alt="Preview" class="w-full object-cover" style="max-height: 200px;" />
                  <button type="button" @click="removeProofFile" class="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 cursor-pointer">
                    <span class="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
                <button v-else
                  class="w-full py-2 text-xs font-semibold text-text-muted border border-dashed border-border rounded-xl hover:bg-surface/50 transition-colors cursor-pointer"
                  @click="fileInput?.click()"
                >
                  <span class="material-symbols-outlined text-[14px] align-middle mr-1">image</span>
                  Pilih gambar bukti transfer
                </button>
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
                class="w-full py-2.5 text-sm font-semibold text-white bg-teal-500 rounded-xl hover:bg-teal-600 disabled:opacity-50 transition-colors cursor-pointer"
                :disabled="proofSubmitting"
                @click="submitProof"
              >
                {{ proofSubmitting ? 'Mengirim...' : 'Kirim Bukti Transfer' }}
              </button>
            </div>
          </div>

          <div v-if="activeThread?.is_active" class="shrink-0 p-4 border-t border-border/50 bg-surface-card">
            <form @submit.prevent="sendMessage" class="flex gap-2">
              <button
                type="button"
                class="w-10 h-10 rounded-xl bg-surface-variant text-text-muted hover:text-text-heading hover:bg-surface-dim transition-colors flex items-center justify-center cursor-pointer disabled:opacity-30 shrink-0"
                :disabled="!activeThread || sending"
                @click="handleFilePick"
              >
                <span class="material-symbols-outlined text-lg">attach_file</span>
              </button>
              <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="handleFileChange" />
              <input
                v-model="messageText"
                type="text"
                placeholder="Ketik pesan..."
                class="flex-1 px-4 py-2.5 rounded-xl border border-border/50 bg-surface-card text-sm outline-none focus:border-teal-500 transition-colors"
                :disabled="!activeThread || sending"
              />
              <button
                type="submit"
                class="w-10 h-10 rounded-xl bg-teal-500 text-white flex items-center justify-center hover:bg-teal-600 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                :disabled="!messageText.trim() || sending"
              >
                <span class="material-symbols-outlined text-lg">send</span>
              </button>
            </form>
          </div>
          <div v-else class="shrink-0 p-4 border-t border-border/50 bg-surface-card text-center">
            <p class="text-xs text-text-muted">Percakapan ini sudah ditutup</p>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>
