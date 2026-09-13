'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  AttributionControl,
  FullscreenControl,
  GeoJSONSource,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type FilterSpecification,
  type MapLayerMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ICON_OFFSET, SPRITE_PIXEL_RATIO, allSprites, spriteId } from '@/lib/catSprites'
import { breedFor, catCallsign, isHeavy, isRotor, scaleFor, statusFor } from '@/lib/catspeak'
import { CatTracker } from '@/lib/interpolate'
import type { Cat } from '@/lib/providers'

/**
 * The map.
 *
 * Every cat is one feature in a single GeoJSON source feeding a symbol layer —
 * not a DOM marker. Thousands of DOM nodes would make panning unusable, and
 * MapLibre already draws symbols on the GPU. Updates call setData on the
 * source; the layers are added once and never rebuilt.
 *
 * The render loop and the poll loop are separate on purpose. The feed answers
 * every few seconds, and a rAF loop walks the cats between those fixes at
 * ~12fps — enough for the motion to read as gliding without spending the frame
 * budget rebuilding GeoJSON sixty times a second. Anything that only changes
 * when the feed does — trails, cat piles — is built on the poll instead.
 */

/**
 * MapLibre resolves its worker relative to `import.meta.url`, which the bundler
 * rewrites — the worker then 404s, no tiles load, and the map stays blank
 * without raising anything. scripts/copy-maplibre-worker.mjs puts a matching
 * copy in public/maplibre at build time.
 */
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')

/** Below this, one 250nm query cannot honestly fill the screen. */
export const MIN_ZOOM_FOR_CATS = 5.2
const POLL_MS = 4000
const SETDATA_MS = 80 // ~12fps

const SRC = 'cats'
const SRC_TRAILS = 'cat-trails'
const SRC_PILES = 'cat-piles'

const LAYER_TRAILS = 'cat-trail-lines'
const LAYER_HALO = 'cat-halo'
const LAYER_CATS = 'cat-symbols'
const LAYER_PILES = 'cat-pile-circles'
const LAYER_PILE_LEAF = 'cat-pile-leaves'
const LAYER_PILE_COUNT = 'cat-pile-counts'

/** A fresh empty collection each call — MapLibre's setData wants a mutable one. */
const noFeatures = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] })

/**
 * Everything the layers need to know about one cat. Shared by the frame loop
 * and the pile source so a cat cannot look like two different animals
 * depending on which layer drew it.
 */
function decorate(cat: Cat): Record<string, unknown> {
  const status = statusFor(cat)
  return {
    icon: spriteId(breedFor(cat.hex, cat.category)),
    scale: scaleFor(cat.category),
    label: catCallsign(cat.flight, cat.hex),
    tone: status.tone,
    alt: cat.alt_baro ?? 0,
    gs: cat.gs ?? 0,
    ground: cat.on_ground,
    heavy: isHeavy(cat.category),
    rotor: isRotor(cat.category),
  }
}

export type CatFilter = 'all' | 'zoomies' | 'loafing' | 'high' | 'heavy' | 'sus'

/** Filters run as layer expressions so a change costs no JavaScript at all. */
const FILTERS: Record<CatFilter, FilterSpecification | null> = {
  all: null,
  zoomies: ['>', ['get', 'gs'], 400],
  loafing: ['==', ['get', 'ground'], true],
  high: ['>', ['get', 'alt'], 35000],
  heavy: ['==', ['get', 'heavy'], true],
  sus: ['==', ['get', 'tone'], 'suspicious'],
}

/**
 * Icon size by zoom, times each cat's own scale.
 *
 * The multiply has to live inside the interpolate outputs: the style spec only
 * allows a zoom expression at the top level of a property, never nested inside
 * another one.
 *
 * The ramp is steep on purpose — a cat big enough to read close in becomes a
 * carpet when seven hundred of them share a continent.
 */
