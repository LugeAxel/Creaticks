<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'

const router = useRouter()
</script>

<template>
  <AppLayout>
    <section class="px-6 pt-20 pb-16 max-w-6xl mx-auto text-center">
      <h1 class="text-4xl md:text-5xl lg:text-6xl font-heading font-extrabold text-text-heading leading-tight mb-6">
        Cara paling gampang untuk<br/>
        <span class="text-primary">kelola tiket event komunitas</span>
      </h1>
      <p class="text-lg text-text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
        Creaticks membantu kamu membuat, menjual, dan memverifikasi tiket acara komunitas secara digital.
        Nggak perlu repot cetak tiket lagi.
      </p>
      <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
        <button
          class="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-white bg-primary rounded-xl hover:bg-primary-light transition-all duration-200 cursor-pointer"
          @click="router.push('/daftar?role=creator')"
        >
          Buat Acara
        </button>
        <button
          class="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-text border-2 border-border rounded-xl hover:border-primary hover:text-primary transition-all duration-200 cursor-pointer"
          @click="router.push('/acara')"
        >
          Cari Event
        </button>
      </div>
    </section>

    <section class="px-6 py-16 max-w-6xl mx-auto">
      <div class="grid md:grid-cols-3 gap-8">
        <div class="bg-surface-card p-8 rounded-2xl border border-border">
          <span class="material-symbols-outlined text-3xl text-primary mb-4">confirmation_number</span>
          <h3 class="font-heading font-bold text-lg text-text-heading mb-2">Digital Tickets</h3>
          <p class="text-sm text-text-muted leading-relaxed">Buat dan distribusi tiket digital dengan QR code. Verifikasi real-time pas di pintu masuk.</p>
        </div>
        <div class="bg-surface-card p-8 rounded-2xl border border-border">
          <span class="material-symbols-outlined text-3xl text-primary mb-4">groups</span>
          <h3 class="font-heading font-bold text-lg text-text-heading mb-2">Komunitas</h3>
          <p class="text-sm text-text-muted leading-relaxed">Bangun komunitas melalui event. Pantau kehadiran dan dapatkan insight peserta.</p>
        </div>
        <div class="bg-surface-card p-8 rounded-2xl border border-border">
          <span class="material-symbols-outlined text-3xl text-primary mb-4">payments</span>
          <h3 class="font-heading font-bold text-lg text-text-heading mb-2">Pembayaran Mudah</h3>
          <p class="text-sm text-text-muted leading-relaxed">Terima pembayaran via transfer bank. Upload bukti dan verifikasi otomatis.</p>
        </div>
      </div>
    </section>

    <footer class="border-t border-border px-6 py-8 text-center">
      <p class="text-sm text-text-muted">&copy; 2026 Creaticks. All rights reserved.</p>
    </footer>
  </AppLayout>
</template>
