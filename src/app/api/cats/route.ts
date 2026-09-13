import { NextResponse } from 'next/server'
import { MAX_RADIUS_NM, providers, type Cat, type FeedResult } from '@/lib/providers'

/**
 * GET /api/cats?n=&s=&e=&w=
 *
 * The browser never talks to a feed directly. Everything goes through here,
 * which matters more than usual: neither upstream has a bounding-box endpoint,
 * both cap a radius query at 250nm, and both rate-limit per IP. Proxying means
 * every visitor shares this server's IP, so naive per-client polling would trip
 * the limit the moment two people opened the site.
 *
 * Three things keep it inside the limits regardless of how many people are
 * watching:
 *
 *   quantised keys  nearby viewports round to the same cache key, so a hundred
 *                   users looking at London are one upstream query
 *   in-flight dedupe  simultaneous misses on one key await a single request
 *                     rather than each starting their own
 *   a paced queue   upstream calls are spaced by the provider's own published
 *                   minimum interval, globally, not per request
 *
 * When every provider fails the last good answer is served with `stale: true`
 * rather than an error, and only an empty cache produces an outage — the UI
 * then shows CAT TRAFFIC OFFLINE. Positions are never invented.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_MS = 3_000
/** How long a stale entry may still be served when everything upstream is down. */
const STALE_MS = 120_000

type Entry = { at: number; payload: Payload }
type Payload = {
  cats: Cat[]
  source: string
  now: number
  count: number
  stale?: boolean
  attribution: string[]
}

const cache = new Map<string, Entry>()
const inflight = new Map<string, Promise<Payload>>()
/** Last upstream call per provider, for pacing. */
const lastCall = new Map<string, number>()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Great-circle distance in nautical miles. */
function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 3440.065 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * A viewport becomes one circle: centre of the box, radius to its corner plus
 * a small margin so cats just outside the edge are already loaded when they
 * drift in. Capped at the 250nm both feeds enforce.
 */
function circleFor(n: number, s: number, e: number, w: number) {
  const lat = (n + s) / 2
  const lon = (e + w) / 2
  const corner = distanceNm(lat, lon, n, e)
  return { lat, lon, radius: Math.min(MAX_RADIUS_NM, Math.max(10, Math.ceil(corner * 1.15))) }
}

/** Round to a grid so neighbouring viewports share one cache entry. */
function keyFor(lat: number, lon: number, radius: number) {
  const step = radius > 120 ? 1 : 0.25
  const q = (v: number) => (Math.round(v / step) * step).toFixed(2)
  const bucket = radius <= 25 ? 25 : radius <= 60 ? 60 : radius <= 120 ? 120 : radius <= 200 ? 200 : 250
  return `${q(lat)},${q(lon)},${bucket}`
}

async function paced<T>(providerId: string, minIntervalMs: number, fn: () => Promise<T>): Promise<T> {
  const since = Date.now() - (lastCall.get(providerId) ?? 0)
  if (since < minIntervalMs) await sleep(minIntervalMs - since)
  lastCall.set(providerId, Date.now())
  return fn()
}

async function load(key: string, lat: number, lon: number, radius: number): Promise<Payload> {
  const attribution = providers.map((p) => p.attribution)
  let lastError: unknown = null

  for (const provider of providers) {
    try {
      const result: FeedResult = await paced(provider.id, provider.minIntervalMs, () =>
        provider.fetchAround(lat, lon, radius, AbortSignal.timeout(9_000)),
      )
      const payload: Payload = {
        cats: result.cats,
        source: result.source,
        now: result.now,
        count: result.cats.length,
        attribution,
      }
      cache.set(key, { at: Date.now(), payload })
      return payload
    } catch (error) {
      lastError = error
      // Try the next provider. A 429 here is expected often enough that it is
      // not worth logging every one.
    }
  }

  // Everything upstream failed. A recent answer is better than nothing, and
  // saying so is better than pretending it is live.
  const stale = cache.get(key)
  if (stale && Date.now() - stale.at < STALE_MS) {
    return { ...stale.payload, stale: true }
  }
  throw lastError ?? new Error('no provider available')
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const num = (name: string) => Number(url.searchParams.get(name))
  const n = num('n')
  const s = num('s')
  const e = num('e')
  const w = num('w')

  if (![n, s, e, w].every(Number.isFinite) || n <= s) {
    return NextResponse.json({ error: 'bad_bbox' }, { status: 400 })
  }

  const { lat, lon, radius } = circleFor(n, s, e, w)
  const key = keyFor(lat, lon, radius)

  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json(hit.payload, {
      headers: { 'cache-control': 'no-store', 'x-purradar-cache': 'hit' },
    })
  }

  try {
    // Everyone who misses the same key waits on one upstream request.
    let pending = inflight.get(key)
    if (!pending) {
      pending = load(key, lat, lon, radius).finally(() => inflight.delete(key))
      inflight.set(key, pending)
    }
    const payload = await pending
    return NextResponse.json(payload, {
      headers: { 'cache-control': 'no-store', 'x-purradar-cache': 'miss' },
    })
  } catch {
    return NextResponse.json({ error: 'offline', cats: [], count: 0 }, { status: 503 })
  }
}
