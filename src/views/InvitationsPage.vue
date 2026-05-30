<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useInvitations } from '@/composables/useInvitations'
import { useToast } from '@/composables/useToast'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'

const router = useRouter()
const { showToast } = useToast()
const { invitations, loading, fetchInvitations, acceptInvitation, rejectInvitation } = useInvitations()

const activeTab = ref<'all' | 'pending' | 'accepted' | 'rejected'>('all')
const processingId = ref<string | null>(null)

const filteredInvitations = computed(() => {
  if (activeTab.value === 'all') return invitations.value
  return invitations.value.filter(i => i.status === activeTab.value)
})

const tabCounts = computed(() => ({
  all: invitations.value.length,
  pending: invitations.value.filter(i => i.status === 'pending').length,
  accepted: invitations.value.filter(i => i.status === 'accepted').length,
  rejected: invitations.value.filter(i => i.status === 'rejected').length
}))

const handleAccept = async (id: string) => {
  processingId.value = id
  try {
    const { error } = await acceptInvitation(id)
    if (error) {
      showToast(error, 'error')
    } else {
      showToast('Undangan diterima', 'success')
    }
  } catch {
    showToast('Gagal menerima undangan', 'error')
  } finally {
    processingId.value = null
  }
}

const handleReject = async (id: string) => {
  processingId.value = id
  try {
    const { error } = await rejectInvitation(id)
    if (error) {
      showToast(error, 'error')
    } else {
      showToast('Undangan ditolak', 'success')
    }
  } catch {
    showToast('Gagal menolak undangan', 'error')
  } finally {
    processingId.value = null
  }
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric'
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

const statusColor = (status: string) => {
  const colors: Record<string, string> = {
    pending: 'bg-warning/10 text-warning border-warning/30',
    accepted: 'bg-success/10 text-success border-success/30',
    rejected: 'bg-error/10 text-error border-error/30'
  }
  return colors[status] || ''
}

const goToEvent = (eventId: string) => {
  router.push({ name: 'event-detail', params: { id: eventId } })
}

onMounted(() => {
  fetchInvitations()
})
</script>

<template>
  <AppLayout title="Undangan">
    <div class="max-w-2xl mx-auto px-6 py-8">

      <div class="mb-8">
        <h1 class="text-2xl font-heading font-bold text-on-surface mb-2">Undangan</h1>
        <p class="text-body-sm text-on-surface-variant">
          Kelola undangan peran admin acara
        </p>
      </div>

      <div class="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          v-for="tab in ['all', 'pending', 'accepted', 'rejected'] as const"
          :key="tab"
          class="px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200 whitespace-nowrap cursor-pointer"
          :class="activeTab === tab
            ? 'bg-primary text-on-primary border-primary'
            : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-primary/50'"
          @click="activeTab = tab"
        >
          {{ tab === 'all' ? 'Semua' : tab.charAt(0).toUpperCase() + tab.slice(1) }}
          <span class="ml-1.5 text-xs opacity-70">({{ tabCounts[tab] }})</span>
        </button>
      </div>

      <SkeletonPage v-if="loading" type="admin-list" />

      <div v-else-if="filteredInvitations.length === 0" class="text-center py-16">
        <span class="material-symbols-outlined text-5xl text-outline mb-4">how_to_reg</span>
        <h2 class="text-headline-sm font-heading font-semibold text-on-surface mb-1">
          Tidak ada undangan
        </h2>
        <p class="text-body-sm text-on-surface-variant">
          {{ activeTab === 'pending' ? 'Belum ada undangan masuk' : 'Belum ada riwayat undangan' }}
        </p>
      </div>

      <div v-else class="flex flex-col gap-4">
        <div
          v-for="inv in filteredInvitations"
          :key="inv.id"
          class="bg-surface-container-lowest rounded-xl border border-outline-variant/30 overflow-hidden"
        >
          <div class="p-5">
            <div class="flex items-start justify-between gap-4 mb-3">
              <div class="flex-1 min-w-0">
                <h3 class="text-headline-sm font-heading font-semibold text-on-surface mb-0.5">
                  {{ inv.events?.title || 'Acara' }}
                </h3>
                <p v-if="inv.events?.date" class="text-xs text-on-surface-variant">
                  {{ formatDate(inv.events.date) }}
                </p>
              </div>
              <span
                class="shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full border"
                :class="statusColor(inv.status)"
              >
                {{ inv.status === 'pending' ? 'Menunggu' : inv.status === 'accepted' ? 'Diterima' : 'Ditolak' }}
              </span>
            </div>

            <div class="flex items-center gap-2 text-xs text-on-surface-variant mb-3">
              <span class="material-symbols-outlined text-[16px]">person</span>
              <span>Diundang oleh {{ inv.invited_by_user?.email || 'Unknown' }}</span>
            </div>

            <div class="flex flex-wrap gap-2">
              <div
                v-for="role in inv.roles"
                :key="role"
                class="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-surface-variant text-on-surface-variant"
              >
                <span class="material-symbols-outlined text-[14px]">{{ roleIcon(role) }}</span>
                {{ roleLabel(role) }}
              </div>
            </div>
          </div>

          <div v-if="inv.status === 'pending'" class="flex gap-3 px-5 pb-5">
            <BaseButton
              variant="primary"
              size="sm"
              :loading="processingId === inv.id"
              @click="handleAccept(inv.id)"
            >
              Terima
            </BaseButton>
            <BaseButton
              variant="outline"
              size="sm"
              :disabled="processingId === inv.id"
              @click="handleReject(inv.id)"
            >
              Tolak
            </BaseButton>
          </div>

          <div v-if="inv.status === 'accepted'" class="px-5 pb-5">
            <button
              class="text-sm font-semibold text-primary hover:underline flex items-center gap-1"
              @click="goToEvent(inv.event_id)"
            >
              <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
              Masuk ke Acara
            </button>
          </div>
        </div>
      </div>

    </div>
  </AppLayout>
</template>
