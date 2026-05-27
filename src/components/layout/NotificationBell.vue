<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useNotifications } from '@/composables/useNotifications'

const router = useRouter()
const { notifications, unreadCount, markAsRead } = useNotifications()

const open = ref(false)

const previewNotifications = computed(() =>
  notifications.value.filter(n => !n.is_read).slice(0, 5)
)

const toggle = () => {
  open.value = !open.value
}

const close = () => {
  open.value = false
}

const handleClick = (item: { id: string; type: string; reference_id: string | null; reference_type: string | null }) => {
  markAsRead(item.id)
  open.value = false
  if (item.type === 'invite') {
    const realId = item.id.replace('invite_', '')
    router.push({ name: 'invitation-response', params: { id: realId } })
  } else if (item.type === 'ticket_request' || item.type === 'ticket_confirmed' || item.type === 'ticket_cancelled') {
    router.push({ name: 'tickets-list' })
  }
}

const notificationIcon = (type: string) => {
  const icons: Record<string, string> = {
    invite: 'person_add',
    ticket_request: 'confirmation_number',
    ticket_confirmed: 'check_circle',
    ticket_cancelled: 'cancel'
  }
  return icons[type] || 'notifications'
}

const notificationColor = (type: string) => {
  const colors: Record<string, string> = {
    invite: 'text-primary bg-primary-fixed',
    ticket_request: 'text-warning bg-warning/10',
    ticket_confirmed: 'text-success bg-success/10',
    ticket_cancelled: 'text-error bg-error/10'
  }
  return colors[type] || 'text-primary bg-primary-fixed'
}

const notificationPreview = (body: string | null) => {
  if (!body) return ''
  return body.length > 60 ? body.slice(0, 60) + '...' : body
}
</script>

<template>
  <div class="relative">
    <button
      class="relative w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high rounded-full transition-all duration-200 active:scale-95"
      @click="toggle"
      aria-label="Notifikasi"
    >
      <span class="material-symbols-outlined">notifications</span>
      <span
        v-if="unreadCount > 0"
        class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-error text-on-error text-[10px] font-bold rounded-full px-1"
      >
        {{ unreadCount > 9 ? '9+' : unreadCount }}
      </span>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="fixed inset-0 z-40"
        @click="close"
      ></div>

      <div
        v-if="open"
        class="fixed right-4 top-[60px] w-80 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 z-50 overflow-hidden"
      >
        <div class="p-4 border-b border-outline-variant/20">
          <h3 class="text-headline-sm font-heading font-semibold text-on-surface">Notifikasi</h3>
        </div>

        <div v-if="previewNotifications.length === 0" class="p-6 text-center">
          <span class="material-symbols-outlined text-3xl text-outline mb-2">notifications_off</span>
          <p class="text-sm text-on-surface-variant">Tidak ada notifikasi baru</p>
        </div>

        <div v-else class="max-h-80 overflow-y-auto">
          <div
            v-for="item in previewNotifications"
            :key="item.id"
            class="flex items-start gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors cursor-pointer border-b border-outline-variant/10 last:border-0"
            @click.stop="handleClick(item)"
          >
            <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0" :class="notificationColor(item.type)">
              <span class="material-symbols-outlined text-lg">{{ notificationIcon(item.type) }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-on-surface truncate">
                {{ item.title }}
              </p>
              <p class="text-xs text-on-surface-variant truncate mt-0.5">
                {{ notificationPreview(item.body) }}
              </p>
            </div>
          </div>
        </div>

        <div class="p-3 border-t border-outline-variant/20 text-center flex gap-2 justify-center">
          <button
            class="text-sm font-semibold text-primary hover:underline"
            @click.stop="close(); router.push({ name: 'invitations' })"
          >
            Undangan
          </button>
          <span class="text-outline">|</span>
          <button
            class="text-sm font-semibold text-primary hover:underline"
            @click.stop="close(); router.push({ name: 'tickets-list' })"
          >
            Tiket
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
