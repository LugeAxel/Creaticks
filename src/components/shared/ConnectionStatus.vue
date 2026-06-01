<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getSocket, onEvent, offEvent } from '@/lib/socket'

const status = ref<'connected'|'connecting'|'disconnected'>('disconnected')
let pollTimer: ReturnType<typeof setTimeout> | null = null

function pollSocket() {
  const s = getSocket()
  if (s) {
    status.value = s.connected ? 'connected' : 'connecting'
  } else {
    pollTimer = setTimeout(pollSocket, 500)
  }
}

const onConnect = () => { status.value = 'connected' }
const onDisconnect = () => { status.value = 'disconnected' }
const onReconnectAttempt = () => { status.value = 'connecting' }

onMounted(() => {
  pollSocket()
  onEvent('connect', onConnect)
  onEvent('disconnect', onDisconnect)
  onEvent('reconnect_attempt', onReconnectAttempt)
})

onUnmounted(() => {
  if (pollTimer) clearTimeout(pollTimer)
  offEvent('connect', onConnect)
  offEvent('disconnect', onDisconnect)
  offEvent('reconnect_attempt', onReconnectAttempt)
})
</script>

<template>
  <div class="hidden md:flex items-center mr-2">
    <span v-if="status === 'connected'" class="w-3 h-3 rounded-full bg-teal-500 mr-2" title="Terhubung"></span>
    <span v-else-if="status === 'connecting'" class="w-3 h-3 rounded-full bg-amber-400 mr-2 animate-pulse" title="Mencoba tersambung"></span>
    <span v-else class="w-3 h-3 rounded-full bg-red-500 mr-2" title="Terputus"></span>
  </div>
</template>
