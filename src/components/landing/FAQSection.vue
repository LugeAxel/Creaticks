<template>
  <section class="px-6 py-16 max-w-4xl mx-auto">
    <div class="space-y-6 text-center mb-12">
      <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Pertanyaan umum</p>
      <h2 class="text-3xl md:text-4xl font-heading font-bold text-text-heading">FAQ</h2>
    </div>

    <!-- FAQ Items -->
    <div class="space-y-4">
      <template v-for="(item, index) in faqs" :key="index">
        <div class="rounded-3xl border border-border bg-surface-card overflow-hidden transition hover:border-primary/40">
          <!-- Question -->
          <button
            @click="toggleItem(index)"
            class="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-primary/5 transition"
          >
            <p class="font-semibold text-text-heading">{{ item.question }}</p>
            <span
              class="material-symbols-outlined text-text-muted transition"
              :class="activeIndex === index ? 'rotate-180' : ''"
            >
              expand_more
            </span>
          </button>

          <!-- Answer -->
          <transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div v-show="activeIndex === index" class="px-6 pb-5 border-t border-border text-text-muted text-sm leading-relaxed">
              {{ item.answer }}
            </div>
          </transition>
        </div>
      </template>
    </div>

    <!-- CTA -->
    <div class="mt-12 text-center">
      <p class="text-sm text-text-muted mb-4">Pertanyaan lain?</p>
      <a
        href="mailto:support@creatick.app"
        class="inline-flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-primary-light transition"
      >
        Hubungi support
        <span class="material-symbols-outlined text-base">arrow_outward</span>
      </a>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const activeIndex = ref<number | null>(null)

const faqs = [
  {
    question: 'Apakah peserta perlu membuat akun untuk beli tiket?',
    answer:
      'Tidak. Peserta bisa langsung request tiket lewat link event tanpa akun. Mereka hanya perlu kirim nomor WhatsApp dan nama. Tiket digital langsung terakses via link yang dikirim ke WhatsApp atau email.'
  },
  {
    question: 'Bagaimana proses pembayaran tiket?',
    answer:
      'Peserta upload bukti transfer bank ke Creatick. Admin bisa lihat bukti langsung di dashboard, lalu approve atau reject. Kalau approved, QR ticket langsung aktif dan bisa di-scan. Nggak perlu chat-chat di WhatsApp.'
  },
  {
    question: 'Berapa jumlah peserta maksimal yang bisa ditangani?',
    answer:
      'Creatick bisa handle dari 5 peserta sampai ribuan peserta. Dashboard kami dirancang biar tetap responsif walau data besar. Scan QR juga tested aman dan cepat untuk event 500+ orang.'
  },
  {
    question: 'Bisakah ada banyak admin dalam satu event?',
    answer:
      'Bisa. Organizer bisa invite multiple admin, assign role (view only, approve payment, scan check-in, manage seat), dan semua bisa collaborate real-time. Nggak perlu lagi grup WhatsApp chaos.'
  },
  {
    question: 'Apakah QR ticket aman dari pemalsuan?',
    answer:
      'Setiap QR unik dan tied ke peserta. Saat di-scan, status langsung tercatat di dashboard. Kalau QR sudah di-scan, scan ulang di event yang sama langsung ke-flag sebagai duplicate. Aman dari tamu dadakan.'
  },
  {
    question: 'Apakah Creatick gratis?',
    answer:
      'Ya, saat ini Creatick gratis untuk semua event komunitas. Tidak ada biaya setup, tidak perlu kartu kredit. Kami belum charge apapun. Jika ada perubahan harga ke depan, kami akan announce lebih dulu dan fair untuk semua organizer.'
  }
]

const toggleItem = (index: number) => {
  activeIndex.value = activeIndex.value === index ? null : index
}
</script>
