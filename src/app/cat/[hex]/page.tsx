import Link from 'next/link'
import type { Metadata } from 'next'
import { BREED_ICONS, SPEAK, breedFor, catCallsign, statusFor } from '@/lib/catspeak'
import { findCat } from '@/lib/lookup'

/**
 * /cat/[hex] — one cat, shareable.
 *
 * Server-rendered so a link posted anywhere unfurls with a real card. The data
 * is fetched live; a cat that has landed or left coverage gets an honest page
 * saying so, never a remembered position presented as current.
 */

export const revalidate = 30

type Props = { params: Promise<{ hex: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hex } = await params
  const cat = await findCat(hex)
  const title = cat ? `${catCallsign(cat.flight, cat.hex)} — PURRADAR` : 'This cat has gone home — PURRADAR'
  const description = cat
    ? `${breedFor(cat.hex, cat.category)} · ${statusFor(cat).label} · ${cat.on_ground ? 'on the ground' : `${(cat.alt_baro ?? 0).toLocaleString()} ft`}`
    : 'The cat on this link has stopped transmitting.'

  return {
    title,
    description,
    openGraph: { title, description, images: [`/api/share/${hex.toLowerCase()}`] },
    twitter: { card: 'summary_large_image', title, description, images: [`/api/share/${hex.toLowerCase()}`] },
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-cyan/10 py-2.5 last:border-0">
      <span className="text-[11px] font-semibold tracking-[0.16em] text-muted">{label}</span>
      <span className="tabular text-sm text-chalk">{value}</span>
    </div>
  )
}

export default async function CatPage({ params }: Props) {
  const { hex } = await params
  const cat = await findCat(hex)

  if (!cat) {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-4 bg-void p-6 text-center">
        <div className="text-5xl" aria-hidden>
          😴
        </div>
        <h1 className="text-xl font-black tracking-[0.12em] text-pink">THIS CAT HAS GONE HOME</h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted">
          Nothing is transmitting on <span className="tabular">{hex.toUpperCase()}</span> right now.
          It has landed, left coverage, or is simply asleep. PURRADAR will not guess where it went.
        </p>
        <Link
          href="/"
          className="rounded-lg border border-cyan/40 bg-cyan/10 px-5 py-2 text-[11px] font-bold tracking-[0.16em] text-cyan"
        >
          BACK TO THE CATS
        </Link>
      </main>
    )
  }

  const breed = breedFor(cat.hex, cat.category)
  const status = statusFor(cat)

  return (
    <main className="flex min-h-full flex-col items-center bg-void px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          href={`/#9/${cat.lat.toFixed(4)}/${cat.lon.toFixed(4)}`}
          className="glow-pink text-sm font-black tracking-[0.18em] text-pink"
        >
          PURRADAR
        </Link>

        <div className="glass mt-4 rounded-2xl p-6">
          <div className="flex items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated
                sprite with no fixed intrinsic size in the manifest */}
            <img
              src={`/cats/${BREED_ICONS[breed]}.png`}
              alt={breed}
              className="h-28 w-auto"
            />
            <div className="min-w-0">
              <h1 className="glow-pink truncate text-2xl font-black tracking-[0.06em] text-pink">
                {catCallsign(cat.flight, cat.hex)}
              </h1>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-muted">{breed}</p>
              <p className="mt-2 inline-block rounded-full border border-cyan/30 px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-cyan">
                {status.label}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <Row
              label={SPEAK.altitude}
              value={cat.on_ground ? 'ON THE GROUND' : `${(cat.alt_baro ?? 0).toLocaleString()} FT`}
            />
            <Row label={SPEAK.groundSpeed} value={`${Math.round(cat.gs ?? 0)} KTS`} />
            <Row label="POINTING" value={cat.track === null ? 'NO IDEA' : `${Math.round(cat.track)}°`} />
            <Row label={SPEAK.aircraft} value={cat.type ?? 'UNKNOWN'} />
            <Row label="CHIP ID" value={cat.reg ?? 'UNCHIPPED'} />
            <Row label={SPEAK.arrival} value={SPEAK.unknownDestination} />
            <Row label="ICAO HEX" value={cat.hex.toUpperCase()} />
          </div>

          <Link
            href={`/#9/${cat.lat.toFixed(4)}/${cat.lon.toFixed(4)}`}
            className="mt-5 block rounded-lg border border-cyan/40 bg-cyan/10 py-2.5 text-center text-[11px] font-bold tracking-[0.16em] text-cyan"
          >
            WATCH IT ON THE MAP
          </Link>
        </div>

        <p className="mt-4 text-center text-[10px] leading-relaxed text-muted">
          Live position from{' '}
          <a href="https://adsb.fi" className="underline" target="_blank" rel="noreferrer">
            adsb.fi
          </a>
          . Every cat is a real aircraft.
        </p>
      </div>
    </main>
  )
}
