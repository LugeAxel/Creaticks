<script setup lang="ts">
import Skeleton from './Skeleton.vue'

defineProps<{
  type: string
}>()
</script>

<template>
  <!-- Dashboard — hero greeting + pills + ticket cards -->
  <div v-if="type === 'dashboard'" class="p-4 md:p-6 space-y-6">
    <div class="bg-surface-card rounded-2xl p-6 space-y-4 border border-border/50">
      <Skeleton shape="text" :lines="1" width="60%" height="28px" />
      <Skeleton shape="text" :lines="1" width="80%" height="14px" />
      <div class="bg-surface-variant/50 rounded-xl p-4 flex items-center gap-4">
        <Skeleton shape="circle" size="40px" />
        <div class="flex-1 space-y-2">
          <Skeleton shape="text" :lines="1" width="50%" />
          <Skeleton shape="text" :lines="1" width="30%" />
        </div>
      </div>
    </div>
    <div class="flex gap-3">
      <Skeleton shape="rect" width="100px" height="40px" rounded="full" />
      <Skeleton shape="rect" width="100px" height="40px" rounded="full" />
      <Skeleton shape="rect" width="100px" height="40px" rounded="full" />
    </div>
    <div class="space-y-4">
      <Skeleton shape="rect" width="100%" height="100px" rounded="xl" />
      <Skeleton shape="rect" width="100%" height="100px" rounded="xl" />
    </div>
  </div>

  <!-- Grid — search bar + pills + card grid -->
  <div v-else-if="type === 'grid'" class="p-4 md:p-6 space-y-6">
    <Skeleton shape="rect" width="100%" height="44px" rounded="xl" />
    <div class="flex gap-2">
      <Skeleton shape="rect" width="80px" height="32px" rounded="full" />
      <Skeleton shape="rect" width="90px" height="32px" rounded="full" />
      <Skeleton shape="rect" width="70px" height="32px" rounded="full" />
      <Skeleton shape="rect" width="100px" height="32px" rounded="full" />
      <Skeleton shape="rect" width="85px" height="32px" rounded="full" />
    </div>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <div v-for="i in 8" :key="i" class="bg-surface-card rounded-xl border border-border/50 overflow-hidden">
        <Skeleton shape="rect" width="100%" height="140px" rounded="none" />
        <div class="p-3 space-y-2">
          <Skeleton shape="text" :lines="1" width="90%" />
          <Skeleton shape="text" :lines="1" width="60%" />
          <Skeleton shape="text" :lines="1" width="70%" />
        </div>
      </div>
    </div>
  </div>

  <!-- List — header + vertical card list -->
  <div v-else-if="type === 'list'" class="p-4 md:p-6 space-y-5">
    <div class="flex items-center justify-between">
      <div class="space-y-1">
        <Skeleton shape="text" :lines="1" width="180px" height="24px" />
        <Skeleton shape="text" :lines="1" width="120px" />
      </div>
      <Skeleton shape="rect" width="120px" height="38px" rounded="xl" />
    </div>
    <div class="space-y-3">
      <div v-for="i in 5" :key="i" class="flex gap-4 bg-surface-card rounded-xl border border-border/50 p-4">
        <Skeleton shape="rect" width="120px" height="90px" rounded="lg" />
        <div class="flex-1 space-y-2">
          <div class="flex gap-2">
            <Skeleton shape="rect" width="60px" height="22px" rounded="full" />
            <Skeleton shape="rect" width="70px" height="22px" rounded="full" />
          </div>
          <Skeleton shape="text" :lines="1" width="70%" />
          <Skeleton shape="text" :lines="1" width="50%" />
          <div class="flex gap-2 pt-1">
            <Skeleton shape="rect" width="80px" height="32px" rounded="xl" />
            <Skeleton shape="rect" width="80px" height="32px" rounded="xl" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Detail — hero image + info card + tiers -->
  <div v-else-if="type === 'detail'" class="space-y-0">
    <Skeleton shape="rect" width="100%" height="300px" rounded="none" />
    <div class="max-w-screen-md mx-auto px-4 md:px-6 -mt-16 relative z-10">
      <div class="bg-surface-card rounded-2xl border border-border/50 p-6 space-y-4 shadow-lg">
        <Skeleton shape="text" :lines="1" width="75%" height="28px" />
        <div class="flex gap-2">
          <Skeleton shape="rect" width="70px" height="26px" rounded="full" />
          <Skeleton shape="rect" width="80px" height="26px" rounded="full" />
        </div>
        <div class="flex items-center gap-3">
          <Skeleton shape="circle" size="20px" />
          <Skeleton shape="text" :lines="1" width="200px" />
        </div>
        <div class="flex items-center gap-3">
          <Skeleton shape="circle" size="20px" />
          <Skeleton shape="text" :lines="1" width="250px" />
        </div>
        <Skeleton shape="text" :lines="3" lastLineWidth="60%" />
      </div>
      <div class="grid md:grid-cols-2 gap-4 mt-6">
        <div v-for="i in 2" :key="i" class="bg-surface-card rounded-xl border border-border/50 p-5 space-y-3">
          <Skeleton shape="text" :lines="1" width="50%" />
          <Skeleton shape="text" :lines="1" width="40%" height="24px" />
          <Skeleton shape="rect" width="100%" height="40px" rounded="xl" />
        </div>
      </div>
    </div>
  </div>

  <!-- Ticket — single ticket card -->
  <div v-else-if="type === 'ticket'" class="flex justify-center p-4">
    <div class="w-full max-w-sm bg-surface-card rounded-2xl border border-border/50 overflow-hidden shadow-lg">
      <Skeleton shape="rect" width="100%" height="140px" rounded="none" />
      <div class="p-5 space-y-4">
        <Skeleton shape="text" :lines="1" width="80%" height="22px" />
        <div class="space-y-2">
          <Skeleton shape="text" :lines="1" width="60%" />
          <Skeleton shape="text" :lines="1" width="50%" />
          <Skeleton shape="text" :lines="1" width="70%" />
        </div>
        <div class="flex justify-center py-4">
          <Skeleton shape="rect" width="180px" height="180px" rounded="xl" />
        </div>
        <Skeleton shape="text" :lines="1" width="50%" />
        <Skeleton shape="rect" width="100%" height="44px" rounded="xl" />
      </div>
    </div>
  </div>

  <!-- Chat — sidebar + messages -->
  <div v-else-if="type === 'chat'" class="flex flex-col lg:flex-row h-[calc(100vh-120px)]">
    <div class="w-full lg:w-80 border-r border-border/50 bg-surface-card p-4 space-y-3 overflow-y-auto">
      <Skeleton shape="text" :lines="1" width="120px" height="22px" />
      <div v-for="i in 5" :key="i" class="flex items-center gap-3 p-3 rounded-xl">
        <Skeleton shape="circle" size="40px" />
        <div class="flex-1 space-y-1.5">
          <Skeleton shape="text" :lines="1" width="60%" />
          <Skeleton shape="text" :lines="1" width="80%" />
        </div>
        <Skeleton shape="rect" width="20px" height="20px" rounded="full" />
      </div>
    </div>
    <div class="flex-1 flex flex-col bg-surface-card">
      <div class="flex items-center gap-3 p-4 border-b border-border/50">
        <Skeleton shape="circle" size="36px" />
        <div class="flex-1 space-y-1">
          <Skeleton shape="text" :lines="1" width="120px" />
          <Skeleton shape="text" :lines="1" width="80px" />
        </div>
      </div>
      <div class="flex-1 p-4 space-y-4 overflow-y-auto">
        <div v-for="i in 4" :key="i" class="flex" :class="i % 2 === 0 ? 'justify-end' : 'justify-start'">
          <Skeleton shape="rect" :width="i % 2 === 0 ? '200px' : '240px'" height="48px" rounded="2xl" />
        </div>
      </div>
      <div class="border-t border-border/50 p-4">
        <Skeleton shape="rect" width="100%" height="44px" rounded="xl" />
      </div>
    </div>
  </div>

  <!-- Form — avatar + inputs + buttons -->
  <div v-else-if="type === 'form'" class="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
    <div class="flex items-center gap-4">
      <Skeleton shape="circle" size="64px" />
      <Skeleton shape="rect" width="120px" height="38px" rounded="xl" />
    </div>
    <div class="space-y-2">
      <Skeleton shape="text" :lines="1" width="80px" />
      <Skeleton shape="rect" width="100%" height="44px" rounded="xl" />
    </div>
    <div class="space-y-2">
      <Skeleton shape="text" :lines="1" width="100px" />
      <Skeleton shape="rect" width="100%" height="44px" rounded="xl" />
    </div>
    <Skeleton shape="rect" width="100%" height="44px" rounded="xl" />
    <div class="space-y-4 pt-6 border-t border-border/50">
      <Skeleton shape="text" :lines="1" width="140px" height="22px" />
      <Skeleton shape="rect" width="100%" height="44px" rounded="xl" />
    </div>
    <div class="space-y-4 pt-6 border-t border-border/50">
      <Skeleton shape="text" :lines="1" width="140px" height="22px" />
      <Skeleton shape="rect" width="100%" height="44px" rounded="xl" />
    </div>
  </div>

  <!-- Stats — stat grid + filter + table rows -->
  <div v-else-if="type === 'stats'" class="p-4 md:p-6 space-y-6">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div v-for="i in 4" :key="i" class="bg-surface-card rounded-xl border border-border/50 p-4 space-y-2">
        <Skeleton shape="text" :lines="1" width="60%" />
        <Skeleton shape="text" :lines="1" width="40%" height="24px" />
      </div>
    </div>
    <div class="flex gap-2">
      <Skeleton shape="rect" width="70px" height="32px" rounded="full" />
      <Skeleton shape="rect" width="80px" height="32px" rounded="full" />
      <Skeleton shape="rect" width="90px" height="32px" rounded="full" />
      <Skeleton shape="rect" width="60px" height="32px" rounded="full" />
    </div>
    <div class="space-y-2 bg-surface-card rounded-xl border border-border/50 p-4">
      <div class="flex gap-4 pb-3 border-b border-border/50">
        <Skeleton shape="text" :lines="1" width="15%" />
        <Skeleton shape="text" :lines="1" width="25%" />
        <Skeleton shape="text" :lines="1" width="20%" />
        <Skeleton shape="text" :lines="1" width="20%" />
        <Skeleton shape="text" :lines="1" width="20%" />
      </div>
      <div v-for="i in 5" :key="i" class="flex gap-4 py-2">
        <Skeleton shape="text" :lines="1" width="15%" />
        <Skeleton shape="text" :lines="1" width="25%" />
        <Skeleton shape="text" :lines="1" width="20%" />
        <Skeleton shape="rect" width="70px" height="24px" rounded="full" />
        <Skeleton shape="text" :lines="1" width="20%" />
      </div>
    </div>
  </div>

  <!-- Admin List — header + filter tabs + admin cards -->
  <div v-else-if="type === 'admin-list'" class="p-4 md:p-6 space-y-6">
    <div class="flex items-center justify-between">
      <div class="space-y-1">
        <Skeleton shape="text" :lines="1" width="150px" height="24px" />
        <Skeleton shape="text" :lines="1" width="200px" />
      </div>
      <Skeleton shape="rect" width="140px" height="38px" rounded="xl" />
    </div>
    <div class="flex gap-2 border-b border-border/50 pb-2">
      <Skeleton shape="rect" width="80px" height="34px" rounded="xl" />
      <Skeleton shape="rect" width="90px" height="34px" rounded="xl" />
      <Skeleton shape="rect" width="100px" height="34px" rounded="xl" />
      <Skeleton shape="rect" width="95px" height="34px" rounded="xl" />
    </div>
    <div class="space-y-3">
      <div v-for="i in 4" :key="i" class="flex items-center gap-4 bg-surface-card rounded-xl border border-border/50 p-4">
        <Skeleton shape="circle" size="44px" />
        <div class="flex-1 space-y-1.5">
          <Skeleton shape="text" :lines="1" width="140px" />
          <Skeleton shape="text" :lines="1" width="200px" />
        </div>
        <Skeleton shape="rect" width="60px" height="24px" rounded="full" />
        <div class="flex gap-1.5">
          <Skeleton shape="rect" width="50px" height="24px" rounded="full" />
          <Skeleton shape="rect" width="60px" height="24px" rounded="full" />
        </div>
        <Skeleton shape="circle" size="32px" />
      </div>
    </div>
  </div>

  <!-- Invitation — banner card + info + buttons -->
  <div v-else-if="type === 'invitation'" class="flex justify-center p-4 md:p-8">
    <div class="w-full max-w-lg bg-surface-card rounded-2xl border border-border/50 overflow-hidden">
      <Skeleton shape="rect" width="100%" height="200px" rounded="none" />
      <div class="p-6 space-y-4">
        <div class="flex items-center gap-3">
          <Skeleton shape="circle" size="28px" />
          <Skeleton shape="text" :lines="1" width="180px" />
        </div>
        <Skeleton shape="text" :lines="1" width="80%" height="28px" />
        <div class="flex items-center gap-3">
          <Skeleton shape="circle" size="20px" />
          <Skeleton shape="text" :lines="1" width="200px" />
        </div>
        <div class="flex gap-2">
          <Skeleton shape="rect" width="70px" height="26px" rounded="full" />
          <Skeleton shape="rect" width="80px" height="26px" rounded="full" />
        </div>
        <div class="flex gap-3 pt-2">
          <Skeleton shape="rect" width="160px" height="44px" rounded="xl" />
          <Skeleton shape="rect" width="100px" height="44px" rounded="xl" />
        </div>
      </div>
    </div>
  </div>

  <!-- Editor — step progress + form sections -->
  <div v-else-if="type === 'editor'" class="p-4 md:p-6 space-y-6">
    <div class="flex items-center justify-center gap-4">
      <div v-for="i in 4" :key="i" class="flex items-center gap-2">
        <Skeleton shape="circle" size="32px" />
        <Skeleton shape="rect" width="80px" height="14px" rounded="md" />
        <div v-if="i < 4" class="w-8 h-0.5 bg-surface-variant/50" />
      </div>
    </div>
    <div class="max-w-2xl mx-auto space-y-5">
      <Skeleton shape="rect" width="100%" height="200px" rounded="2xl" class="border-2 border-dashed border-border/50" />
      <div class="space-y-2">
        <Skeleton shape="text" :lines="1" width="80px" />
        <Skeleton shape="rect" width="100%" height="44px" rounded="xl" />
      </div>
      <div class="space-y-2">
        <Skeleton shape="text" :lines="1" width="120px" />
        <Skeleton shape="rect" width="100%" height="120px" rounded="xl" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <Skeleton shape="text" :lines="1" width="80px" />
          <Skeleton shape="rect" width="100%" height="44px" rounded="xl" />
        </div>
        <div class="space-y-2">
          <Skeleton shape="text" :lines="1" width="60px" />
          <Skeleton shape="rect" width="100%" height="44px" rounded="xl" />
        </div>
      </div>
    </div>
  </div>

  <!-- Fallback for unknown type -->
  <div v-else class="flex items-center justify-center py-20">
    <Skeleton shape="circle" size="48px" />
  </div>
</template>
