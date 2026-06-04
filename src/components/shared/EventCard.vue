<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const origin = window.location.origin

interface TicketTier {
  id: string
  name: string
  price: number
  quota: number
  sold_count: number
  description?: string
  color?: string
  seat_tier?: string | null
}

interface EventItem {
  id: string
  slug: string
  title: string
  description: string
  banner_url: string
  date: string
  location: string
  category: string
  event_format: string
  creator_id: string
  max_tickets: number
  status: string
  created_at: string
  visibility?: string
  gallery_urls?: string[]
  ticket_tiers: TicketTier[]
}

const props = defineProps<{
  event: EventItem
  userRole?: string
}>()

const emit = defineEmits<{
  click: []
}>()

const carouselImages = computed(() => {
  if (props.event.gallery_urls?.length) return props.event.gallery_urls
  return props.event.banner_url ? [props.event.banner_url] : []
})

const carouselIndex = ref(0)
let carouselTimer: ReturnType<typeof setInterval> | null = null

function startCarousel() {
  if (carouselImages.value.length <= 1) return
  carouselTimer = setInterval(() => {
    carouselIndex.value = (carouselIndex.value + 1) % carouselImages.value.length
  }, 2000)
}

function stopCarousel() {
  if (carouselTimer) {
    clearInterval(carouselTimer)
    carouselTimer = null
  }
  carouselIndex.value = 0
}

const shareCopied = ref(false)
let shareTimer: ReturnType<typeof setTimeout> | null = null

function handleShare(e: MouseEvent) {
  e.stopPropagation()
  navigator.clipboard.writeText(`${origin}/events/${props.event.slug}`)
  shareCopied.value = true
  if (shareTimer) clearTimeout(shareTimer)
  shareTimer = setTimeout(() => { shareCopied.value = false }, 2000)
}

const CATEGORY_COLORS: Record<string, string> = {
  Musik: '#FF6584',
  Workshop: '#6C63FF',
  Seni: '#43C6AC',
  Komunitas: '#FFB347',
}
const COLOR_PALETTE = ['#6C63FF', '#FF6584', '#43C6AC', '#FFB347']

const panelColor = computed(() => {
  const cat = props.event.category || 'Lainnya'
  return CATEGORY_COLORS[cat] || COLOR_PALETTE[hashCode(cat) % COLOR_PALETTE.length]
})

const totalSold = computed(() =>
  props.event.ticket_tiers?.reduce((s, t) => s + (t.sold_count || 0), 0) ?? 0
)
const totalQuota = computed(() =>
  props.event.ticket_tiers?.reduce((s, t) => s + (t.quota || 0), 0) ?? 0
)
const soldPct = computed(() =>
  totalQuota.value > 0 ? totalSold.value / totalQuota.value : 0
)

const isAllSoldOut = computed(() => {
  const tiers = props.event.ticket_tiers || []
  return tiers.length > 0 && tiers.every((t: any) => (t.sold_count || 0) >= (t.quota || 0) && t.quota > 0)
})

const activeBadge = computed<{ label: string; classes: string; pulse?: boolean } | null>(() => {
  if (!props.event.ticket_tiers?.length) return null

  const isFree = props.event.ticket_tiers.every(t => t.price === 0)
  const isNew = Date.now() - new Date(props.event.created_at).getTime() < 48 * 60 * 60 * 1000
  const soldOver90 = totalQuota.value > 0 && soldPct.value >= 0.9
  const soldOver70 = totalQuota.value > 0 && soldPct.value >= 0.7

  if (isAllSoldOut.value) return {
    label: 'HABIS',
    classes: 'bg-gradient-to-r from-[#FF3B3B] to-[#E74C3C]'
  }
  if (soldOver90) return {
    label: 'HOT',
    classes: 'bg-gradient-to-r from-[#FF6584] to-[#FF4757]',
    pulse: true
  }
  if (isNew) return {
    label: 'BARU',
    classes: 'bg-gradient-to-r from-[#43C6AC] to-[#2ECC71]'
  }
  if (props.event.visibility === 'private') return {
    label: 'PRIBADI',
    classes: 'bg-black/55 backdrop-blur-sm border border-white/20'
  }
  if (isFree) return {
    label: 'GRATIS',
    classes: 'bg-gradient-to-r from-[#6C63FF] to-[#9B59B6]'
  }
  return null
})

const actionLabel = computed(() => props.userRole ? 'Kelola' : 'Detail')

const countdown = ref('')
let countdownTimer: ReturnType<typeof setInterval> | null = null

function startCountdown() {
  const target = new Date(props.event.date).getTime()
  updateCountdown(target)
  countdownTimer = setInterval(() => updateCountdown(target), 1000)
}

function updateCountdown(target: number) {
  const diff = target - Date.now()
  if (diff <= 0) {
    countdown.value = 'Sedang berlangsung'
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
    return
  }
  const totalSec = Math.floor(diff / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (days > 0) {
    countdown.value = `Mulai: ${days} hari`
  } else if (hours > 0) {
    countdown.value = `Mulai: ${hours}:${pad(mins)}:${pad(secs)}`
  } else {
    countdown.value = `Mulai: ${mins}:${pad(secs)}`
  }
}

onMounted(() => startCountdown())
onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
  if (carouselTimer) clearInterval(carouselTimer)
})

