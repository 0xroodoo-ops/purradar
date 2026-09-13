import { normalize, type AircraftProvider, type FeedResult } from './types'

/**
 * adsb.lol — the fallback.
 *
 * No documented rate limit, but measured behaviour is strict: sequential
 * requests two seconds apart from one IP still returned nginx 429s about half
 * the time, with no Retry-After. Treated as a last resort and given a wide
 * minimum interval. Data is ODbL, so attribution is required.
 */
export const adsblol: AircraftProvider = {
  id: 'adsb.lol',
  attribution: 'Live ADS-B by <a href="https://adsb.lol" target="_blank" rel="noreferrer">adsb.lol</a> (ODbL)',
  minIntervalMs: 5000,

  async fetchAround(lat, lon, radiusNm, signal): Promise<FeedResult> {
    const url = `https://api.adsb.lol/v2/point/${lat.toFixed(4)}/${lon.toFixed(4)}/${Math.round(radiusNm)}`
    const res = await fetch(url, {
      signal,
      headers: { accept: 'application/json', 'user-agent': 'PURRADAR/0.1 (+https://github.com/0xroodoo-ops/purradar)' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`adsb.lol ${res.status}`)
    const data = (await res.json()) as { ac?: unknown[]; now?: number }
    return {
      cats: (data.ac ?? []).map(normalize).filter((c): c is NonNullable<typeof c> => c !== null),
      source: 'adsb.lol',
      now: data.now ?? Date.now(),
    }
  },

  async fetchByHex(hex, signal) {
    const res = await fetch(`https://api.adsb.lol/v2/hex/${hex}`, {
      signal,
      headers: { accept: 'application/json', 'user-agent': 'PURRADAR/0.1 (+https://github.com/0xroodoo-ops/purradar)' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`adsb.lol ${res.status}`)
    const data = (await res.json()) as { ac?: unknown[]; aircraft?: unknown[] }
    const list = data.ac ?? data.aircraft ?? []
    return list.length ? normalize(list[0]) : null
  },
}
