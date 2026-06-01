<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/composables/useToast'
import AppLayout from '@/components/layout/AppLayout.vue'
import BaseButton from '@/components/shared/BaseButton.vue'

const router = useRouter()
const route = useRoute()
const { showToast } = useToast()

const agreed = ref(false)
const accepting = ref(false)
const isAcceptMode = ref(false)
const accepted = ref(false)

const sections = [
  {
    num: 1,
    title: 'Siapa kita',
    body: 'Creatick adalah platform digital yang memungkinkan <strong>Kreator</strong> membuat acara dan menjual tiket, <strong>Admin</strong> membantu mengelola acara, dan <strong>Pembeli</strong> membeli tiket secara digital. Creatick bukan penyelenggara acara — kami hanya menyediakan infrastruktur digitalnya.'
  },
  {
    num: 2,
    title: 'Akun & identitas',
    items: [
      'Kamu harus membuat akun untuk menggunakan Creatick. Data yang kamu masukkan harus akurat dan terkini.',
      'Kamu bertanggung jawab atas keamanan akunmu. Jangan bagikan password ke siapapun.',
      'Satu orang, satu akun. Pembuatan akun ganda untuk memanipulasi sistem (war tiket, spam request, dll) adalah pelanggaran serius.',
      'Creatick berhak menonaktifkan akun yang melanggar syarat ini tanpa pemberitahuan.'
    ]
  },
  {
    num: 3,
    title: 'Transaksi & pembayaran',
    isImportant: true,
    body: 'Creatick menggunakan sistem chat-based transaction — pembayaran dilakukan langsung antara Pembeli dan Kreator di luar platform Creatick (transfer bank, dompet digital, dll).',
    items: [
      'Creatick <strong>tidak memproses, menyimpan, atau menjamin</strong> pembayaran apapun.',
      'Kreator bertanggung jawab penuh atas konfirmasi pembayaran dan penerbitan tiket.',
      'Jika terjadi sengketa pembayaran, Creatick hanya bisa menyediakan riwayat chat sebagai referensi — bukan sebagai arbiter.',
      'Bukti transfer yang dikirim di chat wajib asli. Pemalsuan bukti transfer adalah tindakan penipuan dan dapat dilaporkan ke pihak berwajib.',
      'Tiket hanya diterbitkan dan berlaku setelah Kreator atau Admin mengkonfirmasi pembayaran.'
    ]
  },
  {
    num: 4,
    title: 'Tiket & kehadiran',
    items: [
      'Tiket berstatus <strong>Owned</strong> adalah satu-satunya tiket yang valid untuk masuk ke acara.',
      'QR code tiket bersifat unik dan tidak dapat dipindahtangankan kecuali Kreator mengizinkan transfer.',
      'Pemalsuan, duplikasi, atau modifikasi QR code tiket adalah pelanggaran serius dan batalkan akses.',
      'Creatick tidak bertanggung jawab atas penolakan masuk akibat tiket tidak valid, rusak, atau expired.',
      'Data tiket dan acara akan <strong>otomatis dihapus 14 hari</strong> setelah acara selesai, kecuali diarsipkan oleh Kreator.'
    ]
  },
  {
    num: 5,
    title: 'Kewajiban Kreator',
    intro: 'Sebagai Kreator, kamu setuju bahwa:',
    items: [
      'Informasi acara yang kamu buat (nama, tanggal, lokasi, harga) adalah akurat dan tidak menyesatkan.',
      'Kamu memiliki hak atau izin untuk menyelenggarakan acara tersebut di lokasi yang dicantumkan.',
      'Kamu bertanggung jawab atas kebijakan refund yang kamu tetapkan dan wajib menghormatinya.',
      'Jika acara dibatalkan, kamu wajib menginformasikan semua pemegang tiket dan memproses refund sesuai kebijakanmu.',
      'Kamu tidak boleh membuat acara untuk kegiatan ilegal, penipuan, atau yang melanggar hak orang lain.',
      'Pendelegasian akses Admin adalah tanggung jawabmu — tindakan Admin di platformmu adalah tanggung jawabmu juga.'
    ]
  },
  {
    num: 6,
    title: 'Kewajiban Pembeli',
    items: [
      'Pastikan data yang kamu masukkan saat request tiket akurat (nama, jumlah tiket, dll).',
      'Kirimkan bukti pembayaran yang asli dan sesuai — jangan mengirim bukti palsu atau yang sudah digunakan.',
      'Tiket yang sudah dikonfirmasi (Owned) tidak dapat dikembalikan kecuali Kreator memiliki kebijakan refund.',
      'Hadir ke acara dengan tiket QR yang valid. Creatick tidak bertanggung jawab atas ketidakhadiran.'
    ]
  },
  {
    num: 7,
    title: 'Privasi & data',
    items: [
      'Creatick mengumpulkan data yang kamu berikan (nama, email, riwayat tiket) untuk menjalankan layanan.',
      'Kami tidak menjual datamu ke pihak ketiga.',
      'Riwayat chat antara Pembeli dan Kreator/Admin disimpan selama acara aktif dan dihapus bersama data acara setelah 14 hari (atau saat diarsipkan).',
      'Kamu berhak meminta penghapusan akunmu dengan menghubungi tim Creatick.'
    ]
  },
  {
    num: 8,
    title: 'Batasan tanggung jawab',
    intro: 'Creatick menyediakan platform sebagaimana adanya. Kami tidak bertanggung jawab atas:',
    items: [
      'Kerugian finansial akibat sengketa pembayaran antara Pembeli dan Kreator.',
      'Acara yang dibatalkan, diubah, atau tidak sesuai ekspektasi.',
      'Kehilangan data akibat penghapusan otomatis setelah 14 hari jika tidak diarsipkan.',
      'Gangguan layanan (downtime) yang bersifat sementara.'
    ]
  },
  {
    num: 9,
    title: 'Larangan penggunaan',
    intro: 'Kamu dilarang menggunakan Creatick untuk:',
    items: [
      'Membuat acara fiktif atau penipuan untuk mengumpulkan uang.',
      'Menyebarkan konten yang melanggar hukum, mengandung SARA, atau berbahaya.',
      'Melakukan manipulasi sistem (bot, spam request, race condition yang disengaja).',
      'Mengakses data pengguna lain tanpa izin.',
      'Menjual kembali tiket di luar platform dengan harga yang dimanipulasi (scalping).'
    ]
  },
  {
    num: 10,
    title: 'Perubahan syarat',
    body: 'Creatick berhak mengubah syarat ini sewaktu-waktu. Jika ada perubahan signifikan, kami akan memberitahu kamu melalui email atau notifikasi di platform. Penggunaan platform setelah pemberitahuan dianggap sebagai persetujuan terhadap syarat yang diperbarui.'
  }
]

