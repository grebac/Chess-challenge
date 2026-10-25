import { Chess } from 'chess.js'

import { gameKey } from './keys'
import type { GameDoc, UserRef } from './payloadClient'
import type { Color, GameStatus, Outcome, PlayerRef, Reason, Snapshot } from './types'

const other = (color: Color): Color => (color === 'white' ? 'black' : 'white')

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

export function userRef(ref: UserRef | null | undefined): PlayerRef | null {
  if (ref == null) return null
  if (typeof ref === 'object') {
    return { id: gameKey(ref.id), name: ref.displayName ?? ref.email ?? `Joueur ${ref.id}` }
  }
  return { id: gameKey(ref), name: `Joueur ${ref}` }
}

/** Un camp peut-il encore mater ? (règle FIDE du drapeau tombé contre matériel insuffisant) */
function hasMatingMaterial(chess: Chess, color: Color): boolean {
  const mine = color === 'white' ? 'w' : 'b'
  let minors = 0
  for (const row of chess.board()) {
    for (const square of row) {
      if (!square || square.color !== mine) continue
      if (square.type === 'p' || square.type === 'r' || square.type === 'q') return true
      if (square.type === 'b' || square.type === 'n') minors++
    }
  }
  return minors >= 2
}

export type MoveInput = { from: string; to: string; promotion?: string }
export type MoveResult = { ok: true; san: string } | { ok: false; error: string }

export interface LiveInit {
  id: string
  status: GameStatus
  hostId: string
  white: PlayerRef
  black: PlayerRef
  incMs: number
  chess: Chess
  whiteMs: number
  blackMs: number
  outcome: Outcome | null
  now: number
}

export class LiveGame {
  readonly id: string
  status: GameStatus
  readonly hostId: string
  readonly white: PlayerRef
  readonly black: PlayerRef
  readonly incMs: number
  readonly chess: Chess
  whiteMs: number
  blackMs: number
  outcome: Outcome | null
  /** Instant (ms epoch) où l'horloge du camp au trait a commencé à tourner. */
  tickingSince: number | null
  /** userId -> ids des sockets connectés à cette partie. */
  readonly presence = new Map<string, Set<string>>()
  flagTimer?: NodeJS.Timeout
  cleanupTimer?: NodeJS.Timeout

  constructor(init: LiveInit) {
    this.id = init.id
    this.status = init.status
    this.hostId = init.hostId
    this.white = init.white
    this.black = init.black
    this.incMs = init.incMs
    this.chess = init.chess
    this.whiteMs = init.whiteMs
    this.blackMs = init.blackMs
    this.outcome = init.outcome
    // Reprise après redémarrage : le temps de coupure n'est imputé à personne.
    this.tickingSince = init.status === 'active' ? init.now : null
  }

  colorOf(userId: string): Color | null {
    if (userId === this.white.id) return 'white'
    if (userId === this.black.id) return 'black'
    return null
  }

  turnColor(): Color {
    return this.chess.turn() === 'w' ? 'white' : 'black'
  }

  // ---- Présence -----------------------------------------------------------

  join(userId: string, socketId: string): void {
    const sockets = this.presence.get(userId) ?? new Set<string>()
    sockets.add(socketId)
    this.presence.set(userId, sockets)
  }

  leave(userId: string, socketId: string): void {
    const sockets = this.presence.get(userId)
    if (!sockets) return
    sockets.delete(socketId)
    if (sockets.size === 0) this.presence.delete(userId)
  }

  isConnected(color: Color): boolean {
    const player = color === 'white' ? this.white : this.black
    return (this.presence.get(player.id)?.size ?? 0) > 0
  }

  bothConnected(): boolean {
    return this.isConnected('white') && this.isConnected('black')
  }

  // ---- Horloges -----------------------------------------------------------

  remaining(color: Color, now: number): number {
    const base = color === 'white' ? this.whiteMs : this.blackMs
    if (this.status === 'active' && this.tickingSince !== null && this.turnColor() === color) {
      return Math.max(0, base - (now - this.tickingSince))
    }
    return base
  }

  /** Millisecondes avant la chute du drapeau du camp au trait (null si pas de partie active). */
  msUntilFlag(now: number): number | null {
    return this.status === 'active' ? this.remaining(this.turnColor(), now) : null
  }

  /** Termine la partie au temps si le camp au trait n'a plus de temps. */
  flag(now: number): boolean {
    if (this.status !== 'active') return false
    const loser = this.turnColor()
    if (this.remaining(loser, now) > 0) return false
    const winner = other(loser)
    this.finish(
      hasMatingMaterial(this.chess, winner)
        ? { winner, reason: 'timeout' }
        : { winner: 'draw', reason: 'insufficient' },
      now,
    )
    return true
  }

  // ---- Transitions --------------------------------------------------------

