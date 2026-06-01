<template>
  <footer class="border-t border-border px-6 py-12 bg-surface-card/50">
    <div class="max-w-6xl mx-auto">
      <div class="grid gap-8 md:grid-cols-5 mb-12">
        <!-- Brand -->
        <div class="md:col-span-2 space-y-3">
          <h3 class="text-lg font-semibold text-text-heading">Creatick</h3>
          <p class="text-sm text-text-muted leading-relaxed">
            Platform ticketing untuk event komunitas lokal. Kelola tiket, pembayaran, dan check-in dalam satu dashboard.
          </p>
          <p class="text-xs text-text-muted italic">Built for Indonesian communities.</p>
        </div>

        <!-- Product -->
        <div class="space-y-3">
          <h4 class="text-sm font-semibold text-text-heading">Produk</h4>
          <nav class="space-y-2">
            <router-link to="/daftar?role=creator" class="block text-sm text-text-muted hover:text-primary transition">
              Buat Event
            </router-link>
            <router-link to="/acara" class="block text-sm text-text-muted hover:text-primary transition">
              Cari Event
            </router-link>
            <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Pricing</a>
            <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Docs</a>
          </nav>
        </div>

        <!-- Company -->
        <div class="space-y-3">
          <h4 class="text-sm font-semibold text-text-heading">Perusahaan</h4>
          <nav class="space-y-2">
            <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Blog</a>
            <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Status</a>
            <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Careers</a>
            <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Contact</a>
          </nav>
        </div>

        <!-- Legal -->
        <div class="space-y-3">
          <h4 class="text-sm font-semibold text-text-heading">Legal</h4>
          <nav class="space-y-2">
            <router-link to="/syarat-dan-ketentuan" class="block text-sm text-text-muted hover:text-primary transition">
              Terms
            </router-link>
            <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Privacy</a>
            <a href="#" class="block text-sm text-text-muted hover:text-primary transition">Cookies</a>
          </nav>
        </div>
      </div>

      <!-- Divider -->
      <div class="border-t border-border py-8">
        <div class="flex flex-col md:flex-row items-center justify-between gap-6">
          <!-- Copyright -->
          <p class="text-xs text-text-muted">
            &copy; 2026 Creatick. Dikembangkan untuk komunitas Indonesia.
          </p>

          <!-- Social Links -->
          <div class="flex items-center gap-4">
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-muted hover:border-primary hover:text-primary transition"
              aria-label="Instagram"
            >
              <span class="material-symbols-outlined text-lg">photo_camera</span>
            </a>
            <a
              href="https://discord.com"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-muted hover:border-primary hover:text-primary transition"
              aria-label="Discord"
            >
              <span class="material-symbols-outlined text-lg">group</span>
            </a>
            <a
              href="mailto:support@creatick.app"
              class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-muted hover:border-primary hover:text-primary transition"
              aria-label="Email"
            >
              <span class="material-symbols-outlined text-lg">mail</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>
