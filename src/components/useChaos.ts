'use client'

import { useEffect } from 'react'
import { meow, startAudio, stopAudio } from '@/lib/meow'

/**
 * Chaos Mode's noise.
 *
 * Audio is off until the user turns this on — no autoplay, no "just one" meow
 * on load. Rate scales with how many cats are on screen, so a quiet sky stays
 * quiet and a busy one gets silly, capped so it never becomes a drone.
 */
export function useChaos(enabled: boolean, catCount: number) {
  useEffect(() => {
    if (!enabled) {
      stopAudio()
      return
    }
    if (!startAudio()) return

    let timer: number
    const schedule = () => {
      // Busier sky, more meows — between roughly 0.6s and 4s apart.
      const rate = Math.min(1, catCount / 250)
      const delay = 4000 - rate * 3400 + Math.random() * 900
      timer = window.setTimeout(() => {
        meow(0.75 + Math.random() * 0.7)
        schedule()
      }, delay)
    }
    schedule()

    return () => {
      window.clearTimeout(timer)
      stopAudio()
    }
  }, [enabled, catCount])
}
