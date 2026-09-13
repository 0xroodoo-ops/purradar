import { adsbfi } from './adsbfi'
import { adsblol } from './adsblol'
import type { AircraftProvider } from './types'

/**
 * In order. The first that answers wins; the rest are fallbacks.
 *
 * adsb.fi leads because its limit is published (1/sec) and its coverage tested
 * better over the US — a 250nm query around Los Angeles returned 124 aircraft
 * from adsb.fi while adsb.lol was returning 429.
 */
export const providers: AircraftProvider[] = [adsbfi, adsblol]

export const attributions = providers.map((p) => p.attribution)
export * from './types'
