import Link from 'next/link'
import type { ReactNode } from 'react'

import type { Game } from '../payload-types'
import { relId } from '../lib/access'
import { REASON_LABELS, STATUS_LABELS, TIME_CONTROLS } from '../lib/chess'
import { dateFormat, hostId, opponentId } from '../lib/data'

function resultFor(game: Game, meId: string): { label: string; tone: string } | null {
  if (game.status !== 'finished' || !game.result) return null
  if (game.result === 'draw') return { label: 'Nulle', tone: 'text-stone-300' }
  const winnerId = relId(game.result === 'white' ? game.whitePlayer : game.blackPlayer)
  return winnerId === meId
    ? { label: 'Victoire', tone: 'text-emerald-400' }
    : { label: 'Défaite', tone: 'text-red-400' }
}

interface GameLineProps {
  game: Game
  meId: string
  /** id (string) -> nom affiché */
  names: Record<string, string>
  /** Remplace le titre par défaut ("Contre X"), ex. « X te défie ». */
  title?: string
  /** Boutons à droite (accepter / refuser / annuler). Sans action, un lien ouvre la partie. */
  action?: ReactNode
}

/** Une ligne de liste de parties. Composant serveur : aucune interactivité ici. */
export function GameLine({ game, meId, names, title, action }: GameLineProps) {
  const otherId = hostId(game) === meId ? opponentId(game) : hostId(game)
  const other = names[otherId] ?? 'Joueur inconnu'
  const result = resultFor(game, meId)
  const timeControl = TIME_CONTROLS.find((tc) => tc.value === game.timeControl)?.label ?? game.timeControl
  const openable = game.status === 'accepted' || game.status === 'active' || game.status === 'finished'

  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-stone-800 bg-stone-900/60 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{title ?? `Contre ${other}`}</p>
        <p className="mt-0.5 text-sm text-stone-400">
          {result ? (
            <>
              <span className={`font-medium ${result.tone}`}>{result.label}</span>
              {game.resultReason ? ` par ${REASON_LABELS[game.resultReason] ?? game.resultReason}` : ''}
            </>
          ) : (
            (STATUS_LABELS[game.status] ?? game.status)
          )}
          {' · '}
          {timeControl}
          {' · '}
          {dateFormat.format(new Date(game.updatedAt))}
        </p>
      </div>
      {action ??
        (openable && (
          <Link
            href={`/games/${game.id}`}
            className="shrink-0 rounded-md border border-stone-600 px-3 py-1.5 text-sm font-medium hover:bg-stone-800"
          >
            {game.status === 'finished' ? 'Revoir' : 'Ouvrir'}
          </Link>
        ))}
    </li>
  )
}
