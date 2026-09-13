'use client'

import { useEffect, useState } from 'react'
import { SPEAK, breedFor, catCallsign, statusFor } from '@/lib/catspeak'
import type { Cat } from '@/lib/providers'

/**
 * The card for one cat.
 *
 * A panel on the right at desk width, a bottom sheet on a phone — same markup,
 * so there is only one place for the content to go wrong. Everything shown is
 * the live record: when the feed has no heading, the row says so rather than
 * quietly printing a zero.
 */

const TONE: Record<string, string> = {
  loaf: 'text-cyan',
  zoom: 'text-pink',
  high: 'text-purple',
  extreme: 'text-pink',
  suspicious: 'text-pink',
  normal: 'text-cyan',
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-cyan/10 py-1.5 last:border-0">
      <span className="text-[10px] font-semibold tracking-[0.16em] text-muted">{label}</span>
      <span className="tabular text-right text-xs text-chalk">{value}</span>
    </div>
  )
}

export function CatCard({ cat, onClose }: { cat: Cat; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const breed = breedFor(cat.hex, cat.category)
  const status = statusFor(cat)
  const callsign = catCallsign(cat.flight, cat.hex)

  // A card left open on a cat that has flown out of range should not strand the
  // keyboard user with no way back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const share = async () => {
    const url = `${window.location.origin}/cat/${cat.hex}`
    try {
      if (navigator.share) await navigator.share({ title: `${callsign} on PURRADAR`, url })
      else await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* the user dismissed the share sheet; nothing to report */
    }
  }

  const n = (v: number | null, unit: string) =>
    v === null ? 'UNKNOWN' : `${Math.round(v).toLocaleString()} ${unit}`

  return (
    <aside
      className="glass pointer-events-auto flex flex-col gap-3 rounded-2xl p-4 sm:w-[300px]"
      aria-label={`Details for ${callsign}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="glow-pink truncate text-lg font-black tracking-[0.08em] text-pink">
            {callsign}
          </div>
          <div className="text-[10px] font-semibold tracking-[0.18em] text-muted">{breed}</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full border border-cyan/20 px-2 py-0.5 text-xs text-muted transition-colors hover:text-chalk"
        >
          ✕
        </button>
      </div>

      <div
        className={`rounded-lg border border-cyan/15 bg-navy-soft/60 px-3 py-2 text-center text-[11px] font-bold tracking-[0.14em] ${TONE[status.tone] ?? 'text-cyan'}`}
      >
        {status.label}
      </div>

      <div>
        <Row label={SPEAK.altitude} value={cat.on_ground ? 'ON THE GROUND' : n(cat.alt_baro, 'FT')} />
        <Row label={SPEAK.groundSpeed} value={n(cat.gs, 'KTS')} />
        <Row
          label="POINTING"
          value={cat.track === null ? 'NO IDEA' : `${Math.round(cat.track)}°`}
        />
        <Row label={SPEAK.aircraft} value={cat.type ?? 'UNKNOWN'} />
        <Row label="CHIP ID" value={cat.reg ?? 'UNCHIPPED'} />
        <Row label="SQUAWK" value={cat.squawk ?? 'SILENT'} />
        <Row label={SPEAK.arrival} value={SPEAK.unknownDestination} />
        <Row label="ICAO HEX" value={cat.hex.toUpperCase()} />
      </div>

      <button
        onClick={share}
        className="rounded-lg border border-pink/40 bg-pink/10 py-2 text-[11px] font-bold tracking-[0.16em] text-pink transition-colors hover:bg-pink/20"
      >
        {copied ? 'LINK COPIED' : 'SHARE THIS CAT'}
      </button>
    </aside>
  )
}
