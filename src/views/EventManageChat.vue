<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { fetchWithRetry } from '@/lib/api'
import { joinRoom, leaveRoom, onEvent, offEvent } from '@/lib/socket'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { useEventContext } from '@/composables/useEventContext'

interface Thread {
  id: string
  buyer_id: string
  buyer_name: string
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

const { user } = useAuth()
const { event } = useEventContext()
const eventId = event.id

const threads = ref<Thread[]>([])
const activeThread = ref<Thread | null>(null)
const messages = ref<Message[]>([])
const messageText = ref('')
const sending = ref(false)
const loading = ref(true)
const chatChannel = ref<any>(null)

const rejectModalOpen = ref(false)
const rejectReason = ref('')
const rejectingId = ref<string | null>(null)

const activeTicketPending = computed(() => {
  return activeThread.value && activeThread.value.ticket_status === 'pending'
})

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
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

const openThread = async (thread: Thread) => {
  activeThread.value = thread
  const token = (await supabase.auth.getSession()).data.session?.access_token

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

  const token = (await supabase.auth.getSession()).data.session?.access_token

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

const subscribeToThread = (threadId: string) => {
  if (chatChannel.value) {
    supabase.removeChannel(chatChannel.value as any)
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
      (payload: any) => {
        const newMsg = payload.new as Message
        const existing = messages.value.find(m => m.id === newMsg.id)
        if (!existing) {
          messages.value.push(newMsg)
          nextTick(() => {
            const container = document.querySelector('.messages-container')
            if (container) container.scrollTop = container.scrollHeight
          })
        }
      }
    )
    .subscribe()
}

const confirmPayment = async () => {
  if (!activeThread.value) return
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const res = await fetch(`/api/tickets/${activeThread.value.ticket_request_id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'confirmed' })
  })
  if (res.ok) {
    const content = 'Pembayaran telah dikonfirmasi. Tiket sudah aktif.'
    await fetch(`/api/chat/thread/${activeThread.value.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content, message_type: 'system' })
    })
    await loadMessages()
  }
}

const openRejectModal = () => {
  rejectReason.value = ''
  rejectingId.value = activeThread.value?.ticket_request_id || null
  rejectModalOpen.value = true
}

const submitReject = async () => {
  if (!rejectingId.value || !activeThread.value) return
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const res = await fetch(`/api/tickets/${rejectingId.value}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'cancelled' })
  })
  if (res.ok) {
    const reason = rejectReason.value.trim() || 'Tidak ada alasan'
    const content = `Pembayaran ditolak. Alasan: ${reason}`
    await fetch(`/api/chat/thread/${activeThread.value.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content, message_type: 'system' })
    })
    rejectModalOpen.value = false
    await loadMessages()
  }
}

const loadMessages = async () => {
  if (!activeThread.value) return
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const res = await fetch(`/api/chat/thread/${activeThread.value.id}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (res.ok) {
    const data = await res.json()
    messages.value = data.messages || []
  }
  await nextTick()
  const container = document.querySelector('.messages-container')
  if (container) container.scrollTop = container.scrollHeight
}

const isBuyer = (msg: Message) => {
  return msg.sender_id !== user.value?.id
}

onMounted(async () => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  try {
    const res = await fetchWithRetry(`/api/chat/event/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      threads.value = data.threads || []
    }
  } catch {
    // fallback
  } finally {
    loading.value = false
  }
})

onMounted(() => {
  try {
    joinRoom(`event:${eventId}:admins`)
    onEvent('chat:new_thread', (payload: any) => {
      // payload: { thread_id, ticket_request }
      const t = payload.ticket_request
      threads.value.unshift({
        id: payload.thread_id,
        buyer_id: t.user_id,
        buyer_name: t.profiles?.name || 'Pembeli',
        ticket_request_id: t.id,
        ticket_tier: t.tier_name,
        ticket_status: t.status,
        last_message: null,
        is_active: true,
        unread_count: 1
      })
    })
  } catch {}
})

onUnmounted(() => {
  try {
    offEvent('chat:new_thread')
    leaveRoom(`event:${eventId}:admins`)
  } catch {}
})

