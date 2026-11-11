import type { Payload, Where } from 'payload'

import type { Game, User } from '../payload-types'
import { relId } from './access'

export interface Player {
  id: User['id']
  name: string
  role: User['role']
}

/**
 * Tous les comptes utilisables dans l'interface (hors compte de service), invités compris :
 * sert à retrouver le nom de n'importe quel adversaire. Pour proposer des adversaires à défier,
 * passer par `challengeablePlayers` (qui écarte les invités).
 */
export async function listPlayers(payload: Payload): Promise<Player[]> {
  const result = await payload.find({
    collection: 'users',
    where: { role: { not_equals: 'service' } },
    pagination: false,
    depth: 0,
    sort: 'displayName',
    overrideAccess: true,
    select: { displayName: true, role: true },
  })
  return result.docs.map((doc) => ({ id: doc.id, name: doc.displayName, role: doc.role }))
}

/** Joueurs que l'on peut défier depuis son compte : ni soi-même, ni les invités temporaires. */
export const challengeablePlayers = (players: Player[], meId: string): Player[] =>
  players.filter((p) => String(p.id) !== meId && p.role !== 'guest')

/** Joueurs qui acceptent les défis d'invités (cochés par l'admin) : seuls visibles sur la page publique. */
export async function listGuestTargets(payload: Payload): Promise<{ id: User['id']; name: string }[]> {
  const result = await payload.find({
    collection: 'users',
    where: { and: [{ acceptsGuests: { equals: true } }, { role: { in: ['player', 'admin'] } }] },
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
