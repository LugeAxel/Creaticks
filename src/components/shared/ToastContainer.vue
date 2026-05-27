<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, removeToast } = useToast()

const iconMap: Record<string, string> = {
  success: 'check_circle',
  error: 'error',
  warning: 'warning',
  info: 'info'
}

const colorMap: Record<string, string> = {
  success: 'border-l-success bg-success/5 text-success',
  error: 'border-l-error bg-error/5 text-error',
  warning: 'border-l-warning bg-warning/5 text-warning',
  info: 'border-l-info bg-info/5 text-info'
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border-l-4 shadow-lg bg-surface-card border-border/50 backdrop-blur-sm"
          :class="colorMap[toast.type]"
        >
          <span class="material-symbols-outlined text-xl shrink-0 mt-0.5">{{ iconMap[toast.type] || 'info' }}</span>
          <p class="text-sm font-medium flex-1 min-w-0">{{ toast.message }}</p>
          <button
            class="shrink-0 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
            @click="removeToast(toast.id)"
          >
            <span class="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
