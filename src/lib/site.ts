/**
 * The site's own origin.
 *
 * Needed so shared links unfurl with absolute image URLs. Vercel exposes the
 * deployment host but not the scheme, and neither is set locally, so this
 * falls back to the dev server.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return new URL(explicit)
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  }
  if (process.env.VERCEL_URL) return new URL(`https://${process.env.VERCEL_URL}`)
  return new URL('http://localhost:3000')
}
