// Contrat partagé avec le client : web/src/lib/realtime-types.ts doit rester identique.
export type Color = 'white' | 'black'
export type GameStatus = 'accepted' | 'active' | 'finished'
export type Reason =
  | 'checkmate'
  | 'resignation'
  | 'timeout'
  | 'stalemate'
  | 'repetition'
  | 'insufficient'
  | 'fifty-moves'

export interface PlayerRef {
  id: string
  name: string
}

export interface Outcome {
  winner: Color | 'draw'
  reason: Reason
}

export interface Snapshot {
  id: string
  status: GameStatus
  fen: string
  turn: Color
  /** Coups en notation SAN, dans l'ordre. */
  moves: string[]
  lastMove: { from: string; to: string } | null
  white: PlayerRef
  black: PlayerRef
  hostId: string
  /** Temps restant (ms) à l'instant de l'envoi. */
  whiteMs: number
  blackMs: number
  /** Couleur dont l'horloge tourne, ou null. */
  ticking: Color | null
  inCheck: boolean
  connected: { white: boolean; black: boolean }
  outcome: Outcome | null
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string }
