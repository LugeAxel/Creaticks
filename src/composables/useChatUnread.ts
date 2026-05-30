import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

const chatUnread = ref(0)
let channel: ReturnType<typeof supabase.channel> | null = null
let userId: string | null = null

export function useChatUnread() {
  async function fetchUnread() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      chatUnread.value = 0
      return
    }
    userId = session.user.id
    try {
      const res = await fetch('/api/chat/me', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      if (res.ok) {
        const data = await res.json()
        chatUnread.value = (data.threads || []).reduce(
          (sum: number, t: any) => sum + (t.unread_count || 0), 0
        )
      }
    } catch {
      // silent
    }
  }

  function initRealtime() {
    if (channel) return
    channel = supabase
      .channel('chat_unread')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload: any) => {
          const senderId = payload.new?.sender_id
          if (senderId && senderId !== userId) {
            chatUnread.value++
          }
        }
      )
      .subscribe()
  }

  function cleanupRealtime() {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
  }

  return { chatUnread, fetchUnread, initRealtime, cleanupRealtime }
}
