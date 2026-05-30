<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/composables/useToast'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

interface InvitationData {
  id: string
  event_id: string
  user_id: string
  roles: string[]
  status: string
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

const invitation = ref<InvitationData | null>(null)
const loading = ref(true)
const error = ref('')
const actionLoading = ref(false)

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

const roleLabel = (role: string) => {
  const labels: Record<string, string> = {
    attendance: 'Attendance',
    support: 'Support',
    accountant: 'Accountant'
  }
  return labels[role] || role
}

const roleIcon = (role: string) => {
  const icons: Record<string, string> = {
    attendance: 'qr_code_scanner',
    support: 'support_agent',
    accountant: 'receipt'
  }
  return icons[role] || 'badge'
}

const handleAccept = async () => {
  if (!invitation.value) return
  actionLoading.value = true
  const token = (await supabase.auth.getSession()).data.session?.access_token
  try {
    const res = await fetch(`/api/invitations/${invitation.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'accepted' })
    })
    if (!res.ok) {
      const data = await res.json()
      showToast(data.error || 'Gagal menerima undangan', 'error')
      return
    }
    showToast('Undangan diterima! Selamat bergabung sebagai admin.', 'success')
    setTimeout(() => router.push({ name: 'invitations' }), 1500)
  } catch {
    showToast('Gagal menerima undangan', 'error')
  } finally {
    actionLoading.value = false
  }
}

const handleReject = async () => {
  if (!invitation.value) return
  actionLoading.value = true
  const token = (await supabase.auth.getSession()).data.session?.access_token
  try {
    const res = await fetch(`/api/invitations/${invitation.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'rejected' })
    })
    if (!res.ok) {
      const data = await res.json()
      showToast(data.error || 'Gagal menolak undangan', 'error')
      return
    }
    showToast('Undangan ditolak', 'success')
    setTimeout(() => router.push({ name: 'invitations' }), 1500)
  } catch {
    showToast('Gagal menolak undangan', 'error')
  } finally {
    actionLoading.value = false
  }
}

onMounted(async () => {
  const id = route.params.id as string
  const token = (await supabase.auth.getSession()).data.session?.access_token

  if (!token) {
    error.value = 'Silakan login terlebih dahulu'
    loading.value = false
    return
  }

  try {
    const res = await fetch(`/api/invitations/${id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (res.status === 404) {
      error.value = 'Undangan tidak ditemukan'
      return
    }

    if (res.status === 403) {
      error.value = 'Akses ditolak. Undangan ini bukan milik Anda.'
      return
    }

    if (!res.ok) {
      error.value = 'Gagal memuat undangan'
      return
    }

    const data = await res.json()
    invitation.value = data.invitation
  } catch {
    error.value = 'Gagal memuat undangan'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <AppLayout title="Tanggapi Undangan">
    <div class="max-w-lg mx-auto px-6 py-8">

      <SkeletonPage v-if="loading" type="invitation" />

      <div v-else-if="error" class="text-center py-20">
        <span class="material-symbols-outlined text-5xl text-text-muted mb-4">error_outline</span>
        <p class="text-lg font-semibold text-text-heading mb-2">Oops!</p>
        <p class="text-sm text-text-muted">{{ error }}</p>
        <BaseButton variant="primary" class="mt-6" @click="router.push({ name: 'invitations' })">
          Kembali ke Undangan
        </BaseButton>
      </div>

      <div v-else-if="invitation" class="bg-surface-card rounded-2xl border border-border/50 overflow-hidden">
        <div class="aspect-[2/1] bg-surface-variant overflow-hidden">
          <img
            v-if="invitation.events?.banner_url"
            :src="invitation.events.banner_url"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <span class="material-symbols-outlined text-5xl text-text-muted">event</span>
          </div>
        </div>

        <div class="p-6">
          <div class="flex items-center gap-2 text-xs text-text-muted mb-1">
            <span class="material-symbols-outlined text-[14px]">person</span>
            <span>Diundang oleh {{ invitation.invited_by_user?.email || 'Unknown' }}</span>
          </div>

          <h1 class="text-xl font-heading font-bold text-text-heading mb-1">
            {{ invitation.events?.title || 'Acara' }}
          </h1>

          <p v-if="invitation.events?.date" class="text-sm text-text-muted flex items-center gap-1.5 mb-4">
            <span class="material-symbols-outlined text-[16px]">calendar_today</span>
            {{ formatDate(invitation.events.date) }}
          </p>

          <div class="flex flex-wrap gap-2 mb-6">
            <div
              v-for="role in invitation.roles"
              :key="role"
              class="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary/5 text-primary"
            >
              <span class="material-symbols-outlined text-[14px]">{{ roleIcon(role) }}</span>
              {{ roleLabel(role) }}
            </div>
          </div>

          <div
            v-if="invitation.status === 'accepted'"
            class="text-center py-6"
          >
            <span class="material-symbols-outlined text-5xl text-success mb-3">check_circle</span>
            <p class="text-lg font-semibold text-text-heading">Undangan Diterima</p>
            <p class="text-sm text-text-muted mt-1">Kamu sudah bergabung sebagai admin acara ini.</p>
            <BaseButton variant="primary" class="mt-4" @click="router.push({ name: 'event-detail', params: { id: invitation.event_id } })">
              Lihat Acara
            </BaseButton>
          </div>

          <div
            v-else-if="invitation.status === 'rejected'"
            class="text-center py-6"
          >
            <span class="material-symbols-outlined text-5xl text-text-muted mb-3">cancel</span>
            <p class="text-lg font-semibold text-text-heading">Undangan Ditolak</p>
            <p class="text-sm text-text-muted mt-1">Kamu telah menolak undangan ini.</p>
          </div>

          <div v-else class="flex flex-col gap-3">
            <p class="text-sm text-text-muted text-center mb-2">
              Kamu diundang menjadi admin untuk acara ini. Setujui untuk mulai mengelola acara.
            </p>
            <BaseButton
              variant="primary"
              fullWidth
              :loading="actionLoading"
              @click="handleAccept"
            >
              Terima Undangan
            </BaseButton>
            <BaseButton
              variant="outline"
              fullWidth
              :disabled="actionLoading"
              @click="handleReject"
            >
              Tolak
            </BaseButton>
          </div>
        </div>
      </div>

    </div>
  </AppLayout>
</template>
