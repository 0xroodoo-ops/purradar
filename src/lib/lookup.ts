import { MAX_RADIUS_NM, providers, type Cat } from '@/lib/providers'

/**
 * Find one cat by its ICAO hex.
 *
 * The feeds answer circles, not aircraft — there is no "get me this hex"
 * endpoint — so a single cat has to be found by asking about somewhere it
 * might be. Both providers happen to expose a hex lookup of their own, which
 * is the only reason a share page can work at all; when it fails the page says
 * the cat has wandered off rather than inventing one.
 */

const HEX = /^[0-9a-f]{6}$/i

export async function findCat(hex: string): Promise<Cat | null> {
  if (!HEX.test(hex)) return null
  const clean = hex.toLowerCase()

  for (const provider of providers) {
    if (!provider.fetchByHex) continue
    try {
      const cat = await provider.fetchByHex(clean, AbortSignal.timeout(7_000))
      if (cat) return cat
    } catch {
      // Try the next provider rather than failing the whole page.
    }
  }
  return null
}

export { MAX_RADIUS_NM }
