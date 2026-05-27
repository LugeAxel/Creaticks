<script setup lang="ts">
import { useRouter } from 'vue-router'

defineProps<{
  label?: string
}>()

const router = useRouter()

const goBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}
</script>

<template>
  <button
    class="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text-heading transition-colors cursor-pointer"
    @click="goBack"
  >
    <span class="material-symbols-outlined text-lg">arrow_back</span>
    <span>{{ label || 'Kembali' }}</span>
  </button>
</template>