onUnmounted(() => {
  if (chatChannel.value) {
    supabase.removeChannel(chatChannel.value as any)
  }
})
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex flex-col md:flex-row flex-1 overflow-hidden">
      <div :class="['md:w-80 border-r border-border/50 bg-surface-card overflow-y-auto', activeThread ? 'hidden md:block' : '']">
        <div class="p-4 border-b border-border/50">
          <h2 class="font-heading font-bold text-text-heading">Chat</h2>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-10">
          <span class="material-symbols-outlined text-3xl text-primary animate-spin">sync</span>
        </div>

        <div v-else-if="threads.length === 0" class="text-center py-10 px-4">
          <span class="material-symbols-outlined text-4xl text-text-muted mb-3">chat</span>
          <p class="text-sm text-text-muted">Belum ada chat</p>
        </div>

        <div v-else class="divide-y divide-border/30">
          <button
            v-for="thread in threads"
            :key="thread.id"
            class="w-full text-left p-4 hover:bg-surface/50 transition-colors cursor-pointer"
            :class="activeThread?.id === thread.id ? 'bg-teal-500/5' : ''"
            @click="openThread(thread)"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-teal-600 text-lg">person</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <p class="font-semibold text-text-heading text-sm truncate">{{ thread.buyer_name }}</p>
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
        </div>
      </div>

      <div :class="['flex-1 flex flex-col overflow-hidden', !activeThread ? 'hidden md:flex' : '']">
        <div v-if="!activeThread" class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <span class="material-symbols-outlined text-5xl text-text-muted mb-4">chat</span>
            <p class="text-text-muted">Pilih chat untuk mulai</p>
          </div>
        </div>

        <template v-else>
          <div class="p-4 border-b border-border/50 bg-surface-card">
            <div class="flex items-center gap-3">
              <button class="md:hidden cursor-pointer" @click="activeThread = null">
                <span class="material-symbols-outlined">arrow_back</span>
              </button>
              <div class="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center">
                <span class="material-symbols-outlined text-teal-600">person</span>
              </div>
              <div class="flex-1">
                <p class="font-semibold text-text-heading text-sm">{{ activeThread.buyer_name }}</p>
                <p class="text-xs text-text-muted">{{ activeThread.ticket_tier }}</p>
              </div>
            </div>
            <div v-if="activeTicketPending" class="flex gap-2 mt-3 ml-[52px]">
              <button
                class="px-3 py-1.5 text-xs font-semibold bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors cursor-pointer"
                @click="confirmPayment"
              >Konfirmasi Pembayaran</button>
              <button
                class="px-3 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors cursor-pointer"
                @click="openRejectModal"
              >Tolak</button>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-3 messages-container">
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="flex"
              :class="msg.message_type === 'system' ? 'justify-center' : (isBuyer(msg) ? 'justify-start' : 'justify-end')"
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
                :class="isBuyer(msg)
                  ? 'bg-surface-card border border-border/50 rounded-bl-md'
                  : 'bg-teal-500 text-white rounded-br-md'"
              >
                <p class="text-sm whitespace-pre-wrap">{{ msg.content }}</p>
                <p
                  class="text-[10px] mt-1"
                  :class="isBuyer(msg) ? 'text-text-muted' : 'text-white/70'"
                >{{ formatTime(msg.created_at) }}</p>
              </div>
            </div>
          </div>

          <div v-if="activeThread.is_active" class="p-4 border-t border-border/50 bg-surface-card">
            <form @submit.prevent="sendMessage" class="flex gap-2">
              <input
                v-model="messageText"
                type="text"
                placeholder="Ketik pesan..."
                class="flex-1 px-4 py-2.5 rounded-xl border border-border/50 bg-surface text-sm outline-none focus:border-teal-500 transition-colors"
              />
              <button
                type="submit"
                class="w-10 h-10 rounded-xl bg-teal-500 text-white flex items-center justify-center hover:bg-teal-600 transition-colors disabled:opacity-50 cursor-pointer"
                :disabled="!messageText.trim() || sending"
              >
                <span class="material-symbols-outlined text-lg">send</span>
              </button>
            </form>
          </div>
          <div v-else class="p-4 border-t border-border/50 bg-surface-card text-center">
            <p class="text-xs text-text-muted">Percakapan ini sudah ditutup</p>
          </div>
        </template>
      </div>
    </div>

    <div
      v-if="rejectModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="rejectModalOpen = false"
    >
      <div class="bg-surface-card rounded-2xl shadow-xl max-w-md w-full p-6">
        <h3 class="font-heading font-bold text-text-heading mb-2">Tolak Pembayaran</h3>
        <p class="text-sm text-text-muted mb-4">Berikan alasan penolakan untuk pembeli:</p>
        <textarea
          v-model="rejectReason"
          class="w-full px-4 py-3 rounded-xl border border-border/50 bg-surface text-sm outline-none focus:border-red-500 transition-colors resize-none"
          rows="3"
          placeholder="Alasan penolakan..."
        ></textarea>
        <div class="flex gap-2 mt-4 justify-end">
          <button
            class="px-4 py-2 text-sm font-semibold text-text-muted hover:text-text-heading transition-colors cursor-pointer"
            @click="rejectModalOpen = false"
          >Batal</button>
          <button
            class="px-4 py-2 text-sm font-semibold bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors cursor-pointer"
            @click="submitReject"
          >Kirim</button>
        </div>
      </div>
    </div>
  </div>
</template>