const handleAccept = async () => {
  if (!agreed.value) return
  accepting.value = true
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq('id', (await supabase.auth.getUser()).data.user?.id)
    if (error) {
      showToast('Gagal menyimpan persetujuan', 'error')
    } else {
      sessionStorage.setItem('termsAccepted', 'true')
      accepted.value = true
      showToast('Terima kasih telah menyetujui Syarat & Ketentuan', 'success')
      const redirect = route.query.redirect as string
      if (redirect && redirect !== route.path) {
        router.push(redirect)
      } else {
        router.push('/dashboard')
      }
    }
  } catch {
    showToast('Gagal menyimpan persetujuan', 'error')
  } finally {
    accepting.value = false
  }
}

onMounted(() => {
  isAcceptMode.value = !!route.query.redirect
})
</script>

<template>
  <AppLayout :title="'Syarat & Ketentuan'">
    <div class="max-w-2xl mx-auto px-4 md:px-6 py-8">
      <div class="mb-6">
        <h1 class="text-2xl font-heading font-bold text-text-heading">Syarat &amp; Ketentuan</h1>
        <p class="text-sm text-text-muted mt-1">Berlaku: Juni 2026 &middot; Versi 1.0</p>
      </div>

      <div class="bg-surface-variant/50 rounded-xl p-4 mb-8 text-sm text-text-muted leading-relaxed">
        <strong class="text-text-heading">Sebelum menggunakan Creatick, baca ini dulu.</strong>
        Singkatnya: Creatick adalah platform pembuatan dan manajemen tiket digital untuk acara kecil. Kami menyediakan alatnya — kamu yang bertanggung jawab atas acaramu dan transaksimu. Kalau ada yang tidak setuju dengan syarat ini, jangan gunakan platform kami.
      </div>

      <div v-for="sec in sections" :key="sec.num" class="mb-6">
        <h2 class="text-base font-semibold text-text-heading mb-2 flex items-center gap-2">
          <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-xs font-bold shrink-0">
            {{ sec.num }}
          </span>
          {{ sec.title }}
          <span v-if="sec.isImportant" class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-error/10 text-error ml-1">Penting</span>
        </h2>
        <div class="text-sm text-text-muted leading-relaxed pl-9 space-y-2">
          <p v-if="sec.body" v-html="sec.body"></p>
          <p v-if="sec.intro" v-text="sec.intro"></p>
          <ul v-if="sec.items" class="space-y-1">
            <li v-for="(item, i) in sec.items" :key="i" class="flex gap-2">
              <span class="text-text-muted/50 shrink-0">&mdash;</span>
              <span v-html="item"></span>
            </li>
          </ul>
        </div>
      </div>

      <hr class="border-border my-8" />

      <div v-if="!accepted" class="bg-surface-card border border-border rounded-xl p-5">
        <label v-if="isAcceptMode" class="flex items-start gap-3 mb-4 cursor-pointer">
          <input
            v-model="agreed"
            type="checkbox"
            class="mt-0.5 w-4 h-4 shrink-0 accent-primary"
          />
          <span class="text-sm text-text-heading leading-relaxed">
            Saya telah membaca dan menyetujui <span class="text-primary">Syarat &amp; Ketentuan</span> Creatick. Saya memahami bahwa transaksi dilakukan langsung dengan Kreator, dan Creatick tidak bertanggung jawab atas sengketa pembayaran.
          </span>
        </label>
        <BaseButton
          v-if="isAcceptMode"
          variant="primary"
          class="w-full"
          :disabled="!agreed || accepting"
          @click="handleAccept"
        >
          {{ accepting ? 'Menyimpan...' : 'Setuju & Lanjutkan' }}
        </BaseButton>
        <p v-else class="text-sm text-text-muted text-center">
          Terakhir diperbarui: Juni 2026
        </p>
      </div>

      <div v-else class="bg-success/10 border border-success/20 rounded-xl p-5 text-center">
        <span class="material-symbols-outlined text-2xl text-success">check_circle</span>
        <p class="text-sm font-semibold text-text-heading mt-1">Anda telah menyetujui Syarat & Ketentuan</p>
      </div>
    </div>
  </AppLayout>
</template>
