<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { useCloudinary } from '@/composables/useCloudinary'
import { useToast } from '@/composables/useToast'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import AppLayout from '@/components/layout/AppLayout.vue'

const router = useRouter()
const { session, getAuthHeaders, resetPasswordForEmail } = useAuth()
const { upload } = useCloudinary()
const { showToast } = useToast()

const name = ref('')
const phone = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')
const avatarUrl = ref('')

const passwordLoading = ref(false)
const passwordSent = ref(false)

onMounted(async () => {
  loading.value = true
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    name.value = user.user_metadata?.name || ''
    phone.value = user.user_metadata?.phone || ''
    avatarUrl.value = user.user_metadata?.avatar_url || ''
  }
  loading.value = false
})

const handleAvatarUpload = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !session.value) return

  try {
    const result = await upload(file, session.value.access_token, 'avatars')
    avatarUrl.value = result.url
  } catch (err: any) {
    showToast(err.message || 'Gagal mengunggah avatar', 'error')
  }
}

const handleSave = async () => {
  error.value = ''
  success.value = ''
  saving.value = true

  const { error: updateError } = await supabase.auth.updateUser({
    data: { name: name.value, phone: phone.value, avatar_url: avatarUrl.value }
  })

  saving.value = false

  if (updateError) {
    error.value = updateError.message
    return
  }

  success.value = 'Profil berhasil diperbarui'
}

const handleChangePassword = async () => {
  error.value = ''
  success.value = ''
  passwordLoading.value = true
  passwordSent.value = false

  const user = (await supabase.auth.getUser()).data.user
  if (!user?.email) return

  const { error: err } = await resetPasswordForEmail(user.email)

  passwordLoading.value = false

  if (err) {
    error.value = err.message
    return
  }

  passwordSent.value = true
  success.value = 'Link reset kata sandi sudah dikirim ke email kamu'
}

const handleSignOut = async () => {
  await supabase.auth.signOut()
  router.push('/login')
}
</script>

<template>
  <AppLayout title="Pengaturan Profil">
    <div class="px-4 md:px-6 py-6 max-w-2xl mx-auto pb-24 md:pb-8">
      <div class="mb-6">
        <h1 class="text-xl font-heading font-bold text-text-heading">Pengaturan Profil</h1>
        <p class="text-sm text-text-muted mt-1">Kelola data diri dan akun kamu</p>
      </div>

      <div v-if="loading" class="text-center text-text-muted py-12">Memuat...</div>

      <form v-else class="flex flex-col gap-6" @submit.prevent="handleSave">
        <div class="flex items-center gap-4">
          <div class="relative w-16 h-16 rounded-full bg-primary/10 overflow-hidden flex-shrink-0">
            <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" class="w-full h-full object-cover" />
            <span v-else class="material-symbols-outlined text-3xl text-primary absolute inset-0 flex items-center justify-center">person</span>
          </div>
          <label class="px-4 py-2 text-sm font-semibold border-2 border-border rounded-xl hover:border-primary hover:text-primary transition-all duration-200 cursor-pointer">
            Ganti Foto
            <input type="file" accept="image/*" class="hidden" @change="handleAvatarUpload" />
          </label>
        </div>

        <BaseInput v-model="name" label="Nama" placeholder="Nama lengkap" />
        <BaseInput v-model="phone" label="Nomor Telepon" type="tel" placeholder="0812xxxx" />

        <p v-if="error" class="text-sm text-error">{{ error }}</p>
        <p v-if="success" class="text-sm text-success">{{ success }}</p>

        <BaseButton type="submit" variant="primary" :loading="saving" fullWidth>
          Simpan Perubahan
        </BaseButton>
      </form>

      <div class="mt-8 pt-8 border-t border-border">
        <h2 class="text-lg font-heading font-bold text-text-heading mb-4">Kata Sandi</h2>
        <p class="text-sm text-text-muted mb-4">Kami akan kirim link reset kata sandi ke email kamu.</p>
        <BaseButton variant="outline" :loading="passwordLoading" fullWidth @click="handleChangePassword">
          {{ passwordSent ? 'Terkirim!' : 'Ubah Kata Sandi' }}
        </BaseButton>
      </div>

      <div class="mt-8 pt-8 border-t border-border">
        <BaseButton variant="ghost" fullWidth @click="handleSignOut">
          Keluar
        </BaseButton>
      </div>
    </div>
  </AppLayout>
</template>
