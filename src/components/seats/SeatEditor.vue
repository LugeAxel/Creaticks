<script setup lang="ts">
import { ref, computed, watch } from 'vue'

export interface EditorSeat {
  x: number
  y: number
  tier: string | null
  seatCode: string
}

const props = withDefaults(defineProps<{
  modelValue: {
    gridX: number
    gridY: number
    seats: EditorSeat[]
  }
  tiers: Array<{ name: string; price: number; color: string }>
}>(), {})

const emit = defineEmits<{
  'update:modelValue': [value: typeof props.modelValue]
}>()

const gridX = ref(props.modelValue.gridX || 25)
const gridY = ref(props.modelValue.gridY || 20)
const selectedTool = ref<'paint' | 'erase'>('paint')
const selectedTierName = ref<string>(props.tiers[0]?.name || '')
const isDragging = ref(false)

const tierColorMap = computed(() => {
  const map: Record<string, string> = {}
  const palette = ['#6C63FF', '#FF6584', '#43C6AC', '#FFB347', '#9B59B6', '#3498DB', '#E74C3C', '#2ECC71']
  props.tiers.forEach((t, i) => {
    map[t.name] = t.color || palette[i % palette.length]
  })
  return map
})

const seatMap = ref<Record<string, EditorSeat>>({})

function initSeatMap() {
  seatMap.value = {}
  if (!props.modelValue.seats) return
  for (const s of props.modelValue.seats) {
    const key = `${s.x},${s.y}`
    seatMap.value[key] = { ...s }
  }
}
initSeatMap()

watch(() => props.modelValue.seats, () => {
  initSeatMap()
}, { deep: true })

const seatKeys = computed(() => Object.keys(seatMap.value))

const totalSeats = computed(() => seatKeys.value.length)

const seatsByTier = computed(() => {
  const counts: Record<string, number> = {}
  for (const s of Object.values(seatMap.value)) {
    if (s.tier) {
      counts[s.tier] = (counts[s.tier] || 0) + 1
    }
  }
  return counts
})

function getSeatAt(x: number, y: number): EditorSeat | null {
  return seatMap.value[`${x},${y}`] || null
}

function applyTool(x: number, y: number) {
  const key = `${x},${y}`

  if (selectedTool.value === 'erase') {
    delete seatMap.value[key]
    emitUpdate()
    return
  }

  if (!selectedTierName.value) return

  const existing = seatMap.value[key]
  const colChar = String.fromCharCode(65 + y)
  const seatCode = `${colChar}${x + 1}`

  if (existing) {
    existing.tier = selectedTierName.value
  } else {
    seatMap.value[key] = { x, y, tier: selectedTierName.value, seatCode }
  }

  emitUpdate()
}

function onCellMouseDown(x: number, y: number) {
  isDragging.value = true
  applyTool(x, y)
}

function onCellMouseEnter(x: number, y: number) {
  if (isDragging.value) {
    applyTool(x, y)
  }
}

function onMouseUp() {
  isDragging.value = false
}

function emitUpdate() {
  const seats = Object.values(seatMap.value)
  emit('update:modelValue', {
    gridX: gridX.value,
    gridY: gridY.value,
    seats
  })
}

function clearAll() {
  seatMap.value = {}
  emitUpdate()
}

function applyGridSize() {
  const newSeats: Record<string, EditorSeat> = {}
  for (const [key, seat] of Object.entries(seatMap.value)) {
    if (seat.x < gridX.value && seat.y < gridY.value) {
      newSeats[key] = seat
    }
  }
  seatMap.value = newSeats
  emitUpdate()
}

function getCellStyle(seat: { tier: string | null }): Record<string, string> {
  if (!seat.tier) return {}
  const color = tierColorMap.value[seat.tier] || '#6C63FF'
  return {
    backgroundColor: color + '25',
    borderColor: color,
    color: color
  }
}

defineExpose({ totalSeats, seatsByTier })
</script>

