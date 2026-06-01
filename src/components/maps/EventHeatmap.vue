<script lang="ts">
import { defineComponent, ref, computed, onMounted, onUnmounted, watch, nextTick, type PropType } from 'vue'
import { useDarkMode } from '@/composables/useDarkMode'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

type HeatPoint = {
  lat: number
  lng: number
  intensity?: number
  label?: string
  subtitle?: string
}

export default defineComponent({
  name: 'EventHeatmap',
  props: {
    points: {
      type: Array as PropType<HeatPoint[]>,
      required: true
    },
    zoom: Number,
    title: String,
    minZoom: Number,
    maxZoom: Number,
    containerClass: {
      type: String,
      default: 'min-h-[520px] h-[58vh]'
    }
  },
  setup(props) {
    const mapContainer = ref<HTMLDivElement | null>(null)
    const mapInstance = ref<L.Map | null>(null)
    const markerLayer = ref<L.LayerGroup | null>(null)
    const { isDark } = useDarkMode()

    const tileUrl = computed(() =>
      isDark.value
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    )

    const tileAttribution = '&copy; OpenStreetMap contributors &copy; CARTO'
    const defaultCenter = L.latLng(-2.5, 118.0)
    const indonesiaBounds = L.latLngBounds([[-11.2, 95.6], [6.3, 141.0]])
    const defaultZoom = props.zoom || 5

    const getCircleColor = (intensity: number) => {
      if (intensity >= 4) return '#fb7185'
      if (intensity >= 2) return '#f59e0b'
      return '#22c55e'
    }

    const updatePoints = () => {
      if (!mapInstance.value || !markerLayer.value) return
      const layer = markerLayer.value
      layer.clearLayers()

      if (!props.points || props.points.length === 0) {
        mapInstance.value.fitBounds(indonesiaBounds, { padding: [24, 24] })
        return
      }

      const latLngs: L.LatLngExpression[] = []
      props.points.forEach((point: HeatPoint) => {
        const lat = point.lat
        const lng = point.lng
        if (typeof lat !== 'number' || typeof lng !== 'number') return

        latLngs.push([lat, lng])
        const intensity = Math.min(Math.max(point.intensity ?? 1, 1), 5)
        const radius = 4 + intensity * 1.5
        const color = getCircleColor(intensity)

        const circle = L.circleMarker([lat, lng], {
          radius,
          fillColor: color,
          color,
          fillOpacity: 0.55,
          opacity: 0.9,
          weight: 0
        })

        const tooltipLines = [point.label || 'Lokasi Acara']
        if (point.subtitle) tooltipLines.push(point.subtitle)
        circle.bindTooltip(tooltipLines.join('<br/>'), { direction: 'top', offset: [0, -8], opacity: 0.9 })
        circle.addTo(layer as any)
      })

      mapInstance.value.fitBounds(indonesiaBounds, { padding: [24, 24] })
    }

    const setupMap = async () => {
      if (!mapContainer.value) return
      await nextTick()

      if (mapInstance.value) {
        mapInstance.value.off()
        mapInstance.value.remove()
      }

      mapInstance.value = L.map(mapContainer.value, {
        center: defaultCenter,
        zoom: defaultZoom,
        minZoom: props.minZoom ?? 4,
        maxZoom: props.maxZoom ?? 12,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        dragging: true,
        touchZoom: true,
        boxZoom: true,
        keyboard: false,
        zoomControl: true,
        attributionControl: false,
        maxBounds: indonesiaBounds,
        maxBoundsViscosity: 1.0
      })

      L.tileLayer(tileUrl.value, {
        attribution: tileAttribution,
        maxZoom: props.maxZoom ?? 12,
        minZoom: props.minZoom ?? 3
      }).addTo(mapInstance.value as any)

      const layerGroup = L.layerGroup()
      layerGroup.addTo(mapInstance.value as any)
      markerLayer.value = layerGroup
      updatePoints()
    }

    const updateTileLayer = () => {
      if (!mapInstance.value) return
      mapInstance.value.eachLayer(layer => {
        if ((layer as any).setUrl && !(layer as any)._url?.includes('stamen')) {
          ;(layer as any).setUrl(tileUrl.value)
        }
      })
    }

    onMounted(async () => {
      await setupMap()
    })

    watch(() => props.points, () => {
      updatePoints()
    }, { deep: true })

    watch(isDark, () => {
      updateTileLayer()
    })

    onUnmounted(() => {
      if (mapInstance.value) {
        mapInstance.value.remove()
        mapInstance.value = null
      }
    })

    return {
      mapContainer,
      props
    }
  }
})
</script>

<template>
  <div class="bg-surface-card rounded-3xl border border-border/50 overflow-hidden shadow-sm">
    <div v-if="props.title" class="px-5 py-4 border-b border-border/50">
      <h3 class="text-base font-semibold text-text-heading">{{ props.title }}</h3>
    </div>
    <div :class="['w-full', props.containerClass]">
      <div ref="mapContainer" class="w-full h-full"></div>
    </div>
  </div>
</template>

<style scoped>
:deep(.leaflet-container) {
  height: 100%;
  width: 100%;
  z-index: 10;
}

</style>
