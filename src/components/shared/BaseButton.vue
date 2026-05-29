<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'accent' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  fullWidth?: boolean
}>()

defineEmits<{
  click: [e: MouseEvent]
}>()
</script>

<template>
  <button
    :type="type || 'button'"
    :disabled="disabled || loading"
    class="inline-flex items-center justify-center gap-2 font-body font-semibold transition-all duration-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.97]"
    :class="[
      fullWidth ? 'w-full' : '',
      size === 'sm' ? 'px-4 py-2 text-sm' : size === 'lg' ? 'px-8 py-3.5 text-base' : 'px-6 py-3 text-sm',
      variant === 'secondary' ? 'bg-secondary text-white hover:bg-secondary-light' :
      variant === 'accent' ? 'bg-accent text-white hover:bg-accent-light active:bg-accent-dark' :
      variant === 'outline' ? 'border-2 border-primary text-primary bg-transparent hover:bg-primary hover:text-white' :
      variant === 'ghost' ? 'text-primary bg-transparent hover:bg-primary/10' :
      'bg-primary text-white hover:bg-primary-light active:bg-primary-dark'
    ]"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    <slot />
  </button>
</template>
