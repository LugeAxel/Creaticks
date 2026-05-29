<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import SeatMap, { type SeatData, type TierInfo } from './SeatMap.vue'

const props = withDefaults(defineProps<{
  seats: SeatData[]
  gridX: number
  gridY: number
  tiers: TierInfo[]
  sessionId: string
  maxSeats?: number
  authToken: string
  activeTierId?: string
  initialSelectedIds?: string[]
  allSelectedIds?: string[]
}>(), {
  maxSeats: 5,
  activeTierId: undefined,
  initialSelectedIds: () => [],
  allSelectedIds: () => []
})

const emit = defineEmits<{
  change: [selectedIds: string[]]
}>()

const selectedSeatIds = ref<string[]>([])
const lockTimers = ref<Record<string, { expiresAt: string; interval: number }>>({})
const error = ref('')
const pendingSeatIds = ref<string[]>([])
const isLocking = computed(() => pendingSeatIds.value.length > 0)

const otherTierSelectedIds = computed(() =>
  props.allSelectedIds.filter(id => !selectedSeatIds.value.includes(id))
)

const availableSeats = computed(() =>
  props.seats.filter(s => s.status === 'available')
)

const selectedCount = computed(() => selectedSeatIds.value.length)

const canSelectMore = computed(() =>
  selectedCount.value < props.maxSeats
)

async function toggleSeat(seatId: string) {
  error.value = ''

  if (isLocking.value) return
  if (pendingSeatIds.value.includes(seatId)) return

  const seat = props.seats.find(s => s.id === seatId)
  if (!seat || seat.status !== 'available') return
  if (props.activeTierId && seat.tier_id !== props.activeTierId) return

  if (selectedSeatIds.value.includes(seatId)) {
    await releaseSeat(seatId)
    return
  }

  if (!canSelectMore.value) {
    error.value = `Maksimal ${props.maxSeats} kursi dapat dipilih`
    return
  }

  await lockSeat(seatId)
}

async function lockSeat(seatId: string) {
  pendingSeatIds.value.push(seatId)
  try {
    const res = await fetch('/api/seat-locks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${props.authToken}`
      },
      body: JSON.stringify({
        seatId,
        ticketTypeId: null,
        sessionId: props.sessionId
      })
    })

    const data = await res.json()

    if (!res.ok) {
      if (data.code === 'SEAT_UNAVAILABLE' || data.code === 'SEAT_LOCK_CONTENTION') {
        error.value = 'Kursi sudah dipilih pengguna lain'
      } else {
        error.value = data.error || 'Gagal mengunci kursi'
      }
      return
    }

    selectedSeatIds.value.push(seatId)

    const expiresAt = data.lock_expires_at
    const timeLeft = new Date(expiresAt).getTime() - Date.now()

    if (timeLeft > 0) {
      const interval = window.setTimeout(() => {
        selectedSeatIds.value = selectedSeatIds.value.filter(id => id !== seatId)
        delete lockTimers.value[seatId]
        emit('change', selectedSeatIds.value)
      }, timeLeft)

      lockTimers.value[seatId] = { expiresAt, interval }
    }

    emit('change', selectedSeatIds.value)
  } catch {
    error.value = 'Gagal menghubungi server'
  } finally {
    pendingSeatIds.value = pendingSeatIds.value.filter(id => id !== seatId)
  }
}

async function releaseSeat(seatId: string) {
  if (pendingSeatIds.value.includes(seatId)) return
  pendingSeatIds.value.push(seatId)
  try {
    await fetch(`/api/seat-locks/${seatId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${props.authToken}`
      },
      body: JSON.stringify({ sessionId: props.sessionId })
    })
  } catch {
    // best-effort release
  } finally {
    pendingSeatIds.value = pendingSeatIds.value.filter(id => id !== seatId)
  }

  selectedSeatIds.value = selectedSeatIds.value.filter(id => id !== seatId)

  if (lockTimers.value[seatId]) {
    clearTimeout(lockTimers.value[seatId].interval)
    delete lockTimers.value[seatId]
  }

  emit('change', selectedSeatIds.value)
}

