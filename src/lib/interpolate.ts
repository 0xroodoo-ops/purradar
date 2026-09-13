import type { Cat } from './providers'

/**
 * Dead reckoning between polls.
 *
 * The feed answers every few seconds; without this the cats teleport. Each one
 * keeps the fix it was last drawn at and the fix it is heading to, and the
 * render loop walks between them. Once it arrives and no new fix has come in,
 * it keeps going along its own track at its own ground speed rather than
 * freezing — which is both smoother and closer to the truth, since the
 * aircraft did not stop.
 *
 * Extrapolation is capped: a cat that has heard nothing for a while should
 * stop confidently inventing distance.
 */

export type Tracked = {
  cat: Cat
  /** Where it was drawn when the last fix arrived. */
  fromLon: number
  fromLat: number
  /** Where that fix says it is. */
  toLon: number
  toLat: number
  /** ms timestamps bounding the walk. */
  t0: number
  t1: number
  /** Smoothed heading, so a cat never spins the long way round. */
  bearing: number
  /** When the feed last mentioned it. */
  seen: number
  /** Recent reported fixes, oldest first, for the trail. */
  history: [number, number][]
}

/** Beyond this with no update, stop extrapolating. */
const MAX_EXTRAPOLATE_MS = 20_000
/** Drop a cat the feed has not mentioned for this long. */
export const STALE_MS = 60_000
/** Trail length. At one fix every few seconds this is a couple of minutes. */
const MAX_HISTORY = 30

/** Shortest signed angular difference, so 350° → 10° turns +20 and not −340. */
function angleDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

export function bearingBetween(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const toRad = Math.PI / 180
  const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad)
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad)
  return (Math.atan2(y, x) * 180) / Math.PI
}

/** Project a point along a bearing. Flat-earth is fine over a few miles. */
function project(lon: number, lat: number, bearingDeg: number, distanceNm: number) {
  const rad = (bearingDeg * Math.PI) / 180
  const dLat = (distanceNm * Math.cos(rad)) / 60
  const dLon = (distanceNm * Math.sin(rad)) / (60 * Math.cos((lat * Math.PI) / 180) || 1e-6)
  return { lon: lon + dLon, lat: lat + dLat }
}

export class CatTracker {
  private tracked = new Map<string, Tracked>()
  /** Expected gap between fixes, used as the walk duration. */
  private intervalMs: number
  /**
   * When set, cats are drawn at their last reported fix and nothing is
   * interpolated or extrapolated. This is what `prefers-reduced-motion` gets:
   * positions still update as the feed reports them, but nothing glides.
   */
  frozen = false

  constructor(intervalMs = 4000) {
    this.intervalMs = intervalMs
  }

  get size(): number {
    return this.tracked.size
  }

  /** Feed a fresh poll in. Returns how many cats are being followed. */
  update(cats: Cat[], now = Date.now()): number {
    for (const cat of cats) {
      const existing = this.tracked.get(cat.hex)

      if (!existing) {
        // First sighting: it starts where it is, with its reported heading, or
        // failing that pointing north until a second fix gives it a bearing.
        this.tracked.set(cat.hex, {
          cat,
          fromLon: cat.lon,
          fromLat: cat.lat,
          toLon: cat.lon,
          toLat: cat.lat,
          t0: now,
          t1: now,
          bearing: cat.track ?? 0,
          seen: now,
          history: [[cat.lon, cat.lat]],
        })
        continue
      }

      const here = this.positionOf(existing, now)
      // Many aircraft never report track. Two fixes give a real bearing, which
      // is better than leaving the cat pointing north.
      const moved = Math.abs(cat.lon - existing.toLon) > 1e-6 || Math.abs(cat.lat - existing.toLat) > 1e-6
      const reported = cat.track
      const derived = moved ? bearingBetween(existing.toLon, existing.toLat, cat.lon, cat.lat) : null
      const target = reported ?? derived ?? existing.bearing

      existing.cat = cat
      existing.fromLon = here.lon
      existing.fromLat = here.lat
      existing.toLon = cat.lon
      existing.toLat = cat.lat
      existing.t0 = now
      existing.t1 = now + this.intervalMs
      // Ease toward the new heading instead of snapping.
      existing.bearing = existing.bearing + angleDelta(existing.bearing, target) * 0.5
      existing.seen = now
      if (moved) {
        existing.history.push([cat.lon, cat.lat])
        if (existing.history.length > MAX_HISTORY) existing.history.shift()
      }
    }

    for (const [hex, t] of this.tracked) {
      if (now - t.seen > STALE_MS) this.tracked.delete(hex)
    }
    return this.tracked.size
  }

  /** Where a cat should be drawn right now. */
  private positionOf(t: Tracked, now: number): { lon: number; lat: number } {
    if (this.frozen) return { lon: t.toLon, lat: t.toLat }

    const span = t.t1 - t.t0
    if (span <= 0) return { lon: t.toLon, lat: t.toLat }

    const f = (now - t.t0) / span
    if (f <= 1) {
      return {
        lon: t.fromLon + (t.toLon - t.fromLon) * f,
        lat: t.fromLat + (t.toLat - t.fromLat) * f,
      }
    }

    // Past the known fix: keep flying, but not forever.
    const overshootMs = Math.min((now - t.t1), MAX_EXTRAPOLATE_MS)
    const knots = t.cat.on_ground ? 0 : (t.cat.gs ?? 0)
    if (knots <= 0) return { lon: t.toLon, lat: t.toLat }
    const nm = (knots * overshootMs) / 3_600_000
    return project(t.toLon, t.toLat, t.bearing, nm)
  }

  /** A GeoJSON FeatureCollection for the map source. */
  toGeoJSON(
    now: number,
    decorate: (cat: Cat) => Record<string, unknown>,
  ): GeoJSON.FeatureCollection<GeoJSON.Point> {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = []
    for (const t of this.tracked.values()) {
      const { lon, lat } = this.positionOf(t, now)
      features.push({
        type: 'Feature',
        id: parseInt(t.cat.hex, 16) || undefined,
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { hex: t.cat.hex, bearing: Math.round(t.bearing), ...decorate(t.cat) },
      })
    }
    return { type: 'FeatureCollection', features }
  }

  /**
   * Where each cat has been. Built on the poll rather than the frame: a trail
   * only gains a point when the feed reports one, so redrawing it at 12fps
   * would be pure waste.
   */
  trailsGeoJSON(only?: string | null): GeoJSON.FeatureCollection<GeoJSON.LineString> {
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = []
    for (const t of this.tracked.values()) {
      if (only && t.cat.hex !== only) continue
      if (t.history.length < 2) continue
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: t.history },
        properties: { hex: t.cat.hex },
      })
    }
    return { type: 'FeatureCollection', features }
  }

  /** Every cat currently followed, for search and the counters. */
  all(): Cat[] {
    return Array.from(this.tracked.values(), (t) => t.cat)
  }

  get(hex: string): Tracked | undefined {
    return this.tracked.get(hex)
  }

  clear() {
    this.tracked.clear()
  }
}
