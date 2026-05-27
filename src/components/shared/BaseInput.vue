<script setup lang="ts">
defineProps<{
  label?: string
  error?: string
  type?: string
  placeholder?: string
  modelValue: string
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" class="text-sm font-medium text-text">{{ label }}</label>
    <input
      :type="type || 'text'"
      :placeholder="placeholder"
      :value="modelValue"
      class="w-full px-4 py-3 text-sm font-body border-2 rounded-xl bg-surface-card outline-none transition-all duration-200 placeholder:text-text-muted"
      :class="error ? 'border-error focus:border-error' : 'border-border focus:border-primary'"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="error" class="text-xs text-error mt-0.5">{{ error }}</p>
  </div>
</template>
