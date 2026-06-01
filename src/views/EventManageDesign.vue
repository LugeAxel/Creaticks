<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useEventContext } from '@/composables/useEventContext'
import { supabase } from '@/lib/supabase'

const route = useRoute()
const eventId = route.params.eventId as string
const { event } = useEventContext()

const design = reactive({
  layout: 'classic' as 'classic' | 'split' | 'minimal',
  font: 'syne' as 'syne' | 'bebas' | 'playfair' | 'mono',
  tier: 'GENERAL',
  accentColor: '#6C63FF',
  bgColor: '#1a1a2e',
  textColor: '#ffffff',
  artworkUrl: null as string | null,
})

const pendingFile = ref<File | null>(null)
const localPreviewUrl = ref<string | null>(null)
const saving = ref(false)
import SkeletonPage from '@/components/shared/SkeletonPage.vue'
const initLoading = ref(true)
const toast = ref<{ message: string; type: 'success' | 'error' } | null>(null)

const fontMap: Record<string, string> = {
  syne: "'Syne', sans-serif",
  bebas: "'Bebas Neue', sans-serif",
  playfair: "'Playfair Display', serif",
  mono: "'Space Mono', monospace",
}

const fontLabel: Record<string, string> = {
  syne: 'Syne',
  bebas: 'Bebas',
  playfair: 'Playfair',
  mono: 'Mono',
}

const ticketTiers = computed(() => (event.ticket_tiers || []) as { id: string; name: string; price: number; quota: number; color?: string }[])
const selectedTierQuota = computed(() => {
  const t = ticketTiers.value.find(t => t.name === design.tier)
  return t?.quota || 150
})

const presetColors = [
  '#6C63FF', '#FF6584', '#43C6AC', '#FFB347',
  '#E91E8C', '#00D4FF', '#FF4757', '#2ECC71',
]

const artworkSrc = computed(() => {
  if (localPreviewUrl.value) return localPreviewUrl.value
  if (design.artworkUrl) return design.artworkUrl
  if (event.banner_url) return event.banner_url
  return null
})

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const previewStyle = computed(() => ({
  '--tk-accent': design.accentColor,
  '--tk-bg': design.bgColor,
  '--tk-text': design.textColor,
  '--tk-sub': hexToRgba(design.textColor, 0.55),
}))

const eventTitle = computed(() => event.title || 'NAMA ACARA')
const eventLocation = computed(() => event.location || 'Lokasi Acara')
const eventDateFormatted = computed(() => {
  if (!event) return '7 Jun 2026'
  const d = new Date(event.date)
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
})
const eventDateFull = computed(() => {
  if (!event) return 'Minggu, 7 Juni 2026'
  const d = new Date(event.date)
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
})
const eventTime = computed(() => {
  if (!event) return '08:00'
  const d = new Date(event.date)
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
})

