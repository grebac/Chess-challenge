import { Chess } from 'chess.js'

import type { Outcome } from './realtime-types'

export interface Step {
  /** Position après ce coup (index 0 = position de départ). */
  fen: string
  lastMove: { from: string; to: string } | null
}

/** Rejoue les coups SAN depuis le départ : steps[i] = position après i coups. */
export function replay(moves: string[]): Step[] {
  const chess = new Chess()
  const steps: Step[] = [{ fen: chess.fen(), lastMove: null }]
  for (const san of moves) {
    try {
      const move = chess.move(san)
      steps.push({ fen: chess.fen(), lastMove: { from: move.from, to: move.to } })
    } catch {
      break // liste incohérente : on s'arrête à la dernière position valide
    }
  }
  return steps
}

/** Case du roi en échec dans cette position, sinon null. */
export function checkSquare(fen: string): string | null {
  try {
    const chess = new Chess(fen)
    if (!chess.inCheck()) return null
    const turn = chess.turn()
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === turn) return cell.square
      }
    }
  } catch {
    // FEN invalide : pas de surbrillance
  }
  return null
}

const RESULT_TAG: Record<'white' | 'black' | 'draw', string> = { white: '1-0', black: '0-1', draw: '1/2-1/2' }

/** PGN complet de la partie, importable sur Lichess, chess.com, etc. */
export function buildPgn(args: { moves: string[]; white: string; black: string; outcome: Outcome | null; site: string }): string {
  const chess = new Chess()
  for (const san of args.moves) {
    try {
      chess.move(san)
    } catch {
      break
    }
  }
  chess.setHeader('Event', 'Partie entre collègues')
  chess.setHeader('Site', args.site)
  chess.setHeader('White', args.white)
  chess.setHeader('Black', args.black)
  chess.setHeader('Result', args.outcome ? RESULT_TAG[args.outcome.winner] : '*')
  return chess.pgn()
}

/** Ouvre la position sur l'éditeur d'analyse de Lichess (les espaces du FEN deviennent des « _ »). */
export function lichessAnalysisUrl(fen: string): string {
  return `https://lichess.org/analysis/${fen.replace(/ /g, '_')}`
}
