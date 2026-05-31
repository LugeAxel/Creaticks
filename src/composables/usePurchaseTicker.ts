import { ref, onMounted, onUnmounted } from 'vue'
import { onEvent, offEvent } from '@/lib/socket'
import { fetchWithoutAuth } from '@/lib/api'

export interface Purchase {
  buyer_name: string
  tier_name: string
  event_title: string
  created_at: string
}

const purchases = ref<Purchase[]>([])
const MAX = 20

export function usePurchaseTicker() {
  async function fetchLatest() {
    try {
      const res = await fetchWithoutAuth('/api/tickets/latest')
      if (res.ok) {
        purchases.value = await res.json()
      }
    } catch {
      // silent
    }
  }

  function handleNew(p: Purchase) {
    purchases.value.unshift(p)
    if (purchases.value.length > MAX) {
      purchases.value.pop()
    }
  }

  onMounted(() => {
    fetchLatest()
    onEvent('purchase:new', handleNew)
  })

  onUnmounted(() => {
    offEvent('purchase:new', handleNew)
  })

  return { purchases }
}
