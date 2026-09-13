'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Header } from '@/components/Header'
import { CatCard } from '@/components/CatCard'
import { Controls, type Toggles } from '@/components/Controls'
import { useChaos } from '@/components/useChaos'
import type { CatFilter, MapStatus } from '@/components/CatMap'
import type { Cat } from '@/lib/providers'

/**
 * MapLibre touches `window` on import, so the map only ever loads in the
 * browser. Everything else on the page renders immediately behind it.
 */
const CatMap = dynamic(() => import('@/components/CatMap').then((m) => m.CatMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-void" />,
})

const EMPTY: MapStatus = {
  count: 0,
  source: null,
  stale: false,
  offline: false,
  tooFarOut: false,
}

export default function Home() {
  const [status, setStatus] = useState<MapStatus>(EMPTY)
  const [cats, setCats] = useState<Cat[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [filter, setFilter] = useState<CatFilter>('all')
  const [toggles, setToggles] = useState<Toggles>({
    labels: true,
    trails: false,
    clustered: false,
    chaos: false,
  })

  // Stable identities: the map is memoised, and a new function each render
  // would defeat that and restart its loops.
  const onStatus = useCallback((s: MapStatus) => setStatus({ ...s }), [])
  const onCats = useCallback((next: Cat[]) => setCats(next), [])
  const onSelect = useCallback((hex: string | null) => setSelected(hex), [])
  const onToggle = useCallback((t: Partial<Toggles>) => setToggles((s) => ({ ...s, ...t })), [])
  const onPick = useCallback((hex: string) => {
    setSelected(hex)
    // A new object each time, so picking the same cat twice still flies to it.
    setFocus(hex)
    window.setTimeout(() => setFocus(null), 50)
  }, [])

  /**
   * The controls sit over the map on a phone, and both the basemap and the
   * feed require their attribution to stay visible. Publishing the panel's real
   * height lets the map's own corner move above it, whatever the panel grows
   * into later.
   */
  const controlsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = controlsRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty(
        '--controls-h',
        `${Math.round(entry.contentRect.height)}px`,
      )
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const selectedCat = useMemo(
    () => (selected ? (cats.find((c) => c.hex === selected) ?? null) : null),
    [cats, selected],
  )

  useChaos(toggles.chaos, status.count)

  return (
    <main className="relative h-full w-full overflow-hidden bg-void">
      <CatMap
        onStatus={onStatus}
        onCats={onCats}
        onSelect={onSelect}
        selectedHex={selected}
        focusHex={focus}
        showLabels={toggles.labels}
        showTrails={toggles.trails}
        clustered={toggles.clustered}
        chaos={toggles.chaos}
        filter={filter}
      />

      <Header status={status} />

      {/* Controls left, card right. On a phone both stack at the bottom, clear
          of the map's own buttons in the corner. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-20 z-20 flex flex-col justify-end gap-2 p-3 sm:top-28 sm:flex-row sm:items-start sm:justify-between sm:p-4">
        <div ref={controlsRef} className="order-2 w-full sm:order-1 sm:w-[280px]">
          <Controls
            cats={cats}
            filter={filter}
            onFilter={setFilter}
            toggles={toggles}
            onToggle={onToggle}
            onPick={onPick}
          />
        </div>

        {selectedCat && (
          <div className="order-1 w-full sm:order-2 sm:w-auto">
            <CatCard cat={selectedCat} onClose={() => setSelected(null)} />
          </div>
        )}
      </div>

      {/* Honest empty states. Neither one invents a cat. */}
      {status.tooFarOut && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="glass pointer-events-auto max-w-sm rounded-2xl px-6 py-5 text-center">
            <div className="mb-2 text-3xl" aria-hidden>
              🔭
            </div>
            <h2 className="text-sm font-black tracking-[0.16em] text-cyan">ZOOM IN FOR CATS</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              The feed answers one 250-nautical-mile circle at a time. Any further out and
              PURRADAR would be showing you a fraction of the sky while pretending it was all of
              it. Zoom in and the cats appear.
            </p>
          </div>
        </div>
      )}

      {status.offline && !status.tooFarOut && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="glass pointer-events-auto max-w-sm rounded-2xl px-6 py-5 text-center">
            <div className="mb-2 text-3xl" aria-hidden>
              😿
            </div>
            <h2 className="text-sm font-black tracking-[0.16em] text-pink">CAT TRAFFIC OFFLINE</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              The live feed is not answering. Rather than make cats up, PURRADAR is showing you
              nothing. Retrying every few seconds.
            </p>
          </div>
        </div>
      )}

      {status.stale && !status.offline && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center px-4">
          <div className="glass rounded-full px-4 py-1.5 text-[10px] font-semibold tracking-[0.18em] text-purple">
            SHOWING LAST KNOWN CATS · FEED UNREACHABLE
          </div>
        </div>
      )}
    </main>
  )
}
