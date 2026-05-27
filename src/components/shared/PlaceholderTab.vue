<script setup lang="ts">
defineProps<{
  title: string
  icon?: string
}>()
</script>

<template>
  <div class="p-4 md:p-6 max-w-screen-lg mx-auto text-center py-20">
    <span class="material-symbols-outlined text-5xl text-text-muted mb-4">{{ icon || 'construction' }}</span>
    <h2 class="text-lg font-heading font-bold text-text-heading mb-2">{{ title }}</h2>
    <p class="text-sm text-text-muted">Segera Hadir</p>
  </div>
</template>