function sizeRamp(chaos: boolean, compact = false): ExpressionSpecification {
  const at = (base: number): ExpressionSpecification => [
    '*',
    ['get', 'scale'],
    (chaos ? base * 1.45 : base) * (compact ? 0.72 : 1),
  ]
  return ['interpolate', ['linear'], ['zoom'], 4, at(0.2), 6, at(0.32), 8, at(0.62), 12, at(0.95)]
}

/**
 * Callsigns are the joke, but at continent scale they bury the cats. They fade
 * in as the view tightens enough for them to be readable.
 */
function labelOpacity(show: boolean): ExpressionSpecification | number {
  if (!show) return 0
  return ['interpolate', ['linear'], ['zoom'], 6, 0, 7.2, 1]
}

export type MapStatus = {
  count: number
  source: string | null
  stale: boolean
  offline: boolean
  tooFarOut: boolean
}

export type CatMapProps = {
  onStatus?: (s: MapStatus) => void
  onCats?: (cats: Cat[]) => void
  onSelect?: (hex: string | null) => void
  selectedHex?: string | null
  /** Set to a hex to centre the map on that cat. */
  focusHex?: string | null
  showLabels?: boolean
  showTrails?: boolean
  clustered?: boolean
  chaos?: boolean
  filter?: CatFilter
}