function hashCode(s: string) {
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

const handleClick = () => {
  emit('click')
  if (props.userRole) {
    router.push(`/events/${props.event.id}/manage`)
  } else {
    router.push({ name: 'event-detail', params: { id: props.event.slug } })
  }
}
</script>

<template>
  <div
    role="article"
    :aria-label="event.title"
    class="group cursor-pointer select-none"
    @click="handleClick"
  >
    <div
      class="overflow-hidden transition-all duration-[250ms] group-hover:scale-[1.02] group-hover:shadow-[0_4px_8px_rgba(0,0,0,0.55)]"
      :style="{
        borderRadius: '20px',
        // boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        backgroundColor: panelColor,
        transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        '--panel-color': panelColor,
      }"
    >
      <!-- Image zone (55%) -->
      <div
        class="relative w-full bg-surface-variant overflow-hidden"
        :style="{
          clipPath: 'polygon(0 0, 100% 0, 100% 85%, 0 100%)',
          aspectRatio: '4 / 3'
        }"
        @mouseenter="startCarousel"
        @mouseleave="stopCarousel"
      >
        <!-- Carousel images with crossfade -->
        <div
          v-for="(url, i) in carouselImages"
          :key="url"
          class="absolute inset-0 transition-opacity duration-500"
          :class="i === carouselIndex ? 'opacity-100' : 'opacity-0'"
        >
          <img
            :src="url"
            :alt="event.title"
            class="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <div
          v-if="!carouselImages.length"
          class="w-full h-full flex items-center justify-center"
        >
          <span class="material-symbols-outlined text-5xl text-text-muted">image</span>
        </div>

        <!-- Share button -->
        <div class="absolute top-3 left-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            type="button"
            class="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors cursor-pointer"
            :aria-label="shareCopied ? 'Tersalin' : 'Bagikan acara'"
            @click.stop="handleShare"
          >
            <span class="material-symbols-outlined text-sm">{{ shareCopied ? 'check' : 'share' }}</span>
          </button>
          <div
            v-if="shareCopied"
            class="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 rounded bg-black/70 text-white text-[9px] font-medium whitespace-nowrap"
          >
            Tersalin!
          </div>
        </div>

        <!-- Availability bar -->
        <div
          v-if="totalQuota > 0"
          class="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-10"
        >
          <div
            class="h-full bg-white transition-all"
            :style="{ width: `${Math.min(soldPct * 100, 100)}%` }"
          />
        </div>

        <!-- Badge -->
        <div
          v-if="activeBadge"
          class="absolute top-3 right-3 z-20 px-3 py-1 rounded-full font-mono text-[10px] font-bold tracking-wider text-white shadow-lg"
          :class="[activeBadge.classes, activeBadge.pulse ? 'badge-pulse' : '']"
          :aria-label="activeBadge.label"
        >
          {{ activeBadge.label }}
        </div>
      </div>

      <!-- Info panel (45%) -->
      <div
        class="relative"
        :style="{
          clipPath: 'polygon(0 5%, 100% 0, 100% 100%, 0 100%)',
          marginTop: '-1px'
        }"
      >
        <!-- Overlapping placeholder avatar at seam -->


        <!-- Role badge (for MyEvents) -->
        <div
          v-if="userRole"
          class="z-10 ml-4"
          :style="{
            top: '8px',
            left: '16px',
          }"
        >
          <span
            class="inline-block font-mono text-[9px] font-bold tracking-widest px-2.5 py-0.5 rounded-full text-white shadow-lg"
            :style="{
              backgroundColor: userRole === 'creator' ? '#6C63FF' : '#43C6AC'
            }"
          >
            {{ userRole === 'creator' ? 'CREATOR' : 'ADMIN' }}
          </span>
        </div>

        <!-- Panel content -->
        <div class="pt-2 pl-4 pr-4 pb-4 max-sm:pt-1 max-sm:pl-2 max-sm:pr-2 max-sm:pb-2 min-h-[120px] max-sm:min-h-[100px] flex flex-col justify-center">
          <h3
            class="font-heading font-bold text-white line-clamp-1 min-sm:text-[14px] max-sm:text-[10px] mb-[6px]"
          >
            {{ event.title }}
          </h3>

          <div class="text-white/70 leading-relaxed min-sm:text-[10px] max-sm:text-[8px]">
            <div class="flex items-center gap-1 mb-0.5">
              <span class="material-symbols-outlined min-sm:!text-[24px] max-sm:!text-[16px]">calendar_today</span>
              <span class="truncate min-sm:text-[12px] max-sm:text-[9px]">{{ formatDateShort(event.date) }}</span>
            </div>
            <div v-if="event.location" class="flex items-center gap-1 mb-0.5">
              <span class="material-symbols-outlined min-sm:!text-[24px] max-sm:!text-[16px]">location_on</span>
              <span class="truncate min-sm:text-[12px] max-sm:text-[8px]" >{{ event.location }}</span>
            </div>
          </div>

          <!-- Action row -->
          <div class="flex items-center justify-between max-sm:mt-1.5 pr-1 pl-1 ">
            <span class="text-white/65 text-[11px] min-sm:text-[11px] max-sm:text-[8px] font-mono leading-tight">{{ countdown }}</span>
            <button
              type="button"
              class="btn-card-action rounded-lg px-3.5 py-1.5 max-sm:px-2 max-sm:py-1 text-xs max-sm:text-[10px] font-semibold border text-white transition-all duration-200"
              :aria-label="`${actionLabel} tentang ${event.title}`"
              @click.stop="handleClick"
            >
              {{ actionLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn-card-action {
  color: white;
  border-color: white;
  background: transparent;
}
.btn-card-action:hover {
  color: var(--panel-color);
  background: white;
}

.badge-pulse {
  animation: pulse-glow 1.5s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
</style>