import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'
import type { AuthError } from '@supabase/supabase-js'

export interface Invitation {
  id: string
  event_id: string
  user_id: string
  roles: string[]
  status: 'pending' | 'accepted' | 'rejected'
  invited_by: string
  accepted_at: string | null
  created_at: string
  events: {
    title: string
    date: string
    status: string
    banner_url: string
    creator_id: string
  } | null
  invited_by_user: {
    id: string
    email: string
  } | null
}

export interface ActivityEntry {
  id: string
  event_role_id: string
  action: string
  performed_by: string
  metadata: Record<string, unknown>
  created_at: string
  performed_by_user?: {
    id: string
    email: string
    name?: string
  } | null
}

const pendingCount = ref(0)
const invitations = ref<Invitation[]>([])
const loading = ref(false)
let lastFetch = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function useInvitations() {
  const { user } = useAuth()

  const fetchInvitations = async () => {
    if (!user.value) return

    const now = Date.now()
    if (now - lastFetch < 3000) return
    lastFetch = now

    loading.value = true
    const token = (await supabase.auth.getSession()).data.session?.access_token

    try {
      const res = await fetch(`/api/invitations`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to fetch invitations')

      const data = await res.json()
      invitations.value = data.invitations
      pendingCount.value = data.invitations.filter(
        (i: Invitation) => i.status === 'pending'
      ).length
    } catch (err) {
      console.error('[useInvitations]', err)
    } finally {
      loading.value = false
    }
  }

  const acceptInvitation = async (id: string) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/invitations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'accepted' })
    })

    if (!res.ok) {
      const err = await res.json()
      return { error: err.error }
    }

    await fetchInvitations()
    return { error: null }
  }

  const rejectInvitation = async (id: string) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/invitations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'rejected' })
    })

    if (!res.ok) {
      const err = await res.json()
      return { error: err.error }
    }

    await fetchInvitations()
    return { error: null }
  }

  const getActivityForEvent = async (eventId: string) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`/api/invitations/event/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!res.ok) return { activity: [] as ActivityEntry[] }
    const data = await res.json()
    return { activity: data.activity as ActivityEntry[] }
  }

  onMounted(() => {
    fetchInvitations()

    supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_IN') return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => fetchInvitations(), 2000)
    })
  })

  return {
    pendingCount,
    invitations,
    loading,
    fetchInvitations,
    acceptInvitation,
    rejectInvitation,
    getActivityForEvent
  }
}