function CatMapInner({
  onStatus,
  onCats,
  onSelect,
  selectedHex = null,
  focusHex = null,
  showLabels = true,
  showTrails = false,
  clustered = false,
  chaos = false,
  filter = 'all',
}: CatMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const tracker = useRef(new CatTracker(POLL_MS))
  const ready = useRef(false)
  const [loaded, setLoaded] = useState(false)
  // A cat sized for a laptop is a billboard on a 375px screen.
  const [compact, setCompact] = useState(false)

  /**
   * Trails belong to individual cats, so they are hidden under the piles —
   * otherwise the map shows paths leading to nothing. A selected cat always
   * gets its own trail, whether or not the toggle is on.
   */
  function trailData(showTrails: boolean, clustered: boolean, selectedHex: string | null) {
    if (clustered) return noFeatures()
    if (showTrails) return tracker.current.trailsGeoJSON()
    return selectedHex ? tracker.current.trailsGeoJSON(selectedHex) : noFeatures()
  }

  // Props the poll loop reads. Kept in a ref so a toggle never restarts polling.
  const opts = useRef({ showTrails, clustered, selectedHex })
  useEffect(() => {
    opts.current = { showTrails, clustered, selectedHex }
  }, [showTrails, clustered, selectedHex])

  const status = useRef<MapStatus>({
    count: 0,
    source: null,
    stale: false,
    offline: false,
    tooFarOut: false,
  })
  const emit = useCallback(
    (next: Partial<MapStatus>) => {
      status.current = { ...status.current, ...next }
      onStatus?.(status.current)
    },
    [onStatus],
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  /* ---------------------------------------------------------------- map init */
  useEffect(() => {
    if (!container.current || map.current) return

    const m = new MapLibreMap({
      container: container.current,
      // OpenFreeMap: no key, no request cap, commercial use allowed.
      // Attribution is required and is rendered in the corner.
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [-81.3, 28.4],
      zoom: 7,
      // Keeps #zoom/lat/lon in the URL, so a view of the cats is shareable and
      // survives a refresh.
      hash: true,
      attributionControl: false,
      // Cats are the point; the basemap should not compete.
      maxZoom: 14,
      minZoom: 2,
    })
    map.current = m

    m.addControl(
      new AttributionControl({
        compact: true,
        // The basemap carries its own OpenFreeMap/OpenStreetMap credit; this
        // adds the feed's, which adsb.fi requires with a link.
        customAttribution:
          'Live ADS-B by <a href="https://adsb.fi" target="_blank" rel="noreferrer">adsb.fi</a>',
      }),
      'bottom-right',
    )
    m.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    m.addControl(new FullscreenControl(), 'bottom-right')

    // A style or tile failure would otherwise vanish; the cats would simply
    // never appear and nothing would say why.
    m.on('error', (e) => console.warn('[purradar] map error:', e.error?.message ?? e))

    m.on('load', async () => {
      // Tint the basemap toward the brand: deep navy land, near-black water.
      try {
        for (const layer of m.getStyle().layers ?? []) {
          if (layer.type === 'background') m.setPaintProperty(layer.id, 'background-color', '#070b1c')
          if (layer.id.includes('water')) m.setPaintProperty(layer.id, 'fill-color', '#04060f')
          if (layer.type === 'symbol' && layer.layout?.['text-field']) {
            m.setPaintProperty(layer.id, 'text-color', '#5b6480')
            m.setPaintProperty(layer.id, 'text-halo-color', '#04060f')
          }
        }
      } catch {
        // A style change upstream should never stop the cats rendering.
      }

      await Promise.all(
        allSprites().map(async ({ id, url }) => {
          if (m.hasImage(id)) return
          try {
            const { data } = await m.loadImage(url)
            m.addImage(id, data, { pixelRatio: SPRITE_PIXEL_RATIO })
          } catch {
            /* one missing sprite must not take down the whole layer */
          }
        }),
      )

      m.addSource(SRC, { type: 'geojson', data: noFeatures() })
      m.addSource(SRC_TRAILS, { type: 'geojson', data: noFeatures() })
      m.addSource(SRC_PILES, {
        type: 'geojson',
        data: noFeatures(),
        cluster: true,
        clusterRadius: 60,
        clusterMaxZoom: 12,
      })

      m.addLayer({
        id: LAYER_TRAILS,
        type: 'line',
        source: SRC_TRAILS,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#22e0ff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.4, 10, 3],
          'line-opacity': 0.55,
          'line-blur': 0.6,
        },
      })

      // Sits under the selected cat. A ring rather than a swap of the sprite,
      // so the cat you clicked still looks like itself.
      m.addLayer({
        id: LAYER_HALO,
        type: 'circle',
        source: SRC,
        filter: ['==', ['get', 'hex'], ''],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 14, 10, 30],
          'circle-color': '#ff4fa3',
          'circle-opacity': 0.18,
          'circle-stroke-color': '#ff4fa3',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.9,
        },
      })

      m.addLayer({
        id: LAYER_CATS,
        type: 'symbol',
        source: SRC,
        layout: {
          'icon-image': ['get', 'icon'],
          'icon-size': sizeRamp(false),
          'icon-offset': ICON_OFFSET,
          // The cat is drawn nose-up, so the track goes in unmodified.
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          // The cat is tall and rotates, so a fixed side would sit on its tail
          // as often as not. Let the label take whichever side is free.
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
          'text-radial-offset': 2.6,
          'text-justify': 'auto',
          'text-allow-overlap': false,
          'text-optional': true,
        },
        paint: {
          'text-color': '#dfe6ff',
          'text-halo-color': '#04060f',
          'text-halo-width': 1.4,
          'text-opacity': labelOpacity(showLabels),
        },
      })

      // Optional: cats gathered into piles. Off by default — the swarm is the
      // point of the thing — but it is the only readable way to see a whole
      // continent at once.
      m.addLayer({
        id: LAYER_PILES,
        type: 'circle',
        source: SRC_PILES,
        filter: ['has', 'point_count'],
        layout: { visibility: 'none' },
        paint: {
          'circle-color': '#ff4fa3',
          'circle-opacity': 0.22,
          'circle-stroke-color': '#ff4fa3',
          'circle-stroke-width': 1.5,
          'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 14, 50, 26, 300, 42],
        },
      })
      // A point with no neighbours never becomes a pile, so without this layer
      // every lone cat would simply vanish when piles are switched on.
      m.addLayer({
        id: LAYER_PILE_LEAF,
        type: 'symbol',
        source: SRC_PILES,
        filter: ['!', ['has', 'point_count']],
        layout: {
          visibility: 'none',
          'icon-image': ['get', 'icon'],
          'icon-size': sizeRamp(false),
          'icon-offset': ICON_OFFSET,
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      })

      m.addLayer({
        id: LAYER_PILE_COUNT,
        type: 'symbol',
        source: SRC_PILES,
        filter: ['has', 'point_count'],
        layout: {
          visibility: 'none',
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#3d0b23', 'text-halo-width': 1.2 },
      })

      m.on('click', LAYER_CATS, (e: MapLayerMouseEvent) => {
        const hex = e.features?.[0]?.properties?.hex as string | undefined
        if (hex) onSelect?.(hex)
      })
      // A click on the map itself, not on a cat, closes the card.
      m.on('click', (e: MapLayerMouseEvent) => {
        if (m.queryRenderedFeatures(e.point, { layers: [LAYER_CATS] }).length === 0) {
          onSelect?.(null)
        }
      })
      m.on('click', LAYER_PILES, (e: MapLayerMouseEvent) => {
        const zoom = m.getZoom()
        m.easeTo({ center: e.lngLat, zoom: Math.min(14, zoom + 2) })
      })
      for (const layer of [LAYER_CATS, LAYER_PILES]) {
        m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'))
        m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''))
      }

      ready.current = true
      setLoaded(true)
    })

    return () => {
      ready.current = false
      m.remove()
      map.current = null
    }
    // Mount once. Prop changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ------------------------------------------------------------------ polling */
  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    /** Everything that only changes when the feed does. */
    const refreshDerived = () => {
      const m = map.current
      if (!m) return
      const { showTrails, clustered, selectedHex } = opts.current

      const trails = m.getSource(SRC_TRAILS) as GeoJSONSource | undefined
      if (trails) trails.setData(trailData(showTrails, clustered, selectedHex))

      const piles = m.getSource(SRC_PILES) as GeoJSONSource | undefined
      if (piles) {
        piles.setData(
          clustered
            ? tracker.current.toGeoJSON(Date.now(), decorate)
            : noFeatures(),
        )
      }
    }

    const poll = async () => {
      const m = map.current
      if (!m || !ready.current) return

      if (m.getZoom() < MIN_ZOOM_FOR_CATS) {
        tracker.current.clear()
        for (const id of [SRC, SRC_TRAILS, SRC_PILES]) {
          ;(m.getSource(id) as GeoJSONSource | undefined)?.setData(noFeatures())
        }
        emit({ tooFarOut: true, count: 0, offline: false })
        onCats?.([])
        return
      }

      const b = m.getBounds()
      const url = `/api/cats?n=${b.getNorth().toFixed(4)}&s=${b.getSouth().toFixed(4)}&e=${b.getEast().toFixed(4)}&w=${b.getWest().toFixed(4)}`
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { cats: Cat[]; source: string; stale?: boolean }
        if (cancelled) return
        const count = tracker.current.update(data.cats)
        refreshDerived()
        emit({
          count,
          source: data.source,
          stale: Boolean(data.stale),
          offline: false,
          tooFarOut: false,
        })
        onCats?.(tracker.current.all())
      } catch {
        if (!cancelled) emit({ offline: true })
      }
    }

    const loop = () => {
      void poll()
      timer = window.setTimeout(loop, POLL_MS)
    }
    // Wait for the style to finish before the first poll.
    const start = window.setTimeout(loop, loaded ? 0 : 600)

    const onMoveEnd = () => void poll()
    map.current?.on('moveend', onMoveEnd)

    return () => {
      cancelled = true
      window.clearTimeout(start)
      if (timer) window.clearTimeout(timer)
      map.current?.off('moveend', onMoveEnd)
    }
  }, [loaded, emit, onCats])

  /* ------------------------------------------------------------- render loop */
  useEffect(() => {
    if (!loaded) return
    let frame = 0
    let lastPush = 0

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncMotion = () => {
      tracker.current.frozen = motion.matches
    }
    syncMotion()
    motion.addEventListener('change', syncMotion)

    const tick = (time: number) => {
      frame = requestAnimationFrame(tick)
      // Throttled: rebuilding GeoJSON every frame is wasted work, and the eye
      // cannot tell 12fps of glide from 60. Frozen cats only need redrawing
      // when the feed has actually said something new.
      if (time - lastPush < (motion.matches ? 1000 : SETDATA_MS)) return
      lastPush = time

      const m = map.current
      const src = m?.getSource(SRC) as GeoJSONSource | undefined
      if (!src) return

      src.setData(tracker.current.toGeoJSON(Date.now(), decorate))
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      motion.removeEventListener('change', syncMotion)
    }
  }, [loaded])

  /* --------------------------------------------------------------- prop sync */
  useEffect(() => {
    const m = map.current
    if (!m || !loaded || !m.getLayer(LAYER_CATS)) return
    m.setPaintProperty(LAYER_CATS, 'text-opacity', labelOpacity(showLabels))
  }, [showLabels, loaded])

  useEffect(() => {
    const m = map.current
    if (!m || !loaded || !m.getLayer(LAYER_CATS)) return
    for (const id of [LAYER_CATS, LAYER_PILE_LEAF]) {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'icon-size', sizeRamp(chaos, compact))
    }
  }, [chaos, compact, loaded])

  useEffect(() => {
    const m = map.current
    if (!m || !loaded || !m.getLayer(LAYER_CATS)) return
    m.setFilter(LAYER_CATS, FILTERS[filter])
  }, [filter, loaded])

  useEffect(() => {
    const m = map.current
    if (!m || !loaded || !m.getLayer(LAYER_HALO)) return
    m.setFilter(LAYER_HALO, ['==', ['get', 'hex'], selectedHex ?? ''])
  }, [selectedHex, loaded])

  // Trails and piles are built on the poll, so a toggle has to ask for one now
  // rather than wait up to four seconds to take effect.
  useEffect(() => {
    const m = map.current
    if (!m || !loaded) return
    const visible = clustered ? 'visible' : 'none'
    for (const id of [LAYER_PILES, LAYER_PILE_LEAF, LAYER_PILE_COUNT]) {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', visible)
    }
    if (m.getLayer(LAYER_CATS)) {
      m.setLayoutProperty(LAYER_CATS, 'visibility', clustered ? 'none' : 'visible')
    }
    const piles = m.getSource(SRC_PILES) as GeoJSONSource | undefined
    piles?.setData(
      clustered
        ? tracker.current.toGeoJSON(Date.now(), decorate)
        : noFeatures(),
    )
  }, [clustered, loaded])

  useEffect(() => {
    const m = map.current
    if (!m || !loaded) return
    const trails = m.getSource(SRC_TRAILS) as GeoJSONSource | undefined
    trails?.setData(trailData(showTrails, clustered, selectedHex))
  }, [showTrails, clustered, selectedHex, loaded])

  useEffect(() => {
    const m = map.current
    if (!m || !loaded || !focusHex) return
    const t = tracker.current.get(focusHex)
    if (!t) return
    m.easeTo({
      center: [t.cat.lon, t.cat.lat],
      zoom: Math.max(m.getZoom(), 8.5),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900,
    })
  }, [focusHex, loaded])

  // Sized, not positioned: maplibre-gl.css loads after Tailwind and its own
  // `.maplibregl-map { position: relative }` would win over `absolute inset-0`,
  // collapsing the container to zero height.
  return <div ref={container} className="h-full w-full" aria-label="Live cat traffic map" />
}

export const CatMap = memo(CatMapInner)
