import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

export interface MyEvent {
  id: string
  title: string
  date: string
  location: string
  status: string
  banner_url: string
  description: string
  category: string
  visibility: string
  event_format: string
  max_tickets: number
  ticket_tiers: Array<{ id: string; name: string; price: number; quota: number; sold_count: number; description?: string; color?: string; seat_tier?: string | null }>
  userRole: 'creator' | 'admin'
  adminRoles?: string[]
  creator_id: string
  created_at: string
}

const myEvents = ref<MyEvent[]>([])
const loading = ref(false)
let fetched = false
let fetchPromise: Promise<void> | null = null

export function useAdminEvents() {
  const adminEvents = computed(() => myEvents.value.filter(e => e.userRole === 'admin'))
  const isAdmin = computed(() => adminEvents.value.length > 0)
  const hasEvents = computed(() => myEvents.value.length > 0)

  const fetchMyEvents = async () => {
    if (fetched) return
    if (fetchPromise) return fetchPromise

    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) {
      myEvents.value = []
      fetched = true
      return
    }

    loading.value = true
    fetchPromise = (async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` }
        const [creatorRes, adminRes] = await Promise.all([
          fetch('/api/events', { headers }),
          fetch('/api/events/admin', { headers })
        ])

        const creatorEvents: MyEvent[] = creatorRes.ok
          ? ((await creatorRes.json()).events || []).map((e: any) => ({ ...e, userRole: 'creator' as const }))
          : []

        const adminEventsList: MyEvent[] = adminRes.ok
          ? ((await adminRes.json()).events || []).map((e: any) => ({ ...e, userRole: 'admin' as const }))
          : []

        const seen = new Set<string>()
        myEvents.value = [...creatorEvents, ...adminEventsList].filter(e => {
          if (seen.has(e.id)) return false
          seen.add(e.id)
          return true
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      } catch (e) {
        console.warn('Failed to fetch events:', e)
        myEvents.value = []
      } finally {
        loading.value = false
        fetched = true
        fetchPromise = null
      }
    })()

    return fetchPromise
  }

  const fetchAdminEvents = fetchMyEvents

  const hasAdminRoleForEvent = (eventId: string) => {
    return myEvents.value.some(e => e.id === eventId && e.userRole === 'admin')
  }

  const getUserRoleForEvent = (eventId: string) => {
    const event = myEvents.value.find(e => e.id === eventId)
    return event?.userRole || null
  }

  const resetMyEvents = () => {
    fetched = false
    myEvents.value = []
  }

  return {
    myEvents,
    adminEvents,
    loading,
    isAdmin,
    hasEvents,
    fetchMyEvents,
    fetchAdminEvents,
    hasAdminRoleForEvent,
    getUserRoleForEvent,
    resetMyEvents
  }
}
