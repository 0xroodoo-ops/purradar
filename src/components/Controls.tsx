'use client'

import { useMemo, useState } from 'react'
import { catCallsign } from '@/lib/catspeak'
import type { CatFilter } from './CatMap'
import type { Cat } from '@/lib/providers'

/**
 * Search, filters and toggles.
 *
 * Search runs over the cats currently being tracked rather than asking the
 * feed, because the feed has no search — it answers a circle, and that circle
 * is already in memory.
 */

const FILTER_LABELS: { key: CatFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'zoomies', label: 'ZOOMIES' },
  { key: 'loafing', label: 'LOAFING' },
  { key: 'high', label: 'HIGH' },
  { key: 'heavy', label: 'CHONK' },
  { key: 'sus', label: 'SUS' },
]

export type Toggles = {
  labels: boolean
  trails: boolean
  clustered: boolean
  chaos: boolean
}

function Chip({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] transition-colors ${
        on
          ? 'border-cyan/60 bg-cyan/15 text-cyan'
          : 'border-cyan/15 text-muted hover:border-cyan/35 hover:text-chalk'
      }`}
    >
      {children}
    </button>
  )
}

export function Controls({
  cats,
  filter,
  onFilter,
  toggles,
  onToggle,
  onPick,
}: {
  cats: Cat[]
  filter: CatFilter
  onFilter: (f: CatFilter) => void
  toggles: Toggles
  onToggle: (t: Partial<Toggles>) => void
  onPick: (hex: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (q.length < 2) return []
    return cats
      .filter((c) => {
        const cs = catCallsign(c.flight, c.hex)
        return (
          cs.includes(q) ||
          c.hex.toUpperCase().includes(q) ||
          (c.flight ?? '').toUpperCase().includes(q) ||
          (c.reg ?? '').toUpperCase().includes(q) ||
          (c.type ?? '').toUpperCase().includes(q)
        )
      })
      .slice(0, 8)
  }, [cats, query])

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      {/* z-20: every .glass panel has a backdrop-filter, which makes it its own
          stacking context, so without this the filter row below paints over the
          results dropdown and swallows the click. */}
      <div className="glass relative z-20 rounded-2xl px-3 py-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Find a cat — callsign, registration, hex"
          aria-label="Search cats"
          className="w-full bg-transparent text-xs text-chalk placeholder:text-muted focus:outline-none"
        />
        {open && results.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-cyan/20 bg-navy/95 backdrop-blur">
            {results.map((c) => (
              <li key={c.hex}>
                <button
                  onClick={() => {
                    onPick(c.hex)
                    setOpen(false)
                  }}
                  className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-cyan/10"
                >
                  <span className="font-semibold text-chalk">{catCallsign(c.flight, c.hex)}</span>
                  <span className="tabular text-[10px] text-muted">
                    {c.type ?? c.reg ?? c.hex.toUpperCase()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="glass no-bar flex gap-1.5 overflow-x-auto rounded-2xl px-3 py-2 sm:flex-wrap sm:overflow-visible">
        {FILTER_LABELS.map(({ key, label }) => (
          <Chip key={key} on={filter === key} onClick={() => onFilter(key)}>
            {label}
          </Chip>
        ))}
      </div>

      <div className="glass no-bar flex gap-1.5 overflow-x-auto rounded-2xl px-3 py-2 sm:flex-wrap sm:overflow-visible">
        <Chip on={toggles.labels} onClick={() => onToggle({ labels: !toggles.labels })}>
          NAMES
        </Chip>
        <Chip on={toggles.trails} onClick={() => onToggle({ trails: !toggles.trails })}>
          TRAILS
        </Chip>
        <Chip
          on={toggles.clustered}
          onClick={() => onToggle({ clustered: !toggles.clustered })}
          title="Gather the cats into piles — readable at continent scale"
        >
          PILES
        </Chip>
        <Chip
          on={toggles.chaos}
          onClick={() => onToggle({ chaos: !toggles.chaos })}
          title="Bigger cats, and they meow. Sound is off until you turn this on."
        >
          CHAOS
        </Chip>
      </div>
    </div>
  )
}