onMounted(async () => {
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return

    const res = await fetch(`/api/ticket-designs/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const { design: saved } = await res.json()
      if (saved) {
        design.layout = saved.layout || 'classic'
        design.font = saved.font || 'syne'
        design.accentColor = saved.accent_color || '#6C63FF'
        design.bgColor = saved.bg_color || '#1a1a2e'
        design.textColor = saved.text_color || '#ffffff'
        design.artworkUrl = saved.artwork_url || null
      }
    }

    if (!design.tier || !ticketTiers.value.some(t => t.name === design.tier)) {
      if (ticketTiers.value.length > 0) {
        design.tier = ticketTiers.value[0].name
      }
    }
  } catch (e) {
    console.warn('Failed to load ticket designs:', e)
  } finally {
    initLoading.value = false
  }
})

function setLayout(name: 'classic' | 'split' | 'minimal') {
  design.layout = name
}
function setFont(name: 'syne' | 'bebas' | 'playfair' | 'mono') {
  design.font = name
}
function setTier(tier: string) {
  design.tier = tier
}
function applyColor(type: 'accent' | 'bg' | 'text', value: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return
  if (type === 'accent') design.accentColor = value
  else if (type === 'bg') design.bgColor = value
  else design.textColor = value
}
function pickPreset(color: string) {
  design.accentColor = color
}

function handleFileUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    toast.value = { message: 'Ukuran file maksimal 5MB', type: 'error' }
    return
  }
  pendingFile.value = file
  if (localPreviewUrl.value) URL.revokeObjectURL(localPreviewUrl.value)
  localPreviewUrl.value = URL.createObjectURL(file)
}

async function saveDesign() {
  saving.value = true
  toast.value = null
  try {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return

    let artworkUrl = design.artworkUrl

    if (pendingFile.value) {
      const formData = new FormData()
      formData.append('file', pendingFile.value)
      formData.append('folder', 'ticket-designs')
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json()
        artworkUrl = uploadData.url
      } else {
        toast.value = { message: 'Gagal mengunggah gambar', type: 'error' }
        saving.value = false
        return
      }
    }

    const res = await fetch(`/api/ticket-designs/${eventId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        layout: design.layout,
        font: design.font,
        accent_color: design.accentColor,
        bg_color: design.bgColor,
        text_color: design.textColor,
        artwork_url: artworkUrl,
      })
    })

    if (res.ok) {
      design.artworkUrl = artworkUrl
      pendingFile.value = null
      if (localPreviewUrl.value) {
        URL.revokeObjectURL(localPreviewUrl.value)
        localPreviewUrl.value = null
      }
      toast.value = { message: 'Desain tiket berhasil disimpan!', type: 'success' }
    } else {
      toast.value = { message: 'Gagal menyimpan desain', type: 'error' }
    }
  } catch {
    toast.value = { message: 'Gagal menyimpan desain', type: 'error' }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col lg:flex-row min-h-0" :style="previewStyle">
    <!-- Left Controls Panel -->
    <aside class="w-full lg:w-[280px] shrink-0 bg-[#16162a] lg:border-r border-white/10 overflow-y-auto p-5 space-y-6 lg:sticky lg:top-0 lg:max-h-screen">
      <!-- Layout Picker -->
      <div>
        <div class="section-label">Layout Style</div>
        <div class="layout-grid">
          <div
            class="layout-option" :class="{ active: design.layout === 'classic' }"
            @click="setLayout('classic')"
          >
            <div class="layout-thumb lt-classic">
              <div class="lt-img"></div>
              <div class="lt-body"></div>
              <div class="lt-line"></div>
            </div>
            <div class="layout-name">Classic</div>
          </div>
          <div
            class="layout-option" :class="{ active: design.layout === 'split' }"
            @click="setLayout('split')"
          >
            <div class="layout-thumb lt-split">
              <div class="lt-left"></div>
              <div class="lt-right"></div>
            </div>
            <div class="layout-name">Split</div>
          </div>
          <div
            class="layout-option" :class="{ active: design.layout === 'minimal' }"
            @click="setLayout('minimal')"
          >
            <div class="layout-thumb lt-minimal">
              <div class="lt-strip"></div>
              <div class="lt-img2"></div>
            </div>
            <div class="layout-name">Minimal</div>
          </div>
        </div>
      </div>

      <!-- Artwork Upload -->
      <div>
        <div class="section-label">Event Artwork</div>
        <div class="upload-zone">
          <input type="file" accept="image/png,image/jpeg,image/webp" @change="handleFileUpload">
          <div class="upload-icon-txt" v-if="!artworkSrc">🖼</div>
          <div class="upload-icon-txt" v-else>✅</div>
          <div class="upload-hint" v-if="!artworkSrc">
            <strong>Click to upload</strong> your event poster or artwork<br>
            PNG, JPG, WEBP · max 5MB
          </div>
          <div class="upload-hint" v-else>
            <strong>Image applied</strong><br>Click to change
          </div>
        </div>
      </div>

      <!-- Ticket Tier -->
      <div>
        <div class="section-label">Ticket Tier</div>
        <div class="tier-row tier-row-wrap">
          <button
            v-for="t in ticketTiers" :key="t.id"
            class="tier-btn" :class="{ active: design.tier === t.name }"
            @click="setTier(t.name)"
          >
            <span class="inline-block w-2.5 h-2.5 rounded-full mr-1 align-middle" :style="{ backgroundColor: t.color || '#6C63FF' }"></span>
            {{ t.name }}<br><span class="text-[9px] opacity-60">Rp{{ (t.price || 0).toLocaleString('id-ID') }}</span>
          </button>
        </div>
      </div>

      <!-- Accent Color -->
      <div>
        <div class="section-label">Accent Color</div>
        <div class="preset-row">
          <div
            v-for="c in presetColors" :key="c"
            class="preset-swatch" :class="{ active: design.accentColor === c }"
            :style="{ background: c }"
            @click="pickPreset(c)"
          ></div>
        </div>
        <div class="color-row">
          <div class="color-field">
            <span class="color-label">Accent</span>
            <div class="color-input-wrap">
              <div class="color-swatch" :style="{ background: design.accentColor }">
                <input type="color" :value="design.accentColor" @input="applyColor('accent', ($event.target as HTMLInputElement).value)">
              </div>
              <input class="color-hex" :value="design.accentColor" maxlength="7" @input="applyColor('accent', ($event.target as HTMLInputElement).value)">
            </div>
          </div>
          <div class="color-field">
            <span class="color-label">Background</span>
            <div class="color-input-wrap">
              <div class="color-swatch" :style="{ background: design.bgColor }">
                <input type="color" :value="design.bgColor" @input="applyColor('bg', ($event.target as HTMLInputElement).value)">
              </div>
              <input class="color-hex" :value="design.bgColor" maxlength="7" @input="applyColor('bg', ($event.target as HTMLInputElement).value)">
            </div>
          </div>
          <div class="color-field">
            <span class="color-label">Text</span>
            <div class="color-input-wrap">
              <div class="color-swatch" :style="{ background: design.textColor }">
                <input type="color" :value="design.textColor" @input="applyColor('text', ($event.target as HTMLInputElement).value)">
              </div>
              <input class="color-hex" :value="design.textColor" maxlength="7" @input="applyColor('text', ($event.target as HTMLInputElement).value)">
            </div>
          </div>
        </div>
      </div>

      <!-- Font -->
      <div>
        <div class="section-label">Font Style</div>
        <div class="font-grid">
          <div
            v-for="f in ['syne', 'bebas', 'playfair', 'mono'] as const"
            :key="f"
            class="font-option" :class="{ active: design.font === f }"
            @click="setFont(f)"
          >
            <div class="font-preview" :style="{ fontFamily: fontMap[f] }">Aa</div>
            <div class="font-name">{{ fontLabel[f] }}</div>
          </div>
        </div>
      </div>

      <!-- Save button -->
      <button
        class="save-btn w-full"
        :disabled="saving"
        @click="saveDesign"
      >
        <span v-if="saving" class="material-symbols-outlined animate-spin text-sm">sync</span>
        <span v-else>Save Design</span>
      </button>
    </aside>

    <!-- Right Preview Area -->
    <main class="flex-1 preview-area min-h-[300px]">
      <SkeletonPage v-if="initLoading" type="editor" />

      <template v-else>
        <div class="preview-hint">Live Preview</div>

        <!-- LAYOUT A: Classic -->
        <div v-show="design.layout === 'classic'" class="ticket-wrap">
          <div class="ticket-classic">
            <div class="tc-hero">
              <img v-if="artworkSrc" :src="artworkSrc" alt="">
              <div v-else class="tc-hero-placeholder">🎪</div>
              <div class="tc-hero-overlay"></div>
            </div>
            <div class="tc-accent-bar"></div>
            <div class="tc-body">
              <div class="tc-org">✦ CREATICK PRESENTS</div>
              <div class="tc-event-name" :style="{ fontFamily: fontMap[design.font] }">{{ eventTitle }}</div>
              <div class="tc-event-sub">{{ eventLocation }}</div>
              <div class="tc-meta-row">
                <div class="tc-meta-item">
                  <div class="tc-meta-lbl">Date</div>
                  <div class="tc-meta-val">{{ eventDateFormatted }}</div>
                </div>
                <div class="tc-meta-item">
                  <div class="tc-meta-lbl">Time</div>
                  <div class="tc-meta-val">{{ eventTime }}</div>
                </div>
                <div class="tc-meta-item">
                  <div class="tc-meta-lbl">Gate</div>
                  <div class="tc-meta-val">A</div>
                </div>
              </div>
            </div>
            <div class="tc-divider">
              <div class="tc-notch-l"></div>
              <div class="tc-notch-r"></div>
            </div>
            <div class="tc-bottom">
              <div class="tc-qr-wrap">▦</div>
              <div class="tc-ticket-info">
                <div class="tc-holder-name">Budi Santoso</div>
                <div class="tc-ticket-num">1 of {{ selectedTierQuota }}</div>
                <div class="tc-tier-badge">{{ design.tier }}</div>
              </div>
            </div>
            <div class="tc-creatick">✦ CREATICK · VERIFIED TICKET</div>
          </div>
        </div>

        <!-- LAYOUT B: Split -->
        <div v-show="design.layout === 'split'" class="ticket-wrap">
          <div class="ticket-split">
            <div class="ts-left">
              <img v-if="artworkSrc" :src="artworkSrc" alt="">
              <div v-else class="ts-left-placeholder">🎪</div>
              <div class="ts-left-overlay"></div>
              <div class="ts-accent-side"></div>
            </div>
            <div class="ts-right">
              <div class="ts-top">
                <div class="ts-org">✦ CREATICK PRESENTS</div>
                <div class="ts-event-name" :style="{ fontFamily: fontMap[design.font] }">{{ eventTitle }}</div>
                <div class="ts-event-sub">{{ eventLocation }}</div>
                <div class="ts-meta">
                  <div class="ts-meta-row-item"><span class="ts-meta-icon">📅</span> {{ eventDateFull }}</div>
                  <div class="ts-meta-row-item"><span class="ts-meta-icon">🕗</span> {{ eventTime }} WIB</div>
                  <div class="ts-meta-row-item"><span class="ts-meta-icon">📍</span> {{ eventLocation }}</div>
                </div>
              </div>
              <div class="ts-bottom">
                <div>
                  <div class="ts-holder">Budi Santoso</div>
                  <div class="ts-num">1 of {{ selectedTierQuota }} · Gate A</div>
                </div>
                <div class="ts-right-end">
                  <div class="ts-qr">▦</div>
                  <div class="ts-tier">{{ design.tier }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- LAYOUT C: Minimal -->
        <div v-show="design.layout === 'minimal'" class="ticket-wrap">
          <div class="ticket-minimal">
            <div v-if="!artworkSrc" class="tm-full-placeholder">🎪</div>
            <img v-if="artworkSrc" :src="artworkSrc" class="tm-full-img" alt="">
            <div class="tm-overlay"></div>
            <div class="tm-accent-top"></div>
            <div class="tm-content">
              <div class="tm-top-badge">{{ design.tier }}</div>
              <div class="tm-org">✦ CREATICK PRESENTS</div>
              <div class="tm-event-name" :style="{ fontFamily: fontMap[design.font] }">{{ eventTitle }}</div>
              <div class="tm-event-sub">{{ eventLocation }}</div>
              <div class="tm-divider-line"></div>
              <div class="tm-bottom">
                <div class="tm-left">
                  <div class="tm-holder">Budi Santoso</div>
                  <div class="tm-meta-mini">{{ eventDateFormatted }} · {{ eventTime }}</div>
                  <div class="tm-num">1 of {{ selectedTierQuota }}</div>
                </div>
                <div class="tm-qr">▦</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- Toast -->
    <Teleport to="body">
      <div v-if="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg transition-all"
        :class="toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'"
      >
        {{ toast.message }}
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.section-label {
  font-size: 10px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #7070a0;
  font-family: 'Space Mono', monospace;
  margin-bottom: 12px;
}

.layout-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.layout-option {
  border: 1.5px solid rgba(255,255,255,0.08);
  border-radius: 10px; padding: 10px 6px 8px;
  cursor: pointer; text-align: center;
  transition: border-color 0.15s, background 0.15s;
  background: #1e1e35;
}
.layout-option:hover { border-color: rgba(108,99,255,0.4); }
.layout-option.active { border-color: #6C63FF; background: rgba(108,99,255,0.1); }
.layout-thumb {
  width: 100%; height: 60px; border-radius: 6px;
  background: rgba(255,255,255,0.04);
  margin-bottom: 6px; overflow: hidden; position: relative;
}
.layout-name { font-size: 10px; color: #a0a0c8; letter-spacing: 0.5px; }

.lt-classic .lt-img { width: 100%; height: 32px; background: rgba(108,99,255,0.3); border-radius: 4px 4px 0 0; position: absolute; top: 0; }
.lt-classic .lt-body { position: absolute; bottom: 0; left: 0; right: 0; height: 28px; background: rgba(255,255,255,0.05); border-radius: 0 0 4px 4px; }
.lt-classic .lt-line { position: absolute; bottom: 14px; left: 4px; right: 4px; height: 1px; background: rgba(255,255,255,0.08); }

.lt-split .lt-left { position: absolute; left: 0; top: 0; bottom: 0; width: 45%; background: rgba(108,99,255,0.3); border-radius: 4px 0 0 4px; }
.lt-split .lt-right { position: absolute; right: 0; top: 0; bottom: 0; width: 52%; background: rgba(255,255,255,0.05); border-radius: 0 4px 4px 0; }

.lt-minimal .lt-strip { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: rgba(108,99,255,0.8); border-radius: 4px 4px 0 0; }
.lt-minimal .lt-img2 { position: absolute; right: 4px; top: 8px; width: 22px; height: 22px; background: rgba(108,99,255,0.3); border-radius: 4px; }

.font-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.font-option {
  border: 1.5px solid rgba(255,255,255,0.08); border-radius: 8px;
  padding: 10px 12px; cursor: pointer;
  background: #1e1e35; transition: border-color 0.15s, background 0.15s;
}
.font-option:hover { border-color: rgba(108,99,255,0.4); }
.font-option.active { border-color: #6C63FF; background: rgba(108,99,255,0.1); }
.font-preview { font-size: 18px; color: #e8e8f5; line-height: 1; margin-bottom: 4px; }
.font-name { font-size: 10px; color: #7070a0; font-family: 'Space Mono', monospace; }

.preset-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.preset-swatch {
  width: 28px; height: 28px; border-radius: 6px; cursor: pointer;
  border: 2px solid transparent; transition: border-color 0.15s, transform 0.1s;
  flex-shrink: 0;
}
.preset-swatch:hover { transform: scale(1.1); }
.preset-swatch.active { border-color: #fff; }

.color-row { display: flex; flex-direction: column; gap: 12px; }
.color-field { display: flex; align-items: center; gap: 10px; }
.color-label { font-size: 12px; color: #a0a0c8; width: 80px; flex-shrink: 0; }
.color-input-wrap {
  display: flex; align-items: center; gap: 8px; flex: 1;
  background: #1e1e35; border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px; padding: 6px 10px;
}
.color-swatch {
  width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.15); cursor: pointer; position: relative;
}
.color-swatch input[type=color] {
  position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
}
.color-hex {
  flex: 1; background: transparent; border: none; outline: none;
  color: #e8e8f5; font-family: 'Space Mono', monospace; font-size: 12px;
}

.upload-zone {
  border: 1.5px dashed rgba(255,255,255,0.12);
  border-radius: 10px; padding: 20px 16px;
  text-align: center; cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  background: #1e1e35; position: relative;
}
.upload-zone:hover { border-color: rgba(108,99,255,0.5); background: rgba(108,99,255,0.05); }
.upload-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.upload-icon-txt { font-size: 22px; margin-bottom: 6px; }
.upload-hint { font-size: 11px; color: #7070a0; line-height: 1.5; }
.upload-hint strong { color: #a0a0c8; }

.tier-row { display: flex; gap: 8px; }
.tier-row-wrap { flex-wrap: wrap; }
.tier-btn {
  flex: 1; padding: 8px; border-radius: 8px;
  border: 1.5px solid rgba(255,255,255,0.08); background: #1e1e35;
  color: #a0a0c8; font-size: 12px; font-weight: 600;
  font-family: 'Inter', sans-serif; cursor: pointer;
  transition: all 0.15s;
}
.tier-btn:hover { border-color: rgba(108,99,255,0.5); color: #e8e8f5; }
.tier-btn.active { background: rgba(108,99,255,0.15); border-color: #6C63FF; color: #fff; }

.save-btn {
  background: var(--tk-accent, #6C63FF); color: #fff;
  border: none; border-radius: 8px;
  padding: 9px 22px; font-size: 14px; font-weight: 600;
  font-family: 'Inter', sans-serif; cursor: pointer;
  transition: opacity 0.15s;
}
.save-btn:hover { opacity: 0.85; }
.save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Preview Area ── */
.preview-area {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 48px 32px; gap: 24px;
  background:
    radial-gradient(ellipse at 20% 20%, rgba(108,99,255,0.06) 0%, transparent 60%),
    radial-gradient(ellipse at 80% 80%, rgba(255,101,132,0.04) 0%, transparent 60%);
}
@media (max-width: 1023px) {
  .preview-area { padding: 24px 16px; }
}
.preview-hint { font-size: 11px; color: #7070a0; letter-spacing: 2px; text-transform: uppercase; font-family: 'Space Mono', monospace; }

/* ══════════════════════════════════════
   TICKET — shared base
══════════════════════════════════════ */
.ticket-wrap {
  position: relative;
  filter: drop-shadow(0 32px 80px rgba(0,0,0,0.6));
}

/* ── LAYOUT A: Classic ── */
.ticket-classic {
  width: 100%; max-width: 360px;
  background: var(--tk-bg, #1a1a2e);
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
}
.tc-hero {
  width: 100%; height: 180px; position: relative; overflow: hidden;
  background: rgba(108,99,255,0.25);
  display: flex; align-items: center; justify-content: center;
}
.tc-hero img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
.tc-hero-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to bottom, transparent 40%, var(--tk-bg, #1a1a2e) 100%);
}
.tc-hero-placeholder { font-size: 32px; color: rgba(255,255,255,0.15); z-index: 1; }
.tc-accent-bar {
  height: 3px; background: var(--tk-accent, #6C63FF); width: 100%; position: relative; z-index: 2;
}
.tc-body { padding: 20px 22px 10px; }
.tc-org { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 6px; color: var(--tk-accent, #6C63FF); }
.tc-event-name { font-size: 24px; font-weight: 700; line-height: 1.1; margin-bottom: 4px; color: var(--tk-text, #fff); }
.tc-event-sub { font-size: 12px; margin-bottom: 18px; color: var(--tk-sub, rgba(255,255,255,0.55)); }
.tc-meta-row {
  display: flex; gap: 0; margin-bottom: 16px;
  border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden;
}
.tc-meta-item {
  flex: 1; padding: 10px 12px;
  border-right: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.03);
}
.tc-meta-item:last-child { border-right: none; }
.tc-meta-lbl { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 3px; color: var(--tk-accent, #6C63FF); }
.tc-meta-val { font-size: 13px; font-weight: 600; color: var(--tk-text, #fff); }
.tc-divider {
  display: flex; align-items: center; gap: 0; margin: 0 22px 16px;
  position: relative;
}
.tc-divider::before { content: ''; flex: 1; height: 1px; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0px, rgba(255,255,255,0.1) 6px, transparent 6px, transparent 12px); }
.tc-notch-l { width: 18px; height: 18px; border-radius: 50%; background: var(--tk-bg, #1a1a2e); flex-shrink: 0; }
.tc-notch-r { width: 18px; height: 18px; border-radius: 50%; background: var(--tk-bg, #1a1a2e); flex-shrink: 0; margin-left: auto; }
.tc-bottom { padding: 0 22px 0; display: flex; align-items: center; justify-content: space-between; }
.tc-qr-wrap {
  width: 100px; height: 100px; background: #fff;
  border-radius: 10px; display: flex; align-items: center; justify-content: center;
  font-size: 56px; flex-shrink: 0;
  border: 3px solid rgba(0,0,0,0.08);
}
.tc-ticket-info { flex: 1; padding-left: 16px; }
.tc-holder-name { font-size: 14px; font-weight: 700; margin-bottom: 2px; color: var(--tk-text, #fff); }
.tc-ticket-num { font-family: 'Space Mono', monospace; font-size: 10px; margin-bottom: 8px; color: var(--tk-sub, rgba(255,255,255,0.55)); }
.tc-tier-badge {
  display: inline-block;
  font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 2px;
  padding: 4px 10px; border-radius: 999px;
  background: var(--tk-accent, #6C63FF); color: #fff;
}
.tc-creatick { font-size: 8px; letter-spacing: 1.5px; opacity: 0.25; margin-top: 10px; text-align: center; font-family: 'Space Mono', monospace; padding-bottom: 22px; color: var(--tk-text, #fff); }

/* ── LAYOUT B: Split ── */
.ticket-split {
  width: 100%; max-width: 480px;
  background: var(--tk-bg, #1a1a2e);
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  display: flex; min-height: 260px;
}
.ts-left {
  width: 180px; flex-shrink: 0;
  background: rgba(108,99,255,0.2);
  position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.ts-left img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ts-left-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to right, transparent 60%, var(--tk-bg, #1a1a2e) 100%);
}
.ts-left-placeholder { font-size: 36px; color: rgba(255,255,255,0.12); z-index: 1; }
.ts-accent-side { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--tk-accent, #6C63FF); }
.ts-right { flex: 1; padding: 24px 22px; display: flex; flex-direction: column; justify-content: space-between; }
.ts-top { flex: 1; }
.ts-org { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8px; color: var(--tk-accent, #6C63FF); }
.ts-event-name { font-size: 22px; font-weight: 700; line-height: 1.15; margin-bottom: 4px; color: var(--tk-text, #fff); }
.ts-event-sub { font-size: 11px; margin-bottom: 16px; color: var(--tk-sub, rgba(255,255,255,0.55)); }
.ts-meta { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
.ts-meta-row-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--tk-sub, rgba(255,255,255,0.55)); }
.ts-meta-icon { width: 16px; text-align: center; font-size: 12px; }
.ts-bottom {
  border-top: 1px solid rgba(255,255,255,0.06); padding-top: 14px;
  display: flex; align-items: center; justify-content: space-between;
}
.ts-holder { font-size: 13px; font-weight: 600; color: var(--tk-text, #fff); }
.ts-num { font-family: 'Space Mono', monospace; font-size: 9px; margin-top: 2px; color: var(--tk-sub, rgba(255,255,255,0.55)); }
.ts-right-end { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ts-qr {
  width: 80px; height: 80px; background: #fff; border-radius: 9px;
  display: flex; align-items: center; justify-content: center; font-size: 44px;
  border: 2.5px solid rgba(0,0,0,0.08);
}
.ts-tier {
  font-family: 'Space Mono', monospace; font-size: 8px; letter-spacing: 1.5px;
  padding: 3px 8px; border-radius: 999px;
  background: var(--tk-accent, #6C63FF); color: #fff;
}

/* ── LAYOUT C: Minimal ── */
.ticket-minimal {
  width: 100%; max-width: 360px;
  background: var(--tk-bg, #1a1a2e);
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  position: relative; min-height: 340px;
}
.tm-full-img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
}
.tm-full-placeholder {
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(108,99,255,0.3) 0%, rgba(255,101,132,0.2) 100%);
  display: flex; align-items: center; justify-content: center; font-size: 48px; color: rgba(255,255,255,0.1);
}
.tm-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 55%, rgba(0,0,0,0.92) 100%);
}
.tm-accent-top { position: absolute; top: 0; left: 0; right: 0; height: 4px; background: var(--tk-accent, #6C63FF); z-index: 3; }
.tm-content {
  position: relative; z-index: 2;
  height: 340px; display: flex; flex-direction: column; justify-content: flex-end;
  padding: 20px;
}
.tm-top-badge {
  position: absolute; top: 16px; right: 16px;
  background: var(--tk-accent, #6C63FF); color: #fff;
  font-family: 'Space Mono', monospace; font-size: 9px; letter-spacing: 2px;
  padding: 5px 12px; border-radius: 999px;
}
.tm-org { font-size: 9px; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 6px; color: rgba(255,255,255,0.5); }
.tm-event-name { font-size: 26px; font-weight: 700; line-height: 1.1; color: #fff; margin-bottom: 4px; }
.tm-event-sub { font-size: 11px; color: rgba(255,255,255,0.55); margin-bottom: 16px; }
.tm-divider-line {
  height: 1px; background: repeating-linear-gradient(90deg, rgba(255,255,255,0.15) 0px, rgba(255,255,255,0.15) 5px, transparent 5px, transparent 10px);
  margin-bottom: 14px;
}
.tm-bottom { display: flex; align-items: center; justify-content: space-between; }
.tm-holder { font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 2px; }
.tm-meta-mini { font-size: 10px; color: rgba(255,255,255,0.45); margin-bottom: 6px; }
.tm-num { font-family: 'Space Mono', monospace; font-size: 9px; color: rgba(255,255,255,0.3); }
.tm-qr {
  width: 88px; height: 88px; background: rgba(255,255,255,0.95); border-radius: 10px;
  display: flex; align-items: center; justify-content: center; font-size: 48px;
  border: 2.5px solid rgba(0,0,0,0.08);
}
</style>
