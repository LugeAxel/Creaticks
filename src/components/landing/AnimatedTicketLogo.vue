<script setup lang="ts">
defineProps<{
  size?: 'sm' | 'md'
}>()
</script>

<template>
  <div
    class="ticket-logo inline-flex select-none"
    :class="size === 'md' ? 'w-14 h-14' : 'w-8 h-8'"
    role="img"
    aria-label="Creaticks logo"
  >
    <svg
      viewBox="0 0 40 32"
      xmlns="http://www.w3.org/2000/svg"
      class="ticket-svg w-full h-full"
    >
      <defs>
        <mask id="ticket-notch">
          <rect width="40" height="32" rx="4" fill="white" />
          <circle cx="0" cy="8" r="5" fill="black" />
          <circle cx="0" cy="24" r="5" fill="black" />
          <circle cx="40" cy="8" r="5" fill="black" />
          <circle cx="40" cy="24" r="5" fill="black" />
        </mask>
        <linearGradient id="shimmer-grad" x1="-1" y1="0" x2="2" y2="0">
          <stop offset="0%" stop-color="white" stop-opacity="0" />
          <stop offset="35%" stop-color="white" stop-opacity="0" />
          <stop offset="50%" stop-color="white" stop-opacity="0.35" />
          <stop offset="65%" stop-color="white" stop-opacity="0" />
          <stop offset="100%" stop-color="white" stop-opacity="0" />
        </linearGradient>
        <filter id="logo-shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#6C63FF" flood-opacity="0.25" />
        </filter>
      </defs>
      <rect
        width="40" height="32" rx="4"
        fill="var(--lp-primary, #6C63FF)"
        mask="url(#ticket-notch)"
        filter="url(#logo-shadow)"
        class="ticket-body"
      />
      <rect
        width="40" height="32" rx="4"
        fill="url(#shimmer-grad)"
        mask="url(#ticket-notch)"
        class="shimmer-rect"
      />
      <text
        x="20" y="21"
        text-anchor="middle"
        fill="white"
        font-family="Inter, sans-serif"
        font-weight="700"
        font-size="13"
        class="ticket-text"
      >CT</text>
    </svg>
  </div>
</template>

<style scoped>
@keyframes ticket-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

@keyframes shimmer-sweep {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(200%); }
}

.ticket-logo {
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.ticket-logo:hover {
  transform: rotate(-5deg) scale(1.08);
}

.ticket-svg {
  animation: ticket-float 3s ease-in-out infinite;
}

.shimmer-rect {
  animation: shimmer-sweep 5s ease-in-out infinite;
  pointer-events: none;
}
</style>
