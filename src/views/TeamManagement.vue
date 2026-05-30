<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { useTeamManagement } from '@/composables/useTeamManagement'
import SkeletonPage from '@/components/shared/SkeletonPage.vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'

const { getAuthHeaders } = useAuth()
const {
  searchResults, searchUsers, inviteUser,
  getEventAdmins, updateAdminRoles, removeAdmin,
  ROLES_LABELS, ROLES_ICONS, ROLES_COLORS
} = useTeamManagement()

interface Event {
  id: string
  title: string
  date: string
  status: string
}

interface RoleEntry {
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

interface ActivityEntry {
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

const events = ref<Event[]>([])
const selectedEventId = ref('')
const roles = ref<RoleEntry[]>([])
const activity = ref<ActivityEntry[]>([])
const loading = ref(false)

const showInviteModal = ref(false)
const inviteSearch = ref('')
const selectedUserId = ref('')
const selectedUserDisplay = ref('')
const selectedRoles = ref<string[]>([])
const inviteLoading = ref(false)
const inviteError = ref('')

const expandedAdminId = ref<string | null>(null)

const filteredActivity = computed(() => {
  if (!expandedAdminId.value) return activity.value
  return activity.value.filter(a => a.event_role_id === expandedAdminId.value)
})

const activityActionLabel = (action: string) => {
  const labels: Record<string, string> = {
    invited: 'diundang',
    accepted: 'menerima undangan',
    rejected: 'menolak undangan',
    removed: 'dihapus',
    roles_updated: 'role diperbarui'
  }
  return labels[action] || action
}

const activityIcon = (action: string) => {
  const icons: Record<string, string> = {
    invited: 'person_add',
    accepted: 'check_circle',
    rejected: 'cancel',
    removed: 'remove_circle',
    roles_updated: 'edit'
  }
  return icons[action] || 'history'
}

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

watch(inviteSearch, (val) => {
  if (val.trim().length >= 2) {
    searchUsers(val)
  }
})

const toggleRole = (role: string) => {
  if (selectedRoles.value.includes(role)) {
    selectedRoles.value = selectedRoles.value.filter(r => r !== role)
  } else {
    selectedRoles.value.push(role)
  }
}

const openInviteModal = () => {
  showInviteModal.value = true
  inviteSearch.value = ''
  selectedUserId.value = ''
  selectedUserDisplay.value = ''
  selectedRoles.value = []
  inviteError.value = ''
}

const selectUser = (id: string, name: string, email: string) => {
  selectedUserId.value = id
  selectedUserDisplay.value = `${name} (${email})`
  inviteSearch.value = `${name} (${email})`
}

const handleInvite = async () => {
  if (!selectedEventId.value || !selectedUserId.value || selectedRoles.value.length === 0) {
    inviteError.value = 'Pilih acara, user, dan minimal satu role'
    return
  }

  inviteLoading.value = true
  inviteError.value = ''

  const result = await inviteUser(selectedEventId.value, selectedUserId.value, selectedRoles.value)

  if (result.error) {
    inviteError.value = result.error
    inviteLoading.value = false
    return
  }

  showInviteModal.value = false
  inviteLoading.value = false
  await loadEventData()
}

const loadEvents = async () => {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch('/api/events', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    events.value = data.events || []
    if (events.value.length > 0 && !selectedEventId.value) {
      selectedEventId.value = events.value[0].id
    }
  } catch {
    events.value = []
  }
}

const loadEventData = async () => {
  if (!selectedEventId.value) return
  loading.value = true
  const result = await getEventAdmins(selectedEventId.value)
  roles.value = result.roles as RoleEntry[]
  activity.value = result.activity as ActivityEntry[]
  loading.value = false
}

const removeDialogId = ref<string | null>(null)
const removeDialogLoading = ref(false)

const handleRemoveAdmin = async (id: string) => {
  removeDialogId.value = id
}

const confirmRemove = async () => {
  if (!removeDialogId.value) return
  removeDialogLoading.value = true
  await removeAdmin(removeDialogId.value)
  removeDialogLoading.value = false
  removeDialogId.value = null
  await loadEventData()
}

const cancelRemove = () => {
  removeDialogId.value = null
}

const handleUpdateRoles = async (id: string, newRoles: string[]) => {
  await updateAdminRoles(id, newRoles)
  await loadEventData()
}

const toggleExpand = (id: string) => {
  expandedAdminId.value = expandedAdminId.value === id ? null : id
}

onMounted(async () => {
  await loadEvents()
  if (events.value.length > 0) {
    selectedEventId.value = events.value[0].id
    await loadEventData()
  }
})

watch(selectedEventId, () => {
  loadEventData()
})
</script>

<template>
  <AppLayout title="Kelola Tim">
    <div class="max-w-5xl mx-auto px-6 py-8">

      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 class="text-2xl font-heading font-bold text-text-heading">Kelola Tim</h1>
          <p class="text-sm text-text-muted mt-1">Atur akses dan peran admin di acara Anda.</p>
        </div>
        <div class="flex items-center gap-3">
          <select
            v-if="events.length > 1"
            v-model="selectedEventId"
            class="text-sm bg-surface-card border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option v-for="ev in events" :key="ev.id" :value="ev.id">
              {{ ev.title }}
            </option>
          </select>
          <button
            class="bg-primary text-on-primary rounded-full px-5 py-2.5 flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all text-sm font-semibold cursor-pointer shadow-sm"
            @click="openInviteModal"
          >
            <span class="material-symbols-outlined text-[18px]">add</span>
            <span>Undang Admin</span>
          </button>
        </div>
      </div>

