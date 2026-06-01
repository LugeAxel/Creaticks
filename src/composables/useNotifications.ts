import { ref, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

export interface NotificationItem {
  id: string
  user_id: string
  type: 'invite' | 'ticket_request' | 'ticket_confirmed' | 'ticket_cancelled'
  title: string
  body: string | null
  reference_id: string | null
  reference_type: string | null
  is_read: boolean
  created_at: string
}

const notifications = ref<NotificationItem[]>([])
const unreadCount = ref(0)
const loading = ref(false)

let notifChannel: ReturnType<typeof supabase.channel> | null = null
let rolesChannel: ReturnType<typeof supabase.channel> | null = null

export function useNotifications() {
  const { user } = useAuth()

  const fetchNotifications = async () => {
    if (!user.value) return
    loading.value = true
    const token = (await supabase.auth.getSession()).data.session?.access_token

    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to fetch notifications')
      const data = await res.json()
      notifications.value = data.notifications || []
      unreadCount.value = data.unread_count || 0
    } catch (err) {
      console.error('[useNotifications]', err)
    } finally {
      loading.value = false
    }
  }

  const markAsRead = async (id: string) => {
    if (id.startsWith('invite_')) {
      const idx = notifications.value.findIndex(n => n.id === id)
      if (idx !== -1) {
        notifications.value[idx] = { ...notifications.value[idx], is_read: true }
        unreadCount.value = Math.max(0, unreadCount.value - 1)
      }
      return
    }

    const token = (await supabase.auth.getSession()).data.session?.access_token
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const idx = notifications.value.findIndex(n => n.id === id)
        if (idx !== -1) {
          notifications.value[idx] = { ...notifications.value[idx], is_read: true }
          unreadCount.value = Math.max(0, unreadCount.value - 1)
        }
      }
    } catch (err) {
      console.error('[useNotifications] markAsRead error', err)
    }
  }

  const subscribeToRealtime = () => {
    if (!user.value) return
    const userId = user.value.id

    notifChannel = supabase
      .channel('notifications_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload: any) => {
          const newNotif = payload.new as NotificationItem
          if (newNotif) {
            notifications.value = [newNotif, ...notifications.value]
            if (!newNotif.is_read) {
              unreadCount.value++
            }
          }
        }
      )
      .subscribe()

    rolesChannel = supabase
      .channel('event_roles_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_roles',
          filter: `user_id=eq.${userId}`
        },
        (payload: any) => {
          const newRole = payload.new as Record<string, unknown>
          if (newRole && newRole.status === 'pending') {
            const inviteNotif: NotificationItem = {
              id: `invite_${newRole.id}`,
              user_id: userId,
              type: 'invite',
              title: 'Undangan Admin Baru',
              body: 'Anda mendapat undangan admin baru',
              reference_id: newRole.event_id as string,
              reference_type: 'event',
              is_read: false,
              created_at: newRole.created_at as string
            }
            notifications.value = [inviteNotif, ...notifications.value]
            unreadCount.value++
          }
        }
      )
      .subscribe()
  }

  const unsubscribeFromRealtime = () => {
    if (notifChannel) {
      supabase.removeChannel(notifChannel)
      notifChannel = null
    }
    if (rolesChannel) {
      supabase.removeChannel(rolesChannel)
      rolesChannel = null
    }
  }

  let pollInterval: ReturnType<typeof setInterval> | null = null

  onMounted(async () => {
    await fetchNotifications()
    subscribeToRealtime()
    // Fallback polling every 30s in case WebSocket fails
    pollInterval = setInterval(fetchNotifications, 60000)
  })

  onUnmounted(() => {
    unsubscribeFromRealtime()
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  })

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markAsRead
  }
}
