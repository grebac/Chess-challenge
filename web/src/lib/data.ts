import type { Payload, Where } from 'payload'

import type { Game, User } from '../payload-types'
import { relId } from './access'

export interface Player {
  id: User['id']
  name: string
}

/** Tous les joueurs (hors compte de service), pour le formulaire de défi et l'affichage des noms. */
export async function listPlayers(payload: Payload): Promise<Player[]> {
  const result = await payload.find({
    collection: 'users',
    where: { role: { not_equals: 'service' } },
    pagination: false,
    depth: 0,
    sort: 'displayName',
    overrideAccess: true,
    select: { displayName: true },
  })
  return result.docs.map((doc) => ({ id: doc.id, name: doc.displayName }))
}

export const namesById = (players: Player[]): Record<string, string> =>
  Object.fromEntries(players.map((p) => [String(p.id), p.name]))

/** Parties de l'utilisateur, filtrées par le contrôle d'accès de Payload. */
export async function listMyGames(
  payload: Payload,
  user: { id: User['id'] },
  where: Where,
  limit = 50,
): Promise<Game[]> {
  const result = await payload.find({
    collection: 'games',
    user: user as User & { collection: 'users' },
    overrideAccess: false,
    depth: 0,
    limit,
    sort: '-updatedAt',
    where,
  })
  return result.docs
}

export const dateFormat = new Intl.DateTimeFormat('fr-BE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Brussels',
})

export const hostId = (game: Game) => relId(game.host)!
export const opponentId = (game: Game) => relId(game.opponent)!