  start(now: number): boolean {
    if (this.status !== 'accepted') return false
    this.status = 'active'
    this.tickingSince = now
    return true
  }

  applyMove(userId: string, move: MoveInput, now: number): MoveResult {
    if (this.status !== 'active') return { ok: false, error: 'not_active' }
    const color = this.colorOf(userId)
    if (!color) return { ok: false, error: 'forbidden' }
    if (this.turnColor() !== color) return { ok: false, error: 'not_your_turn' }
    if (this.flag(now)) return { ok: false, error: 'timeout' }

    let played
    try {
      played = this.chess.move({ from: move.from, to: move.to, promotion: move.promotion })
    } catch {
      return { ok: false, error: 'illegal_move' }
    }

    const spent = now - (this.tickingSince ?? now)
    if (color === 'white') this.whiteMs = Math.max(0, this.whiteMs - spent) + this.incMs
    else this.blackMs = Math.max(0, this.blackMs - spent) + this.incMs
    this.tickingSince = now

    const end = this.detectEnd(color)
    if (end) this.finish(end, now)
    return { ok: true, san: played.san }
  }

  resign(userId: string, now: number): MoveResult {
    if (this.status !== 'active') return { ok: false, error: 'not_active' }
    const color = this.colorOf(userId)
    if (!color) return { ok: false, error: 'forbidden' }
    this.finish({ winner: other(color), reason: 'resignation' }, now)
    return { ok: true, san: '' }
  }

  private detectEnd(mover: Color): Outcome | null {
    const draw = (reason: Reason): Outcome => ({ winner: 'draw', reason })
    if (this.chess.isCheckmate()) return { winner: mover, reason: 'checkmate' }
    if (this.chess.isStalemate()) return draw('stalemate')
    if (this.chess.isInsufficientMaterial()) return draw('insufficient')
    if (this.chess.isThreefoldRepetition()) return draw('repetition')
    if (this.chess.isDrawByFiftyMoves()) return draw('fifty-moves')
    return null
  }

  private finish(outcome: Outcome, now: number): void {
    // Fige les horloges au moment de la fin.
    this.whiteMs = this.remaining('white', now)
    this.blackMs = this.remaining('black', now)
    this.status = 'finished'
    this.tickingSince = null
    this.outcome = outcome
  }

  // ---- Sérialisation ------------------------------------------------------

  snapshot(now: number): Snapshot {
    const last = this.chess.history({ verbose: true }).at(-1)
    return {
      id: this.id,
      status: this.status,
      fen: this.chess.fen(),
      turn: this.turnColor(),
      moves: this.chess.history(),
      lastMove: last ? { from: last.from, to: last.to } : null,
      white: this.white,
      black: this.black,
      hostId: this.hostId,
      whiteMs: this.remaining('white', now),
      blackMs: this.remaining('black', now),
      ticking: this.status === 'active' ? this.turnColor() : null,
      inCheck: this.chess.inCheck(),
      connected: { white: this.isConnected('white'), black: this.isConnected('black') },
      outcome: this.outcome,
    }
  }

  /** Corps du PATCH envoyé à Payload après chaque changement d'état. */
  persistBody(now: number): Record<string, unknown> {
    return {
      status: this.status,
      fen: this.chess.fen(),
      pgn: this.chess.pgn(),
      whiteMs: Math.round(this.remaining('white', now)),
      blackMs: Math.round(this.remaining('black', now)),
      lastMoveAt: new Date(now).toISOString(),
      ...(this.outcome ? { result: this.outcome.winner, resultReason: this.outcome.reason } : {}),
    }
  }
}

/** Reconstruit une partie en mémoire depuis un document Payload. */
export function liveFromDoc(doc: GameDoc, now: number): LiveGame | null {
  if (doc.status !== 'accepted' && doc.status !== 'active' && doc.status !== 'finished') return null

  const white = userRef(doc.whitePlayer)
  const black = userRef(doc.blackPlayer)
  const host = userRef(doc.host)
  if (!white || !black || !host) return null

  let chess = new Chess()
  if (doc.pgn && doc.pgn.trim()) {
    try {
      chess.loadPgn(doc.pgn)
    } catch {
      chess = doc.fen ? new Chess(doc.fen) : new Chess()
    }
  }

  const { baseMs, incMs } = parseTimeControl(doc.timeControl)
  const outcome: Outcome | null =
    doc.status === 'finished' && doc.result && doc.resultReason
      ? { winner: doc.result, reason: doc.resultReason as Reason }
      : null

  return new LiveGame({
    id: gameKey(doc.id),
    status: doc.status,
    hostId: host.id,
    white,
    black,
    incMs,
    chess,
    whiteMs: doc.whiteMs ?? baseMs,
    blackMs: doc.blackMs ?? baseMs,
    outcome,
    now,
  })
}