<template>
  <div>
    <div class="grid grid-cols-2 gap-3 mb-4">
      <div>
        <label class="text-xs font-semibold text-text mb-1 block">Grid X (kolom)</label>
        <input
          v-model.number="gridX"
          type="number"
          min="5"
          max="50"
          class="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm"
          @change="applyGridSize"
        />
      </div>
      <div>
        <label class="text-xs font-semibold text-text mb-1 block">Grid Y (baris)</label>
        <input
          v-model.number="gridY"
          type="number"
          min="5"
          max="30"
          class="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm"
          @change="applyGridSize"
        />
      </div>
    </div>

    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <div class="flex items-center gap-1.5 bg-surface-card rounded-xl p-1 border border-border/50">
        <button
          class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer"
          :class="selectedTool === 'paint' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'"
          @click="selectedTool = 'paint'"
        >
          <span class="material-symbols-outlined text-[14px] align-text-bottom">brush</span>
          Paint
        </button>
        <button
          class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer"
          :class="selectedTool === 'erase' ? 'bg-error text-white' : 'text-text-muted hover:text-text'"
          @click="selectedTool = 'erase'"
        >
          <span class="material-symbols-outlined text-[14px] align-text-bottom">ink_eraser</span>
          Erase
        </button>
      </div>

      <div v-if="selectedTool === 'paint'" class="flex items-center gap-1.5 flex-wrap">
        <button
          v-for="tier in tiers"
          :key="tier.name"
          class="px-3 py-1.5 text-xs font-semibold rounded-lg border-2 transition-all cursor-pointer"
          :style="{
            borderColor: selectedTierName === tier.name ? (tier.color || '#6C63FF') : 'transparent',
            backgroundColor: (tier.color || '#6C63FF') + '20',
            color: tier.color || '#6C63FF'
          }"
          @click="selectedTierName = tier.name"
        >
          {{ tier.name }}
        </button>
      </div>

      <div class="ml-auto text-xs text-text-muted">
        {{ totalSeats }} kursi total
      </div>
    </div>

    <div
      class="overflow-x-auto bg-surface-card rounded-xl border border-border/50 p-4 select-none"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
    >
      <div class="flex justify-center mb-3">
        <div class="w-24 h-3 rounded bg-gray-200 text-center text-[8px] text-gray-500 flex items-center justify-center">
          PANGGUNG / STAGE
        </div>
      </div>

      <div
        class="mx-auto"
        :style="{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridX}, 32px)`,
          gap: '3px',
          width: 'fit-content'
        }"
      >
        <template v-for="y in gridY" :key="y">
          <template v-for="x in gridX" :key="`${x}-${y}`">
            <div
              :style="getSeatAt(x - 1, y - 1) ? getCellStyle(getSeatAt(x - 1, y - 1)!) : {}"
              class="w-8 h-8 rounded text-[7px] font-bold flex items-center justify-center border border-dashed border-gray-200 cursor-crosshair transition-colors"
              :class="getSeatAt(x - 1, y - 1) ? 'border-solid hover:brightness-110' : 'hover:bg-gray-100'"
              @mousedown="onCellMouseDown(x - 1, y - 1)"
              @mouseenter="onCellMouseEnter(x - 1, y - 1)"
            >
              <template v-if="getSeatAt(x - 1, y - 1)">
                {{ getSeatAt(x - 1, y - 1)!.seatCode }}
              </template>
            </div>
          </template>
        </template>
      </div>
    </div>

    <div class="mt-3 flex items-center justify-between">
      <div class="flex flex-wrap gap-3 text-xs text-text-muted">
        <span v-for="(count, tier) in seatsByTier" :key="tier">
          {{ tier }}: {{ count }} kursi
        </span>
      </div>
      <button
        class="text-xs text-error hover:text-error/80 font-semibold cursor-pointer"
        @click="clearAll"
      >
        Hapus semua
      </button>
    </div>
  </div>
</template>

<style scoped></style>
