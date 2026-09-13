/**
 * Chaos Mode's meows.
 *
 * Synthesised rather than sampled: no audio files to ship, no licence to
 * honour, and every meow comes out slightly different, which is the point.
 * A cat noise is roughly a pitch arch (up, then down) played through a moving
 * formant filter, with a little vibrato so it does not sound like a siren.
 *
 * The AudioContext is only created on a real user gesture — turning Chaos Mode
 * on — because browsers refuse to start one otherwise, and because sound must
 * never happen to someone who did not ask for it.
 */

let ctx: AudioContext | null = null

export function startAudio(): boolean {
  if (typeof window === 'undefined') return false
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    void ctx.resume()
    return true
  } catch {
    return false
  }
}

export function stopAudio() {
  void ctx?.suspend()
}

/** One meow. `pitch` shifts the whole cat: kittens high, big cats low. */
export function meow(pitch = 1, gain = 0.18) {
  if (!ctx || ctx.state !== 'running') return
  const t = ctx.currentTime
  const dur = 0.45 + Math.random() * 0.3

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  const base = (220 + Math.random() * 90) * pitch
  // The arch: up into the middle of the sound, then down and off.
  osc.frequency.setValueAtTime(base * 0.8, t)
  osc.frequency.exponentialRampToValueAtTime(base * 1.35, t + dur * 0.3)
  osc.frequency.exponentialRampToValueAtTime(base * 0.72, t + dur)

  // Vibrato. Without it the result is a car alarm.
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()
  lfo.frequency.value = 11 + Math.random() * 6
  lfoGain.gain.value = base * 0.045
  lfo.connect(lfoGain).connect(osc.frequency)

  // Formant sweep — "meee" opening into "ow".
  const formant = ctx.createBiquadFilter()
  formant.type = 'bandpass'
  formant.Q.value = 4
  formant.frequency.setValueAtTime(900 * pitch, t)
  formant.frequency.linearRampToValueAtTime(1500 * pitch, t + dur * 0.35)
  formant.frequency.linearRampToValueAtTime(700 * pitch, t + dur)

  const tame = ctx.createBiquadFilter()
  tame.type = 'lowpass'
  tame.frequency.value = 3200

  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.06)
  amp.gain.setValueAtTime(gain, t + dur * 0.55)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)

  osc.connect(formant).connect(tame).connect(amp).connect(ctx.destination)
  osc.start(t)
  lfo.start(t)
  osc.stop(t + dur + 0.05)
  lfo.stop(t + dur + 0.05)
}
