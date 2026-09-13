import { normalize, type AircraftProvider, type FeedResult } from './types'

/**
 * adsb.fi — the primary feed.
 *
 * Published limit is 1 request per second on the public endpoints, and their
 * terms require citing adsb.fi with a link to their home page. Personal,
 * non-commercial use only — see the README.
 */
export const adsbfi: AircraftProvider = {
  id: 'adsb.fi',
  attribution: 'Live ADS-B by <a href="https://adsb.fi" target="_blank" rel="noreferrer">adsb.fi</a>',
  // Their stated ceiling is 1/sec; leave headroom so a burst never trips it.
  minIntervalMs: 1200,

  async fetchAround(lat, lon, radiusNm, signal): Promise<FeedResult> {
    const url = `https://opendata.adsb.fi/api/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${Math.round(radiusNm)}`
    const res = await fetch(url, {
      signal,
      headers: { accept: 'application/json', 'user-agent': 'PURRADAR/0.1 (+https://github.com/0xroodoo-ops/purradar)' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`adsb.fi ${res.status}`)
    const data = (await res.json()) as { ac?: unknown[]; aircraft?: unknown[]; now?: number }
    const list = data.ac ?? data.aircraft ?? []
    return {
      cats: list.map(normalize).filter((c): c is NonNullable<typeof c> => c !== null),
      source: 'adsb.fi',
      now: data.now ?? Date.now(),
    }
  },

  async fetchByHex(hex, signal) {
    const res = await fetch(`https://opendata.adsb.fi/api/v2/hex/${hex}`, {
      signal,
      headers: { accept: 'application/json', 'user-agent': 'PURRADAR/0.1 (+https://github.com/0xroodoo-ops/purradar)' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`adsb.fi ${res.status}`)
    const data = (await res.json()) as { ac?: unknown[]; aircraft?: unknown[] }
    const list = data.ac ?? data.aircraft ?? []
    return list.length ? normalize(list[0]) : null
  },
}
