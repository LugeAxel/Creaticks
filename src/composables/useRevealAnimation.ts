import { ref, onMounted, onUnmounted } from 'vue'

export type RevealType = 'fade-up' | 'fade-left' | 'fade-right' | 'scale-in'

export function useRevealAnimation(type: RevealType = 'fade-up', threshold = 0.1) {
  const elementRef = ref<HTMLElement | null>(null)
  const isVisible = ref(false)
  let observer: IntersectionObserver | null = null

  const getInitialClass = () => {
    switch (type) {
      case 'fade-up':
        return 'opacity-0 translate-y-8'
      case 'fade-left':
        return 'opacity-0 -translate-x-8'
      case 'fade-right':
        return 'opacity-0 translate-x-8'
      case 'scale-in':
        return 'opacity-0 scale-95'
      default:
        return 'opacity-0'
    }
  }

  const getVisibleClass = () => 'opacity-100 translate-x-0 translate-y-0 scale-100'

  onMounted(() => {
    const element = elementRef.value
    if (!element) return

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            isVisible.value = true
            if (observer) {
              observer.unobserve(element)
            }
          }
        })
      },
      { threshold }
    )

    observer.observe(element)
  })

  onUnmounted(() => {
    if (observer) {
      observer.disconnect()
    }
  })

  return {
    elementRef,
    isVisible,
    initialClass: getInitialClass(),
    visibleClass: getVisibleClass(),
    transitionClass: 'transition duration-700 ease-out'
  }
}
