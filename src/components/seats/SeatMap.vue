<script setup lang="ts">
import { computed } from 'vue'

export interface SeatData {
  id: string
  seat_code: string
  tier_id: string | null
  x: number
  y: number
  status: 'available' | 'reserved' | 'owned' | 'checked_in'
  reserved_until?: string | null
}

export interface TierInfo {
  id: string
  name: string
  price: number
  color: string
}

const props = withDefaults(defineProps<{
  seats: SeatData[]
  gridX: number
  gridY: number
  tiers: TierInfo[]
  selectedSeatIds?: string[]
  readonly?: boolean
  cellSize?: number
}>(), {
  selectedSeatIds: () => [],
  readonly: false,
  cellSize: 40
})

const emit = defineEmits<{
  select: [seatId: string]
}>()

const tierColorMap = computed(() => {
  const map: Record<string, string> = {}
  const palette = ['#6C63FF', '#FF6584', '#43C6AC', '#FFB347', '#9B59B6', '#3498DB', '#E74C3C', '#2ECC71']
  props.tiers.forEach((t, i) => {
    map[t.id] = t.color || palette[i % palette.length]
  })
  return map
})

const seatStatusClass = (seat: SeatData) => {
  if (seat.status === 'available') {
    if (props.selectedSeatIds?.includes(seat.id)) {
      return 'ring-2 ring-primary bg-primary text-white'
    }
    return 'cursor-pointer hover:brightness-110 transition-all'
  }
  if (seat.status === 'reserved') return 'cursor-not-allowed seat-reserved'
  if (seat.status === 'owned') return 'cursor-not-allowed seat-owned'
  if (seat.status === 'checked_in') return 'cursor-not-allowed seat-checked-in'
  return 'cursor-not-allowed'
}

const seatStyle = (seat: SeatData) => {
  const color = tierColorMap.value[seat.tier_id || ''] || '#6C63FF'
  if (seat.status === 'available') {
    return { backgroundColor: color + '20', borderColor: color, color }
  }
  if (seat.status === 'reserved') {
    return { backgroundColor: color + '12', borderColor: color }
  }
  if (seat.status === 'owned') {
    return { backgroundColor: color + '08', borderColor: '#9ca3af', color: '#6b7280' }
  }
  if (seat.status === 'checked_in') {
    return { backgroundColor: color + '08', borderColor: '#22c55e', color: '#16a34a' }
  }
  return {}
}

const rows = computed(() => {
  const r: SeatData[][] = []
  for (let y = 0; y < props.gridY; y++) {
    const row = props.seats.filter(s => s.y === y).sort((a, b) => a.x - b.x)
    r.push(row)
  }
  return r
})

const handleClick = (seat: SeatData) => {
  if (props.readonly) return
  if (seat.status !== 'available') return
  emit('select', seat.id)
}

const stageCells = computed(() => {
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < props.gridY; y++) {
    for (let x = 0; x < props.gridX; x++) {
      if (!props.seats.some(s => s.x === x && s.y === y)) {
        cells.push({ x, y })
      }
    }
  }
  return cells
})
</script>

<template>
  <div class="overflow-x-auto py-4">
    <div
      class="mx-auto"
      :style="{
        display: 'grid',
        gridTemplateColumns: `repeat(${gridX}, ${cellSize}px)`,
        gap: '4px',
        width: 'fit-content'
      }"
    >
      <div
        v-for="cell in stageCells"
        :key="`empty-${cell.x}-${cell.y}`"
        :style="{ width: cellSize + 'px', height: cellSize + 'px' }"
        class="rounded"
      ></div>

      <div
        v-for="seat in seats"
        :key="seat.id"
        :style="{
          ...seatStyle(seat),
          width: cellSize + 'px',
          height: cellSize + 'px',
          gridRow: (seat.y + 1).toString(),
          gridColumn: (seat.x + 1).toString()
        }"
        :class="[
          'rounded-lg border transition-all select-none flex flex-col items-center justify-center leading-tight overflow-hidden',
          seatStatusClass(seat)
        ]"
        :title="`${seat.seat_code} - ${seat.status}`"
        @click="handleClick(seat)"
      >
        <span class="font-bold" :class="seat.status === 'available' ? 'text-[9px]' : 'text-[7px]'">{{ seat.seat_code }}</span>
        <span v-if="seat.status === 'reserved'" class="material-symbols-outlined text-[11px]">lock</span>
        <span v-else-if="seat.status === 'owned'" class="material-symbols-outlined text-[11px]">check_circle</span>
        <span v-else-if="seat.status === 'checked_in'" class="material-symbols-outlined text-[11px]">verified</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.seat-reserved {
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 2.5px,
    rgba(0,0,0,0.07) 2.5px,
    rgba(0,0,0,0.07) 5px
  );
}

.seat-owned {
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 3px,
    rgba(0,0,0,0.04) 3px,
    rgba(0,0,0,0.04) 6px
  );
}

.seat-checked-in {
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 3px,
    rgba(34,197,94,0.08) 3px,
    rgba(34,197,94,0.08) 6px
  );
}
</style>
