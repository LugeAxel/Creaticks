<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const labelMap: Record<string, string> = {
  dashboard: 'Beranda',
  acara: 'Cari Acara',
  'event-detail': 'Detail Acara',
  tickets: 'Tiket Saya',
  'digital-ticket': 'Tiket Digital',
  'my-events': 'Acara Saya',
  'profile-settings': 'Pengaturan',
  login: 'Masuk',
  signup: 'Daftar'
}

interface Crumb {
  label: string
  to: any
}

const crumbs = computed<Crumb[]>(() => {
  const matched = route.matched
  const items: Crumb[] = []
  items.push({ label: 'Beranda', to: '/dashboard' })

  for (const record of matched) {
    const name = record.name as string
    if (!name || name === 'landing') continue
    const label = labelMap[name]
    if (!label) continue
    items.push({ label, to: { name: record.name, params: route.params } })
  }

  return items
})
</script>

<template>
  <nav v-if="crumbs.length > 1" class="flex items-center gap-1.5 text-xs md:text-sm text-text-muted px-4 md:px-6 pt-3 md:pt-4 pb-0 max-w-5xl mx-auto w-full mb-8">
    <template v-for="(crumb, idx) in crumbs" :key="idx">
      <router-link
        :to="crumb.to"
        class="hover:text-primary transition-colors duration-150"
        :class="idx === crumbs.length - 1 ? 'text-text-heading font-semibold pointer-events-none' : ''"
      >
        <span v-if="idx === 0" class="material-symbols-outlined text-[16px] md:text-[18px] align-middle mr-0.5">home</span>
        {{ crumb.label }}
      </router-link>
      <span v-if="idx < crumbs.length - 1" class="material-symbols-outlined text-[14px] md:text-[16px] text-text-muted/50">chevron_right</span>
    </template>
  </nav>
</template>
