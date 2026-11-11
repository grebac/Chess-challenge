// Sons synthétisés avec Web Audio : aucun fichier audio à héberger.
export type SoundKind = 'move' | 'capture' | 'check' | 'end'

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Les navigateurs bloquent le son avant un geste de l'utilisateur : le premier clic le débloque. */
export function unlockAudioOnFirstGesture(): () => void {
  const unlock = () => void audio()
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
  return () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
}

function tone(c: AudioContext, freq: number, start: number, duration: number, type: OscillatorType, volume: number) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t0 = c.currentTime + start
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

export function playSound(kind: SoundKind): void {
  const c = audio()
  if (!c || c.state !== 'running') return
  switch (kind) {
    case 'move':
      tone(c, 520, 0, 0.07, 'triangle', 0.18)
      break
    case 'capture':
      tone(c, 300, 0, 0.09, 'square', 0.12)
      tone(c, 180, 0.04, 0.1, 'triangle', 0.16)
      break
    case 'check':
      tone(c, 660, 0, 0.08, 'triangle', 0.18)
      tone(c, 880, 0.09, 0.12, 'triangle', 0.18)
      break
    case 'end':
      tone(c, 523, 0, 0.14, 'sine', 0.2)
      tone(c, 392, 0.15, 0.14, 'sine', 0.2)
      tone(c, 262, 0.3, 0.3, 'sine', 0.2)
      break
  }
}
