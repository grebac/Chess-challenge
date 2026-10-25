// Partagé entre la collection Games (hooks) et l'interface.
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export const TIME_CONTROLS = [
  { value: '1+0', label: 'Bullet 1 min' },
  { value: '3+2', label: 'Blitz 3 min + 2 s' },
  { value: '5+0', label: 'Blitz 5 min' },
  { value: '5+3', label: 'Blitz 5 min + 3 s' },
  { value: '10+0', label: 'Rapide 10 min' },
  { value: '15+10', label: 'Rapide 15 min + 10 s' },
  { value: '30+0', label: 'Classique 30 min' },
] as const

export type TimeControl = (typeof TIME_CONTROLS)[number]['value']

/** "5+3" -> 5 minutes de base, 3 secondes d'incrément. */
export function parseTimeControl(tc: string | null | undefined): { baseMs: number; incMs: number } {
  const [base, inc] = (tc ?? '10+0').split('+')
  const baseMin = Number(base)
  const incSec = Number(inc ?? 0)
  return {
    baseMs: Math.round((Number.isFinite(baseMin) ? baseMin : 10) * 60_000),
    incMs: Math.round((Number.isFinite(incSec) ? incSec : 0) * 1000),
  }
}

export type HostColor = 'white' | 'black' | 'random'

/** Couleur effectivement jouée par l'hôte (tirage au sort si "random"). */
export function resolveHostColor(hostColor: HostColor | null | undefined): 'white' | 'black' {
  if (hostColor === 'white' || hostColor === 'black') return hostColor
  return Math.random() < 0.5 ? 'white' : 'black'
}

export const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente de réponse',
  accepted: 'Acceptée, salle d’attente',
  active: 'En cours',
  finished: 'Terminée',
  declined: 'Refusée',
  cancelled: 'Annulée',
}

export const REASON_LABELS: Record<string, string> = {
  checkmate: 'échec et mat',
  resignation: 'abandon',
  timeout: 'temps écoulé',
  stalemate: 'pat',
  repetition: 'triple répétition',
  insufficient: 'matériel insuffisant',
  'fifty-moves': 'règle des 50 coups',
}
