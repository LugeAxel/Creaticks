<script setup lang="ts">
withDefaults(defineProps<{
  shape?: 'rect' | 'circle' | 'text'
  width?: string
  height?: string
  size?: string
  rounded?: string
  lines?: number
  lastLineWidth?: string
}>(), {
  shape: 'rect',
  width: '100%',
  height: '20px',
  rounded: 'md',
  lines: 1,
  lastLineWidth: '100%'
})
</script>

<template>
  <div v-if="shape === 'text'" class="space-y-2.5">
    <div
      v-for="i in lines"
      :key="i"
      class="boneyard-shimmer"
      :style="{
        width: i === lines ? lastLineWidth : '100%',
        height: '14px',
        borderRadius: '6px'
      }"
    />
  </div>
  <div
    v-else
    class="boneyard-shimmer"
    :style="{
      width: size || width,
      height: size || height,
      borderRadius: shape === 'circle' ? '9999px' : undefined,
    }"
    :class="`rounded-${rounded}`"
  />
</template>

<style scoped>
.boneyard-shimmer {
  background: linear-gradient(
    90deg,
    var(--color-surface-variant) 25%,
    var(--color-surface-card) 50%,
    var(--color-surface-variant) 75%
  );
  background-size: 200% 100%;
  animation: boneyard-shimmer 1.5s ease-in-out infinite;
}

@keyframes boneyard-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
