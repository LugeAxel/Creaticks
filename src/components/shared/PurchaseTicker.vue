<script setup lang="ts">
import { computed } from 'vue'
import { usePurchaseTicker } from '@/composables/usePurchaseTicker'
import { censorName } from '@/lib/censor'

const props = withDefaults(defineProps<{
  stickyOffset?: number
}>(), {
  stickyOffset: 64,
})

const { purchases } = usePurchaseTicker()

const doubled = computed(() => [...purchases.value, ...purchases.value])
</script>

<template>
  <div v-if="purchases.length" class="ticker-wrap">
    <div class="ticker-track">
      <span v-for="(p, i) in doubled" :key="i" class="ticker-item">
        |<span class="ticker-icon material-symbols-outlined">confirmation_number</span>
      {{ censorName(p.buyer_name) }} membeli {{ p.tier_name }} di {{ p.event_title }} |
      </span>
    </div>
  </div>
</template>

<style scoped>
.ticker-wrap {
  position: sticky;
  top: v-bind(stickyOffset + 'px');
  z-index: 30;
  overflow: hidden;
  height: 28px;
  background: linear-gradient(135deg, rgba(107, 99, 255, 0.719), rgba(255, 101, 132, 0.686), rgba(67, 198, 172, 0.697), rgba(255, 178, 71, 0.774));
  background-size: 300% 300%;
  animation: hue-shift 8s ease-in-out infinite alternate;
  color: white;
  font-size: 12px;
  font-weight: 900;
  line-height: 28px;
  white-space: nowrap;
}

.ticker-track {
  display: inline-flex;
  gap: 0;
  animation: marquee 40s linear infinite;
}

.ticker-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 24px;
  flex-shrink: 0;
}

.ticker-icon {
  font-size: 16px;
  color: white;
}

@keyframes marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

@keyframes hue-shift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}
</style>
