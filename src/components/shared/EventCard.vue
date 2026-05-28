<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

interface EventItem {
  id: string
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
}

const props = defineProps<{
  event: EventItem
}>()

const emit = defineEmits<{
  click: []
}>()

const getDay = (dateStr: string) => new Date(dateStr).getDate()

const getMonth = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('id-ID', { month: 'short' }).toUpperCase()

const formatDateShort = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const formatFormat = (fmt: string) => {
  const map: Record<string, string> = { offline: 'Offline', online: 'Online', hybrid: 'Hybrid' }
  return map[fmt] || fmt
}

const handleClick = () => {
  emit('click')
  router.push({ name: 'event-detail', params: { id: props.event.id } })
}
</script>

<template>
  <div class="relative cursor-pointer group" @click="handleClick">
    <div class="absolute inset-0 translate-x-1.5 translate-y-1.5 bg-primary/15 rounded-2xl" />
    <div class="relative bg-surface-card rounded-2xl border border-border/50 overflow-hidden transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1">
      <div class="aspect-[16/9] bg-surface-variant overflow-hidden relative">
        <img v-if="event.banner_url" :src="event.banner_url" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
        <div v-else class="w-full h-full flex items-center justify-center">
          <span class="material-symbols-outlined text-4xl text-text-muted">image</span>
        </div>

        <div class="absolute top-0 left-0 w-6 h-6 bg-primary z-10" style="clip-path: polygon(0 0, 100% 0, 0 100%)" />

        <div class="absolute inset-0 bg-gradient-to-t from-primary/60 via-primary/10 to-transparent z-[1]" />

        <div class="absolute top-2 right-2 bg-surface-card/90 backdrop-blur-sm rounded-lg px-1.5 py-0.5 text-center shadow-sm z-10">
          <span class="block text-[10px] font-bold text-primary leading-tight">{{ getDay(event.date) }}</span>
          <span class="block text-[8px] text-text-muted leading-tight tracking-wider">{{ getMonth(event.date) }}</span>
        </div>

        <div class="absolute bottom-2 left-2 z-10">
          <span class="text-[10px] font-semibold bg-surface-card/90 backdrop-blur-sm px-2 py-0.5 rounded-full text-secondary shadow-sm">
            {{ formatFormat(event.event_format) }}
          </span>
        </div>
      </div>

      <div class="p-3">
        <span class="inline-block text-[10px] font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded-full mb-1.5 truncate max-w-full">
          {{ event.category || 'Umum' }}
        </span>
        <h3 class="font-heading font-bold text-text-heading text-sm line-clamp-2">{{ event.title }}</h3>
        <p v-if="event.description" class="text-[10px] text-text-muted line-clamp-2 leading-relaxed mt-1">{{ event.description }}</p>
      </div>

      <div class="flex items-center gap-2 px-5 py-3 bg-primary/5 border-t border-border/30 text-xs text-text-muted overflow-hidden">
        <span class="flex items-center gap-1 min-w-0 overflow-hidden">
          <span class="material-symbols-outlined text-[10px] shrink-0">calendar_today</span>
          <span class="truncate">{{ formatDateShort(event.date) }}</span>
        </span>
        <span v-if="event.location" class="flex items-center gap-1 min-w-0 overflow-hidden">
          <span class="material-symbols-outlined text-[10px] shrink-0">location_on</span>
          <span class="truncate">{{ event.location }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
