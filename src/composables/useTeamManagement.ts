import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export interface SearchUser {
  id: string
  email: string
  name: string
  avatar_url: string
}

export interface EventAdmin {
  id: string
  event_id: string
  user_id: string
  roles: string[]
  status: string
  accepted_at: string | null
  created_at: string
  user: {
    id: string
    email: string
    name: string
    avatar_url: string
  } | null
  invited_by_user: {
    id: string
    email: string
    name: string
  } | null
}

const searchResults = ref<SearchUser[]>([])
const eventAdmins = ref<EventAdmin[]>([])
const loading = ref(false)
const currentUser = ref<User | null>(null)

supabase.auth.getUser().then(({ data }) => {
  currentUser.value = data?.user || null
})

const ROLES_LABELS: Record<string, string> = {
  attendance: 'Attendance',
  support: 'Support',
  accountant: 'Accountant'
}

const ROLES_ICONS: Record<string, string> = {
  attendance: 'qr_code_scanner',
  support: 'support_agent',
  accountant: 'receipt'
}

const ROLES_COLORS: Record<string, string> = {
  attendance: 'bg-green-100 text-green-700',
  support: 'bg-blue-100 text-blue-700',
  accountant: 'bg-purple-100 text-purple-700'
}

async function buildHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) return extra
  return { ...extra, Authorization: `Bearer ${token}` }
}

export function useTeamManagement() {
  const searchUsers = async (query: string) => {
    if (query.trim().length < 2) {
      searchResults.value = []
      return
    }

    loading.value = true
    try {
      const headers = await buildHeaders({ 'Content-Type': 'application/json' })
      const res = await fetch('/api/invitations/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query })
      })

      if (!res.ok) {
        searchResults.value = []
        return
      }

      const data = await res.json()
      searchResults.value = (data.users || []).filter(
        (u: SearchUser) => u.id !== currentUser.value?.id
      )
    } catch {
      searchResults.value = []
    } finally {
      loading.value = false
    }
  }

  const inviteUser = async (eventId: string, userId: string, roles: string[]) => {
    const headers = await buildHeaders({ 'Content-Type': 'application/json' })
    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers,
      body: JSON.stringify({ event_id: eventId, user_id: userId, roles })
    })

    const data = await res.json()

    if (!res.ok) {
      return { error: data.error, existing_status: data.existing_status }
    }

    return { error: null, invitation: data.invitation }
  }

  const getEventAdmins = async (eventId: string) => {
    loading.value = true
    try {
      const headers = await buildHeaders()
      const res = await fetch(`/api/invitations/event/${eventId}`, { headers })

      if (!res.ok) {
        eventAdmins.value = []
        return { roles: [], activity: [] }
      }

      const data = await res.json()
      eventAdmins.value = data.roles
      return { roles: data.roles as EventAdmin[], activity: data.activity }
    } catch {
      eventAdmins.value = []
      return { roles: [], activity: [] }
    } finally {
      loading.value = false
    }
  }

  const updateAdminRoles = async (id: string, roles: string[]) => {
    const headers = await buildHeaders({ 'Content-Type': 'application/json' })
    const res = await fetch(`/api/invitations/${id}/roles`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ roles })
    })

    const data = await res.json()
    if (!res.ok) return { error: data.error }
    return { error: null }
  }

  const removeAdmin = async (id: string) => {
    const headers = await buildHeaders()
    const res = await fetch(`/api/invitations/${id}`, {
      method: 'DELETE',
      headers
    })

    const data = await res.json()
    if (!res.ok) return { error: data.error }
    return { error: null }
  }

  return {
    searchResults,
    eventAdmins,
    loading,
    searchUsers,
    inviteUser,
    getEventAdmins,
    updateAdminRoles,
    removeAdmin,
    ROLES_LABELS,
    ROLES_ICONS,
    ROLES_COLORS
  }
}
