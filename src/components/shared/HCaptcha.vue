<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  sitekey: string
}>()

const emit = defineEmits<{
  verify: [token: string]
  expired: []
}>()

const container = ref<HTMLDivElement>()
let widgetId: string | null = null

function onLoad() {
  if (!container.value || !window.hcaptcha) return
  widgetId = window.hcaptcha.render(container.value, {
    sitekey: props.sitekey,
    callback: (token: string) => emit('verify', token),
    'expired-callback': () => emit('expired')
  })
}

function reset() {
  if (widgetId && window.hcaptcha) {
    window.hcaptcha.reset(widgetId)
  }
}

function getResponse(): string | null {
  if (widgetId && window.hcaptcha) {
    return window.hcaptcha.getResponse(widgetId)
  }
  return null
}

onMounted(() => {
  if (window.hcaptcha) {
    onLoad()
  } else {
    window.hcaptchaOnLoad = onLoad
    const script = document.createElement('script')
    script.src = 'https://hcaptcha.com/1/api.js?onload=hcaptchaOnLoad&render=explicit'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
  }
})

onUnmounted(() => {
  if (widgetId && window.hcaptcha) {
    try {
      window.hcaptcha.reset(widgetId)
    } catch (e) {
      console.warn('hCaptcha reset failed (widget may already be cleaned up):', e)
    }
  }
})

defineExpose({ reset, getResponse })
</script>

<template>
  <div ref="container" />
</template>
