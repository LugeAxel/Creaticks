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

type SeatStatus = SeatData['status']

interface StatusStyle {
  bgAlpha: string
  icon: string
  borderColor?: string
  cursor: string
  stripe?: boolean
  grayscale?: boolean
  selected?: boolean
}

const STATUS_STYLES: Record<SeatStatus, StatusStyle> = {
  available: { bgAlpha: '20', icon: '', cursor: 'pointer', selected: true },
  reserved: { bgAlpha: '08', icon: 'lock', cursor: 'not-allowed', stripe: true },
  owned: { bgAlpha: '04', icon: 'block', cursor: 'not-allowed', stripe: true, grayscale: true },
  checked_in: { bgAlpha: '06', icon: 'verified', borderColor: '#22c55e', cursor: 'not-allowed', stripe: true }
}

const props = withDefaults(defineProps<{
  seats: SeatData[]
  gridX: number
  gridY: number
  tiers: TierInfo[]
  selectedSeatIds?: string[]
  readonly?: boolean
  cellSize?: number
  filterTierId?: string
  pendingSeatIds?: string[]
  otherTierSelectedIds?: string[]
}>(), {
  selectedSeatIds: () => [],
  readonly: false,
  cellSize: 40,
  filterTierId: undefined,
  pendingSeatIds: () => [],
  otherTierSelectedIds: () => []
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

const isOtherTier = (seat: SeatData) =>
  props.filterTierId && seat.tier_id !== props.filterTierId

const seatClass = (seat: SeatData) => {
  const cfg = STATUS_STYLES[seat.status]
  const cls = [cfg.cursor]
  if (cfg.stripe) cls.push('seat-stripe')
  if (seat.status === 'owned') cls.push('seat-owned')
  if (cfg.grayscale) cls.push('seat-grayscale')
  if (seat.status === 'available' && props.selectedSeatIds?.includes(seat.id)) {
    cls.push('ring-2 ring-primary bg-primary text-white')
  } else if (seat.status === 'available' && !isOtherTier(seat)) {
    cls.push('hover:brightness-110 transition-all')
  }
  if (seat.status === 'available' && isOtherTier(seat)) {
    cls.push('cursor-not-allowed opacity-40 seat-grayscale pointer-events-none')
  }
  if (props.otherTierSelectedIds?.includes(seat.id)) {
    cls.push('opacity-40 seat-grayscale pointer-events-none cursor-not-allowed ring-2 ring-primary/30 bg-primary/10')
  }
  if (props.pendingSeatIds?.includes(seat.id)) {
    cls.push('animate-pulse cursor-wait opacity-60 pointer-events-none')
  }
  return cls
}

const seatStyle = (seat: SeatData) => {
  const color = tierColorMap.value[seat.tier_id || ''] || '#6C63FF'
  const cfg = STATUS_STYLES[seat.status]

  if (seat.status === 'available' && props.selectedSeatIds?.includes(seat.id)) {
    return {}
  }

  const style: Record<string, string> = {
    backgroundColor: color + cfg.bgAlpha,
    borderColor: cfg.borderColor || color
  }
  if (seat.status === 'owned') {
    style.color = '#6b7280'
  }
  if (seat.status === 'checked_in') {
    style.color = '#16a34a'
  }
  if (seat.status !== 'available') {
    style.color = style.color || (cfg.borderColor || color)
  }
  return style
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
  if (isOtherTier(seat)) return
  if (props.pendingSeatIds?.includes(seat.id)) return
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
          ...seatClass(seat)
        ]"
        :title="seat.status === 'available' && isOtherTier(seat) ? 'Kursi ini milik tiket lain' : `${seat.seat_code} - ${seat.status}`"
        @click="handleClick(seat)"
      >
        <span class="font-bold" :class="seat.status === 'available' ? 'text-[9px]' : 'text-[7px]'">{{ seat.seat_code }}</span>
        <span :class="{'mt-[-1px]': true}" class="material-symbols-outlined text-[11px]">{{ STATUS_STYLES[seat.status].icon || '' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.seat-stripe {
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 2.5px,
    rgba(0,0,0,0.07) 2.5px,
    rgba(0,0,0,0.07) 5px
  );
}

.seat-owned.seat-stripe {
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 3px,
    rgba(0,0,0,0.1) 3px,
    rgba(0,0,0,0.1) 6px
  );
}

.seat-grayscale {
  filter: grayscale(0.5) contrast(0.8);
}
</style>
