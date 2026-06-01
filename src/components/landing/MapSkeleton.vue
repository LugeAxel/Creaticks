<template>
  <div class="space-y-3 p-4">
    <!-- Header skeleton -->
    <div class="flex items-center justify-between">
      <div class="space-y-2">
        <div class="h-4 w-32 animate-pulse rounded-full bg-border"></div>
        <div class="h-3 w-24 animate-pulse rounded-full bg-border"></div>
      </div>
      <div class="h-6 w-20 animate-pulse rounded-full bg-border"></div>
    </div>

    <!-- Map area skeleton -->
    <div class="h-[300px] md:h-[420px] w-full animate-pulse rounded-3xl bg-gradient-to-br from-border to-border/50 overflow-hidden">
      <!-- Shimmer effect with animated markers -->
      <div class="absolute inset-0 overflow-hidden">
        <!-- Animated shimmer -->
        <div
          class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
          style="animation: shimmer 2s infinite"
        ></div>

        <!-- Skeleton markers -->
        <div v-for="(_, i) in 8" :key="i" class="absolute animate-pulse">
          <div
            :style="{
              left: `${Math.random() * 80 + 10}%`,
              top: `${Math.random() * 80 + 10}%`
            }"
            class="h-3 w-3 rounded-full bg-primary/30 shadow-lg"
          ></div>
        </div>
      </div>
    </div>

    <!-- Bottom tags skeleton -->
    <div class="flex items-center gap-2">
      <div class="h-6 w-28 animate-pulse rounded-full bg-border"></div>
      <div class="h-6 w-20 animate-pulse rounded-full bg-border"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Skeleton component - no logic needed
// Animation handled via Tailwind CSS
</script>

<style scoped>
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
</style>
