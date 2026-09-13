/**
 * Every cat-ification rule, in one file.
 *
 * The joke only works if a given aircraft is always the same cat, so nothing
 * here is random: breed and callsign are both derived from the ICAO hex, which
 * is fixed to the airframe.
 */

/** One entry per drawing in cats/. Order is part of the hash, so adding a
 * breed reshuffles which aircraft is which cat — harmless, but not silent. */
export const BREEDS = [
  'Orange Tabby',
  'Tuxedo',
  'Black Cat',
  'Siamese',
  'Gray Tabby',
  'Calico',
] as const

export type Breed = (typeof BREEDS)[number]

/**
 * Breed → art file basename. These are also the sprite ids registered with
 * map.addImage, and the filenames in cats/ and public/cats.
 */
export const BREED_ICONS: Record<Breed, string> = {
  'Orange Tabby': 'orange-tabby',
  Tuxedo: 'tuxedo',
  'Black Cat': 'black-cat',
  Siamese: 'siamese',
  'Gray Tabby': 'gray-tabby',
  Calico: 'calico',
}

/** FNV-1a. Small, fast, and stable across runs — which is the whole point. */
export function hashHex(hex: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < hex.length; i++) {
    h ^= hex.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * Breed from the hex, with one exception: helicopters get their own silhouette
 * regardless, because a rotorcraft reading as an airliner loses the joke.
 * ADS-B emitter category A7 is rotorcraft.
 */
export function breedFor(hex: string, category?: string | null): Breed {
  if (category === 'A7') return 'Gray Tabby'
  return BREEDS[hashHex(hex) % BREEDS.length]
}

/** True for the categories that should be drawn as the chunky cat. */
export function isHeavy(category?: string | null): boolean {
  return category === 'A5' || category === 'A4'
}

export function isRotor(category?: string | null): boolean {
  return category === 'A7'
}

/**
 * There is one drawing per breed, so size carries what a separate silhouette
 * used to: a 747 is a big cat, a helicopter a small one.
 */
export function scaleFor(category?: string | null): number {
  if (isHeavy(category)) return 1.3
  if (isRotor(category)) return 0.78
  return 1
}

/**
 * Airline prefix → cat word. Real ICAO operator codes, so an aviation person
 * reads MEOW1487 and knows it is United.
 */
export const AIRLINE_CAT: Record<string, string> = {
  UAL: 'MEOW',
  DAL: 'PURR',
  BAW: 'HISS',
  AAL: 'PAWS',
  SWA: 'NYAN',
  JBU: 'MRRP',
  EZY: 'SNEK',
  RYR: 'YOWL',
  DLH: 'MIAU',
  AFR: 'MIAOU',
  KLM: 'MIAUW',
  UAE: 'SPHNX',
  QTR: 'MOGGY',
  SIA: 'TABBY',
  ACA: 'MITTN',
  WJA: 'WHSKR',
  THY: 'KEDI',
  IBE: 'GATO',
  AZA: 'GATTO',
  ANA: 'NEKO',
  JAL: 'NYAA',
  CPA: 'MAOMI',
  QFA: 'BUNYP',
  VIR: 'VELVT',
  FDX: 'BOXCT',
  UPS: 'PARCL',
  SKW: 'KITN',
  RPA: 'TOEBN',
  ASA: 'SNOCT',
  NKS: 'FERAL',
  FFT: 'FLOOF',
}

/** Anything that is not an airline flight number. */
const CAT_FALLBACK = 'CAT'

/**
 * UAL1487 → MEOW 1487.
 *
 * A private registration (N911TG, G-KELS) has no operator prefix, so it keeps
 * its own identity with a cat word in front, rather than being mangled.
 */
export function catCallsign(flight: string | null, hex: string): string {
  const cs = flight?.trim().toUpperCase()
  if (!cs) return `${CAT_FALLBACK} ${hex.toUpperCase()}`

  const airline = cs.slice(0, 3)
  const rest = cs.slice(3).trim()
  if (/^[A-Z]{3}$/.test(airline) && /^\d/.test(rest)) {
    return `${AIRLINE_CAT[airline] ?? CAT_FALLBACK} ${rest}`
  }
  return `${CAT_FALLBACK} ${cs}`
}

/** ALTITUDE → CATITUDE, and the rest of the dictionary. */
export const SPEAK = {
  altitude: 'CATITUDE',
  groundSpeed: 'ZOOMIES',
  aircraft: 'CATCRAFT',
  tracking: 'STALKING',
  departure: 'ESCAPED FROM',
  arrival: 'HEADED TO',
  airTraffic: 'CAT TRAFFIC',
  unknownDestination: 'CAT BUSINESS',
} as const

export type CatStatus = {
  label: string
  tone: 'loaf' | 'zoom' | 'high' | 'extreme' | 'suspicious' | 'normal'
}

/**
 * The status badge. Order matters: a suspicious cat that is also very high
 * should read as suspicious first.
 */
export function statusFor(input: {
  on_ground: boolean
  gs: number | null
  alt_baro: number | null
  flight: string | null
  squawk: string | null
}): CatStatus {
  const { on_ground, gs, alt_baro, flight, squawk } = input

  // 7500 hijack, 7600 radio failure, 7700 general emergency.
  if (squawk && ['7500', '7600', '7700'].includes(squawk)) {
    return { label: 'SUSPICIOUS CAT', tone: 'suspicious' }
  }
  if (!flight) return { label: 'SUSPICIOUS CAT', tone: 'suspicious' }
  if (on_ground) {
    return (gs ?? 0) > 5
      ? { label: 'ZOOMIES DETECTED', tone: 'zoom' }
      : { label: 'CAT IS CURRENTLY LOAFING', tone: 'loaf' }
  }
  if ((gs ?? 0) > 550) return { label: 'EXTREME ZOOMIES', tone: 'extreme' }
  if ((alt_baro ?? 0) > 40_000) return { label: 'HIGH-ALTITUDE CAT', tone: 'high' }
  return { label: 'CAT TRAFFIC NORMAL', tone: 'normal' }
}

/** The rotating header ticker. */
export const STATUS_TICKER = [
  'THE CATS ARE FLYING',
  'CAT TRAFFIC NORMAL',
  'ZOOMIES DETECTED OVER EUROPE',
  'THIS CAT IS VERY HIGH',
  'ALL CATS ACCOUNTED FOR',
  'STALKING IN PROGRESS',
  'NO CATS WERE HARMED',
] as const