      <SkeletonPage v-if="loading" type="admin-list" />

      <div v-else-if="roles.length === 0" class="text-center py-16 text-text-muted">
        <span class="material-symbols-outlined text-5xl mb-4">group_off</span>
        <p class="text-lg font-semibold text-text-heading">Belum ada admin</p>
        <p class="text-sm mt-1">Undang admin pertama untuk membantu mengelola acara.</p>
      </div>

      <div v-else class="flex flex-col gap-4">
        <div
          v-for="role in roles"
          :key="role.id"
          class="bg-surface-card rounded-xl border border-border/50 overflow-hidden transition-shadow hover:shadow-sm"
        >
          <div class="p-5">
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-center gap-4 min-w-0">
                <div class="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-text-muted shrink-0 overflow-hidden">
                  <img v-if="role.user?.avatar_url" :src="role.user.avatar_url" class="w-full h-full object-cover" />
                  <span v-else class="material-symbols-outlined text-[20px]">person</span>
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-text-heading truncate">{{ role.user?.name || 'Unknown' }}</p>
                  <p class="text-xs text-text-muted truncate">{{ role.user?.email || '' }}</p>
                  <p v-if="role.invited_by_user" class="text-xs text-text-muted mt-0.5">
                    Diundang oleh {{ role.invited_by_user.name }}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span
                  class="text-xs font-semibold px-2.5 py-1 rounded-full"
                  :class="role.status === 'accepted' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'"
                >
                  {{ role.status === 'accepted' ? 'Aktif' : 'Menunggu' }}
                </span>
                <button
                  class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-error/10 text-text-muted hover:text-error transition-colors cursor-pointer"
                  @click="handleRemoveAdmin(role.id)"
                  title="Hapus admin"
                >
                  <span class="material-symbols-outlined text-[18px]">remove_circle</span>
                </button>
              </div>
            </div>

            <div class="flex flex-wrap gap-1.5 mt-3">
              <span
                v-for="r in role.roles"
                :key="r"
                class="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/5 text-primary border border-primary/10"
              >
                {{ ROLES_LABELS[r] || r }}
              </span>
            </div>

            <button
              class="flex items-center gap-1.5 mt-3 text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
              @click="toggleExpand(role.id)"
            >
              <span
                class="material-symbols-outlined text-[16px] transition-transform duration-200"
                :class="expandedAdminId === role.id ? 'rotate-90' : ''"
              >chevron_right</span>
              <span>Aktivitas</span>
            </button>
          </div>

