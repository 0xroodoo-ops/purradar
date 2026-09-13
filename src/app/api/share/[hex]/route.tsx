import { ImageResponse } from 'next/og'
import { BREED_ICONS, breedFor, catCallsign, statusFor } from '@/lib/catspeak'
import { findCat } from '@/lib/lookup'

/**
 * GET /api/share/[hex] → a 1200×630 card for one cat.
 *
 * Rendered live from the feed, so a shared cat shows where it actually was
 * when the link was opened. If the cat is no longer flying, the card says so
 * rather than showing a stale or invented position — a link that quietly lies
 * is worse than one that admits the cat has gone home.
 */

export const runtime = 'nodejs'
export const revalidate = 30

const VOID = '#04060f'
const PINK = '#ff4fa3'
const CYAN = '#22e0ff'
const MUTED = '#7c86a8'
const CHALK = '#dfe6ff'

export async function GET(request: Request, { params }: { params: Promise<{ hex: string }> }) {
  const { hex } = await params
  const cat = await findCat(hex)
  const origin = new URL(request.url).origin

  if (!cat) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: VOID,
            color: CHALK,
            fontFamily: 'sans-serif',
          }}
        >
          <div style={{ fontSize: 44, fontWeight: 800, color: PINK, letterSpacing: 6 }}>
            PURRADAR
          </div>
          <div style={{ fontSize: 30, marginTop: 18, color: MUTED }}>
            This cat has stopped transmitting.
          </div>
          <div style={{ fontSize: 20, marginTop: 8, color: MUTED }}>
            It is probably asleep somewhere.
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    )
  }

  const breed = breedFor(cat.hex, cat.category)
  const status = statusFor(cat)
  const art = `${origin}/cats/${BREED_ICONS[breed]}.png`
  const stat = (label: string, value: string) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 17, color: MUTED, letterSpacing: 3 }}>{label}</span>
      <span style={{ fontSize: 34, color: CHALK, fontWeight: 700 }}>{value}</span>
    </div>
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: VOID,
          fontFamily: 'sans-serif',
          padding: 56,
          alignItems: 'center',
          gap: 48,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- this tree is
            rendered by satori into a PNG, never by a browser; next/image has
            nothing to optimise here. */}
        <img src={art} width={220} height={540} alt="" />

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ fontSize: 22, color: PINK, letterSpacing: 8, fontWeight: 800 }}>
            PURRADAR
          </div>
          <div style={{ fontSize: 82, color: PINK, fontWeight: 800, lineHeight: 1.1 }}>
            {catCallsign(cat.flight, cat.hex)}
          </div>
          {/* One string, not three children: satori refuses any div with more
              than one child unless its display is stated outright. */}
          <div style={{ fontSize: 26, color: MUTED, marginTop: 4 }}>
            {`${breed} · ${cat.type ?? 'UNKNOWN CATCRAFT'}`}
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 22,
              padding: '10px 22px',
              border: `1px solid ${CYAN}`,
              borderRadius: 999,
              color: CYAN,
              fontSize: 24,
              letterSpacing: 3,
              alignSelf: 'flex-start',
            }}
          >
            {status.label}
          </div>

          <div style={{ display: 'flex', gap: 56, marginTop: 36 }}>
            {stat('CATITUDE', cat.on_ground ? 'ON GROUND' : `${(cat.alt_baro ?? 0).toLocaleString()} FT`)}
            {stat('ZOOMIES', `${Math.round(cat.gs ?? 0)} KTS`)}
            {stat('POINTING', cat.track === null ? 'NO IDEA' : `${Math.round(cat.track)}°`)}
          </div>

          <div style={{ fontSize: 20, color: MUTED, marginTop: 40, letterSpacing: 3 }}>
            REAL PLANES. CATS INSTEAD.
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
