/**
 * One normalized cat-craft, whichever feed it came from.
 *
 * Deliberately compact: this payload goes over the wire on every poll, for
 * every visible aircraft, to every client.
 */
export type Cat = {
  hex: string
  /** Real callsign, trimmed. Upstream pads it with spaces. */
  flight: string | null
  lat: number
  lon: number
  /** Feet, or null when the aircraft is on the ground. */
  alt_baro: number | null
  /** Ground speed in knots. */
  gs: number | null
  /** Degrees true. Missing on a lot of traffic — see the note in normalize(). */
  track: number | null
  /** ICAO type code, e.g. B738. */
  type: string | null
  /** Registration, e.g. G-KELS. */
  reg: string | null
  on_ground: boolean
  squawk: string | null
  /** ADS-B emitter category, e.g. A3, A7 (helicopter). */
  category: string | null
}

export type FeedResult = {
  cats: Cat[]
  /** Which provider actually answered. */
  source: string
  /** Upstream timestamp, ms. */
  now: number
}

export interface AircraftProvider {
  readonly id: string
  /** Attribution string, shown in the UI. Required by every provider's terms. */
  readonly attribution: string
  /** Minimum milliseconds between upstream calls, per their published limits. */
  readonly minIntervalMs: number
  /** Aircraft within `radiusNm` of a point. Both feeds cap this at 250. */
  fetchAround(lat: number, lon: number, radiusNm: number, signal?: AbortSignal): Promise<FeedResult>
  /**
   * One aircraft by ICAO hex. The only way a share page can name a single cat,
   * since the circle endpoints cannot be asked about a specific airframe.
   */
  fetchByHex?(hex: string, signal?: AbortSignal): Promise<Cat | null>
}

export const MAX_RADIUS_NM = 250

/**
 * readsb-family feeds all return the same aircraft shape, so both providers
 * share this. The field names come from live responses, not from memory:
 *
 *   flight     padded with trailing spaces
 *   alt_baro   the string "ground" when on the deck, otherwise feet
 *   r / t      registration / ICAO type code
 *   track      absent on a large share of traffic, so it is nullable and the
 *              client falls back to the bearing between successive fixes
 */
type RawAircraft = {
  hex?: string
  flight?: string
  lat?: number
  lon?: number
  alt_baro?: number | string
  gs?: number
  track?: number
  true_heading?: number
  mag_heading?: number
  t?: string
  r?: string
  squawk?: string
  category?: string
}

export function normalize(raw: unknown): Cat | null {
  const a = raw as RawAircraft
  if (!a || typeof a.hex !== 'string') return null
  if (typeof a.lat !== 'number' || typeof a.lon !== 'number') return null

  const onGround = a.alt_baro === 'ground'
  const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null
  const heading = a.track ?? a.true_heading ?? a.mag_heading ?? null

  return {
    hex: a.hex.trim().toLowerCase(),
    flight: a.flight?.trim() || null,
    lat: a.lat,
    lon: a.lon,
    alt_baro: onGround ? null : alt,
    gs: typeof a.gs === 'number' ? a.gs : null,
    track: typeof heading === 'number' ? heading : null,
    type: a.t?.trim() || null,
    reg: a.r?.trim() || null,
    on_ground: onGround,
    squawk: a.squawk?.trim() || null,
    category: a.category?.trim() || null,
  }
}