          <div v-if="expandedAdminId === role.id" class="border-t border-border/30 bg-surface/50">
            <div class="p-5 space-y-3">
              <div
                v-for="entry in activity.filter(a => a.event_role_id === role.id)"
                :key="entry.id"
                class="flex items-start gap-3"
              >
                <div class="w-7 h-7 rounded-full bg-surface-variant flex items-center justify-center text-text-muted shrink-0">
                  <span class="material-symbols-outlined text-[14px]">{{ activityIcon(entry.action) }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-xs text-text">
                    <span class="font-semibold">{{ entry.performed_by_user?.name || 'Sistem' }}</span>
                    <span class="text-text-muted"> {{ activityActionLabel(entry.action) }}</span>
                  </p>
                  <p class="text-xs text-text-muted mt-0.5">{{ formatDateTime(entry.created_at) }}</p>
                </div>
              </div>
              <div
                v-if="activity.filter(a => a.event_role_id === role.id).length === 0"
                class="text-xs text-text-muted py-2"
              >
                Belum ada aktivitas
              </div>
            </div>
          </div>
        </div>
      </div>

      <details class="mt-6 bg-surface-card rounded-xl border border-border/50 overflow-hidden">
        <summary class="flex items-center justify-between p-5 cursor-pointer hover:bg-surface transition-colors select-none">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-text-muted">
              <span class="material-symbols-outlined">admin_panel_settings</span>
            </div>
            <h3 class="text-headline-sm font-heading font-semibold text-text-heading">Role & Izin</h3>
          </div>
          <span class="material-symbols-outlined text-text-muted transition-transform duration-300">expand_more</span>
        </summary>
        <div class="p-5 pt-0 text-sm text-text-muted border-t border-border/30 bg-surface/50">
          <p class="mb-4 mt-4">
            Setiap admin dapat memiliki satu atau lebih peran berikut:
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="bg-surface-card rounded-xl border border-border/30 p-4">
              <div class="flex items-center gap-2 mb-2">
                <span class="material-symbols-outlined text-[20px] text-primary">qr_code_scanner</span>
                <span class="text-sm font-semibold text-text-heading">Attendance</span>
              </div>
              <p class="text-xs text-text-muted">Akses scan QR dan panel kehadiran untuk memverifikasi tiket masuk acara.</p>
            </div>
            <div class="bg-surface-card rounded-xl border border-border/30 p-4">
              <div class="flex items-center gap-2 mb-2">
                <span class="material-symbols-outlined text-[20px] text-primary">support_agent</span>
                <span class="text-sm font-semibold text-text-heading">Support</span>
              </div>
              <p class="text-xs text-text-muted">Menangani antrean request, pembelian tiket, dan refund.</p>
            </div>
            <div class="bg-surface-card rounded-xl border border-border/30 p-4">
              <div class="flex items-center gap-2 mb-2">
                <span class="material-symbols-outlined text-[20px] text-primary">description</span>
                <span class="text-sm font-semibold text-text-heading">Secretary</span>
              </div>
              <p class="text-xs text-text-muted">Mengelola invoice, akuntansi, dan dokumen acara.</p>
            </div>
          </div>
        </div>
      </details>

    </div>

    <Teleport to="body">
      <div v-if="removeDialogId" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/40" @click="cancelRemove"></div>
        <div class="relative bg-surface-card rounded-2xl w-full max-w-sm p-6 shadow-xl text-center">
          <span class="material-symbols-outlined text-4xl text-error mb-3">warning</span>
          <h3 class="text-headline-sm font-heading font-semibold text-text-heading mb-2">Hapus Admin</h3>
          <p class="text-sm text-text-muted mb-6">Yakin ingin menghapus admin ini dari acara?</p>
          <div class="flex gap-3 justify-center">
            <BaseButton variant="outline" @click="cancelRemove">Batal</BaseButton>
            <BaseButton variant="danger" :loading="removeDialogLoading" @click="confirmRemove">Hapus</BaseButton>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showInviteModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="fixed inset-0 bg-black/40" @click="showInviteModal = false"></div>
        <div class="relative bg-surface-card rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-headline-sm font-heading font-semibold text-text-heading">Undang Admin</h2>
            <button
              class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface transition-colors cursor-pointer"
              @click="showInviteModal = false"
            >
              <span class="material-symbols-outlined text-[20px] text-text-muted">close</span>
            </button>
          </div>

          <div class="flex flex-col gap-5">
            <div>
              <label class="text-sm font-semibold text-text mb-1.5 block">Pilih Acara</label>
              <select
                v-model="selectedEventId"
                class="w-full text-sm bg-surface border border-border rounded-xl px-4 py-2.5 text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="" disabled>Pilih acara</option>
                <option v-for="ev in events" :key="ev.id" :value="ev.id">{{ ev.title }}</option>
              </select>
            </div>

            <div>
              <label class="text-sm font-semibold text-text mb-1.5 block">Cari Pengguna</label>
              <input
                v-model="inviteSearch"
                type="text"
                placeholder="Cari berdasarkan nama atau email..."
                class="w-full text-sm bg-surface border border-border rounded-xl px-4 py-2.5 text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <div v-if="searchResults.length > 0 && !selectedUserId" class="mt-2 bg-surface border border-border rounded-xl max-h-48 overflow-y-auto">
                <button
                  v-for="u in searchResults"
                  :key="u.id"
                  class="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-variant transition-colors text-left cursor-pointer border-b border-border/30 last:border-0"
                  @click="selectUser(u.id, u.name, u.email)"
                >
                  <div class="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center text-text-muted text-xs shrink-0">
                    {{ u.name.charAt(0).toUpperCase() || '?' }}
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-text truncate">{{ u.name }}</p>
                    <p class="text-xs text-text-muted truncate">{{ u.email }}</p>
                  </div>
                </button>
              </div>
              <div v-if="selectedUserId" class="mt-2 flex items-center gap-2 bg-surface-variant rounded-xl px-4 py-2.5">
                <span class="flex-1 text-sm text-text truncate">{{ selectedUserDisplay }}</span>
                <button class="text-text-muted hover:text-error cursor-pointer" @click="selectedUserId = ''; selectedUserDisplay = ''">
                  <span class="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            </div>

            <div>
              <label class="text-sm font-semibold text-text mb-2 block">Role Admin</label>
              <div class="flex flex-col gap-2.5">
                <label
                  class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                  :class="selectedRoles.includes('attendance') ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'"
                >
                  <input type="checkbox" :checked="selectedRoles.includes('attendance')" class="w-4 h-4 text-primary rounded focus:ring-primary" @change="toggleRole('attendance')" />
                  <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-[18px] text-primary">qr_code_scanner</span>
                    <span class="text-sm font-semibold text-text">Attendance</span>
                  </div>
                  <span class="text-xs text-text-muted ml-auto">QR & Kehadiran</span>
                </label>
                <label
                  class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                  :class="selectedRoles.includes('support') ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'"
                >
                  <input type="checkbox" :checked="selectedRoles.includes('support')" class="w-4 h-4 text-primary rounded focus:ring-primary" @change="toggleRole('support')" />
                  <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-[18px] text-primary">support_agent</span>
                    <span class="text-sm font-semibold text-text">Support</span>
                  </div>
                  <span class="text-xs text-text-muted ml-auto">Antrean & Tiket</span>
                </label>
                <label
                  class="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                  :class="selectedRoles.includes('secretary') ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'"
                >
                  <input type="checkbox" :checked="selectedRoles.includes('secretary')" class="w-4 h-4 text-primary rounded focus:ring-primary" @change="toggleRole('secretary')" />
                  <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-[18px] text-primary">description</span>
                    <span class="text-sm font-semibold text-text">Secretary</span>
                  </div>
                  <span class="text-xs text-text-muted ml-auto">Invoice & Akuntansi</span>
                </label>
              </div>
            </div>

            <p v-if="inviteError" class="text-sm text-error">{{ inviteError }}</p>

            <BaseButton variant="primary" fullWidth :loading="inviteLoading" :disabled="!selectedEventId || !selectedUserId || selectedRoles.length === 0" @click="handleInvite">
              Kirim Undangan
            </BaseButton>
          </div>
        </div>
      </div>
    </Teleport>

  </AppLayout>
</template>
