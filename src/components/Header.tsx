'use client'

import { useEffect, useState } from 'react'
import { STATUS_TICKER } from '@/lib/catspeak'
import type { MapStatus } from './CatMap'

/**
 * The header bar. It carries the one number that matters — how many cats are
 * currently on screen — and it is also where the app admits when the feed is
 * having a bad time, rather than quietly showing nothing.
 */
export function Header({ status }: { status: MapStatus }) {
  const [line, setLine] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setLine((n) => (n + 1) % STATUS_TICKER.length), 4200)
    return () => window.clearInterval(id)
  }, [])

  const abnormal = status.offline || status.tooFarOut || status.stale
  const state = status.offline
    ? { dot: 'bg-pink', text: 'CAT TRAFFIC OFFLINE' }
    : status.tooFarOut
      ? { dot: 'bg-purple', text: 'ZOOM IN FOR CATS' }
      : status.stale
        ? { dot: 'bg-purple', text: 'LAST KNOWN CATS' }
        : { dot: 'bg-cyan', text: STATUS_TICKER[line] }

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-4">
      <div className="glass pointer-events-auto flex items-center gap-3 rounded-2xl px-3 py-2 sm:gap-5 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-lg leading-none sm:text-xl" aria-hidden>
            🐈
          </span>
          <div className="min-w-0">
            <h1 className="glow-pink text-base font-black tracking-[0.14em] text-pink sm:text-xl">
              PURRADAR
            </h1>
            <p className="hidden text-[10px] font-semibold tracking-[0.22em] text-muted sm:block">
              REAL PLANES. CATS INSTEAD.
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3 sm:gap-5">
          <div className="text-right">
            <div className="tabular text-lg font-bold leading-none text-cyan sm:text-2xl">
              {status.count.toLocaleString()}
            </div>
            <div className="text-[9px] font-semibold tracking-[0.18em] text-muted sm:text-[10px]">
              CATS TRACKED
            </div>
          </div>

          <div className="hidden items-center gap-2 border-l border-cyan/15 pl-4 md:flex">
            <span className={`live-dot inline-block size-2 rounded-full ${state.dot}`} aria-hidden />
            <span className="text-[10px] font-semibold tracking-[0.18em] text-chalk/80">
              {state.text}
            </span>
          </div>
        </div>
      </div>

      {/* A phone only spends a line on this when it is not the usual patter. */}
      <div
        className={`glass pointer-events-auto mt-2 flex items-center gap-2 rounded-xl px-3 py-1.5 md:hidden ${abnormal ? '' : 'hidden'}`}
      >
        <span className={`live-dot inline-block size-2 rounded-full ${state.dot}`} aria-hidden />
        <span className="truncate text-[10px] font-semibold tracking-[0.18em] text-chalk/80">
          {state.text}
        </span>
      </div>
    </header>
  )
}