async function releaseAll() {
  const ids = [...selectedSeatIds.value]
  for (const id of ids) {
    await releaseSeat(id)
  }
}

function formatTimer(seatId: string): string {
  const timer = lockTimers.value[seatId]
  if (!timer) return ''
  const secs = Math.max(0, Math.floor((new Date(timer.expiresAt).getTime() - Date.now()) / 1000))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const timerTick = ref(0)
let tickInterval: number | null = null

watch(lockTimers, () => {
  if (Object.keys(lockTimers.value).length > 0 && !tickInterval) {
    tickInterval = window.setInterval(() => {
      timerTick.value++
    }, 1000)
  } else if (Object.keys(lockTimers.value).length === 0 && tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}, { deep: true })

watch(() => props.initialSelectedIds, (ids) => {
  if (!ids || ids.length === 0) {
    selectedSeatIds.value = []
    emit('change', selectedSeatIds.value)
    return
  }
  // Restore previously selected seats without API calls
  const current = selectedSeatIds.value
  const toAdd = ids.filter(id => !current.includes(id))
  const toRemove = current.filter(id => !ids.includes(id))
  if (toRemove.length > 0) {
    toRemove.forEach(id => {
      if (lockTimers.value[id]) {
        clearTimeout(lockTimers.value[id].interval)
        delete lockTimers.value[id]
      }
    })
  }
  selectedSeatIds.value = ids
  emit('change', selectedSeatIds.value)
}, { immediate: true })

onUnmounted(() => {
  if (tickInterval) clearInterval(tickInterval)
  releaseAll()
})

defineExpose({ selectedSeatIds, releaseAll })
</script>

<template>
  <div>
    <div v-if="error" class="mb-3 p-3 rounded-xl bg-error/10 border border-error/20 text-sm text-error font-medium">
      {{ error }}
    </div>
    <div v-if="isLocking" class="mb-3 p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-primary flex items-center gap-2">
      <span class="material-symbols-outlined text-base animate-spin">progress_activity</span>
      Memproses kursi...
    </div>

    <div class="flex items-center justify-between mb-4">
      <div>
        <p class="text-sm text-text-muted">
          {{ availableSeats.length }} kursi tersedia
        </p>
        <p class="text-xs text-text-muted">
          Dipilih: {{ selectedCount }}/{{ maxSeats }}
        </p>
      </div>
      <div class="flex gap-2">
        <div
          v-for="tier in tiers"
          :key="tier.id"
          class="flex items-center gap-1.5 text-xs font-medium"
        >
          <span
            class="w-3 h-3 rounded"
            :style="{ backgroundColor: tier.color || '#6C63FF' }"
          ></span>
          <span class="text-text-muted">{{ tier.name }}</span>
        </div>
      </div>
    </div>

    <div class="bg-surface-card rounded-xl border border-border/50 p-4">
      <div class="flex justify-center mb-2">
        <div class="w-24 h-3 rounded bg-gray-200 text-center text-[8px] text-gray-500 flex items-center justify-center">
          STAGE
        </div>
      </div>
      <SeatMap
        :seats="seats"
        :gridX="gridX"
        :gridY="gridY"
        :tiers="tiers"
        :selectedSeatIds="selectedSeatIds"
        :filterTierId="activeTierId"
        :pendingSeatIds="pendingSeatIds"
        :otherTierSelectedIds="otherTierSelectedIds"
        @select="toggleSeat"
      />
    </div>

    <div v-if="selectedSeatIds.length > 0" class="mt-3 space-y-1.5">
      <div
        v-for="seatId in selectedSeatIds"
        :key="seatId"
        class="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-variant text-sm"
      >
        <span class="font-semibold text-text">
          {{ seats.find(s => s.id === seatId)?.seat_code }}
        </span>
        <div class="flex items-center gap-2">
          <span class="text-xs text-amber-600 font-medium">
            {{ formatTimer(seatId) }}
          </span>
          <button
            class="text-text-muted hover:text-error cursor-pointer text-xs"
            @click="releaseSeat(seatId)"
          >
            <span class="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
