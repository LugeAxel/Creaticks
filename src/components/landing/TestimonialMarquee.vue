<script setup lang="ts">
export interface Testimonial {
  name: string
  handle: string
  quote: string
  initials: string
}

defineProps<{
  quotes: Testimonial[]
  reverse?: boolean
}>()
</script>

<template>
  <div class="marquee-container group overflow-hidden">
    <div
      class="marquee-track flex gap-4 md:gap-6 w-max"
      :class="reverse ? 'marquee-right' : 'marquee-left'"
    >
      <div
        v-for="(q, i) in [...quotes, ...quotes]"
        :key="i"
        class="testimonial-card shrink-0 w-[280px] md:w-[320px] rounded-2xl border border-border glass-card p-5 transition duration-200"
      >
        <div class="flex items-center gap-3 mb-3">
          <div
            class="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-xs"
          >{{ q.initials }}</div>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-text-heading truncate">{{ q.name }}</p>
            <p class="text-xs text-text-muted truncate">{{ q.handle }}</p>
          </div>
        </div>
        <p class="text-sm text-text leading-relaxed line-clamp-4">{{ q.quote }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes marquee-left {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

@keyframes marquee-right {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(0); }
}

.marquee-track {
  will-change: transform;
}

.marquee-left {
  animation: marquee-left 50s linear infinite;
}

.marquee-right {
  animation: marquee-right 50s linear infinite;
}

.marquee-container:hover .marquee-left,
.marquee-container:hover .marquee-right {
  animation-play-state: paused;
}

.testimonial-card {
  user-select: none;
}

.glass-card {
  position: relative;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
}

.glass-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.08) 0%,
    transparent 40%,
    rgba(108, 99, 255, 0.04) 70%,
    transparent 100%
  );
  pointer-events: none;
}
</style>
