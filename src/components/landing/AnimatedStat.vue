<template>
  <div class="rounded-3xl border border-border bg-surface-card px-4 py-5 text-center" :class="[initialClass, isVisible ? visibleClass : '', transitionClass]" ref="elementRef">
    <p class="text-2xl font-semibold text-text-heading">{{ displayValue }}</p>
    <p class="text-xs uppercase tracking-[0.2em] text-text-muted mt-2">{{ label }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRevealAnimation } from '@/composables/useRevealAnimation'

interface Props {
  value: number | string
  label: string
  format?: 'number' | 'text'
  animateDuration?: number
}

const props = withDefaults(defineProps<Props>(), {
  format: 'text',
  animateDuration: 1000
})

const displayValue = ref(props.format === 'text' ? props.value : 0)
const { elementRef, isVisible, initialClass, visibleClass, transitionClass } = useRevealAnimation('scale-in')

const animateCounter = () => {
  if (props.format !== 'number' || typeof props.value !== 'number') {
    displayValue.value = props.value
    return
  }

  const target = props.value as number
  const duration = props.animateDuration
  const steps = 60
  const stepDuration = duration / steps
  let current = 0

  const timer = setInterval(() => {
    current++
    const progress = current / steps
    displayValue.value = Math.floor(target * progress)

    if (current >= steps) {
      displayValue.value = target
      clearInterval(timer)
    }
  }, stepDuration)
}

watch(isVisible, (newVal) => {
  if (newVal) {
    animateCounter()
  }
})

onMounted(() => {
  if (isVisible.value) {
    animateCounter()
  }
})
</script>
