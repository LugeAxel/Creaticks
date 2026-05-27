import { ref, inject, provide, type InjectionKey, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'

export interface EventData {
  id: string
  title: string
  date: string
  location: string
  status: string
  banner_url: string
  description: string
  category: string
  visibility: string
  creator_id: string
  ticket_tiers: Array<{ id: string; name: string; price: number; quota: number }>
  ticket_count?: number
  total_revenue?: number
}

export type ResolvedRole = 'creator' | 'admin'

export interface EventContext {
  event: Readonly<EventData>
  resolvedRole: ResolvedRole
  adminRoles: string[]
  loading: boolean
}

export const EVENT_CONTEXT_KEY: InjectionKey<Ref<EventContext | null>> = Symbol('eventContext')

export function useEventContext(): EventContext {
  const ctxRef = inject(EVENT_CONTEXT_KEY)
  if (!ctxRef) {
    throw new Error('useEventContext() must be used inside EventManageLayout')
  }
  const val = ctxRef.value
  if (!val) {
    throw new Error('Event context not loaded yet')
  }
  return val
}

export function useEventContextLoader(eventId: string | string[]) {
  const router = useRouter()
  const event = ref<EventData | null>(null)
  const resolvedRole = ref<ResolvedRole | null>(null)
  const adminRoles = ref<string[]>([])
  const loading = ref(true)

  const context = ref<EventContext | null>(null)

  provide(EVENT_CONTEXT_KEY, context)

  async function load() {
    loading.value = true
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) {
        router.replace('/login')
        return
      }

      const res = await fetch(`/api/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!res.ok) {
        router.replace('/events/saya')
        return
      }

      const data = await res.json()
      const ev = data.event as EventData

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      let resolved: ResolvedRole
      let roles: string[] = []

      if (ev.creator_id === user.id) {
        resolved = 'creator'
      } else if (data.adminRole) {
        resolved = 'admin'
        roles = data.adminRole
      } else {
        router.replace('/events/saya')
        return
      }

      event.value = ev
      resolvedRole.value = resolved
      adminRoles.value = roles
      context.value = {
        event: ev as Readonly<EventData>,
        resolvedRole: resolved,
        adminRoles: roles,
        loading: false
      }
    } catch {
      router.replace('/events/saya')
    } finally {
      loading.value = false
    }
  }

  return { event, resolvedRole, adminRoles, loading, context, load }
}
