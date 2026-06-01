<template>
  <section class="px-6 py-16 max-w-6xl mx-auto" :class="[initialClass, isVisible ? visibleClass : '', transitionClass]" ref="elementRef">
    <div class="space-y-6 text-center mb-12">
      <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Dipercaya organizer</p>
      <h2 class="text-3xl md:text-4xl font-heading font-bold text-text-heading">
        Organizer lokal sudah merasakan perbedaannya
      </h2>
    </div>

    <!-- Desktop Grid -->
    <div class="hidden md:grid grid-cols-3 gap-6">
      <template v-for="testimonial in testimonials" :key="testimonial.id">
        <div
          class="rounded-3xl border border-border bg-surface-card p-6 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10"
        >
          <!-- Quote -->
          <p class="text-sm text-text-muted leading-relaxed mb-6">
            "{{ testimonial.quote }}"
          </p>

          <!-- Author -->
          <div class="flex items-center gap-3">
            <div
              class="h-10 w-10 rounded-full bg-gradient-to-br"
              :class="testimonial.avatarClass"
            ></div>
            <div class="text-left">
              <p class="text-sm font-semibold text-text-heading">{{ testimonial.name }}</p>
              <p class="text-xs text-text-muted">{{ testimonial.eventType }}</p>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Mobile Carousel -->
    <div class="md:hidden">
      <div class="overflow-x-auto snap-x snap-mandatory flex gap-4 pb-4">
        <template v-for="testimonial in testimonials" :key="testimonial.id">
          <div class="snap-center shrink-0 w-full sm:w-80">
            <div class="rounded-3xl border border-border bg-surface-card p-6">
              <p class="text-sm text-text-muted leading-relaxed mb-6">
                "{{ testimonial.quote }}"
              </p>
              <div class="flex items-center gap-3">
                <div
                  class="h-10 w-10 rounded-full bg-gradient-to-br"
                  :class="testimonial.avatarClass"
                ></div>
                <div class="text-left">
                  <p class="text-sm font-semibold text-text-heading">{{ testimonial.name }}</p>
                  <p class="text-xs text-text-muted">{{ testimonial.eventType }}</p>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRevealAnimation } from '@/composables/useRevealAnimation'

const { elementRef, isVisible, initialClass, visibleClass, transitionClass } = useRevealAnimation('fade-up')

const testimonials = [
  {
    id: 1,
    name: 'Sarah Kusuma',
    eventType: 'Panitia Workshop',
    quote: 'Sebelumnya kami manggung pakai Google Forms dan spreadsheet. Sekarang cukup buka Creatick, peserta bisa langsung pesan tiket. Admin kami bisa kerja lebih santai.',
    avatarClass: 'from-pink-400 to-rose-400'
  },
  {
    id: 2,
    name: 'Budi Santoso',
    eventType: 'Organizer Music Gig',
    quote: 'Yang paling menyelamatkan adalah QR check-in. Dulu antrean di pintu bisa sampai 15 menit. Sekarang? 2 menit semua masuk. Admin kami bisa fokus ke hal lain.',
    avatarClass: 'from-blue-400 to-cyan-400'
  },
  {
    id: 3,
    name: 'Dini Rahmawati',
    eventType: 'Leader Komunitas Lokal',
    quote: 'Paling suka fitur kolaborasi admin. Kami 5 panitia bisa lihat status tiket dan pembayaran real-time. Nggak ada miscommunication lagi. Kerja jadi lebih efisien.',
    avatarClass: 'from-purple-400 to-indigo-400'
  }
]
</script>
