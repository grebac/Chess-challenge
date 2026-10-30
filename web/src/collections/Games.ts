import type { CollectionBeforeChangeHook, CollectionConfig, Where } from 'payload'
import { APIError } from 'payload'

import type { Game } from '../payload-types'
import { isPrivileged, relId, relRaw } from '../lib/access'
import { START_FEN, TIME_CONTROLS, parseTimeControl, resolveHostColor } from '../lib/chess'

/**
 * Règles d'écriture pour les joueurs ordinaires (admin et service ont la main libre) :
 *  - création : un défi `pending` dont l'hôte est forcément l'utilisateur connecté ;
 *  - mise à jour : uniquement un changement de `status` autorisé
 *      pending -> accepted | declined (adversaire), pending -> cancelled (hôte).
 * Tout le reste (coups, horloges, résultat) est écrit par le service realtime.
 */
const guardChanges: CollectionBeforeChangeHook<Game> = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  const user = req.user
  // Pas d'utilisateur = appel interne (Local API sans req.user) ; privilégié = admin ou service.
  if (!user || isPrivileged(user)) {
    // Même pour un admin : une acceptation sans couleurs assignées donnerait une partie que le
    // service realtime ne peut pas charger (« Partie introuvable »). On les fixe donc ici aussi.
    if (
      operation === 'update' &&
      originalDoc?.status === 'pending' &&
      data.status === 'accepted' &&
      !relRaw(data.whitePlayer ?? originalDoc.whitePlayer) &&
      !relRaw(data.blackPlayer ?? originalDoc.blackPlayer)
    ) {
      const hostRaw = relRaw(originalDoc.host)!
      const opponentRaw = relRaw(originalDoc.opponent)!
      const hostIsWhite = resolveHostColor(originalDoc.hostColor) === 'white'
      return {
        ...data,
        whitePlayer: hostIsWhite ? hostRaw : opponentRaw,
        blackPlayer: hostIsWhite ? opponentRaw : hostRaw,
      } as Partial<Game>
    }
    return data
  }

  const uid = String(user.id)

  if (operation === 'create') {
    const opponentId = relId(data.opponent)
    if (!opponentId) throw new APIError('Choisis un adversaire.', 400)
    if (opponentId === uid) throw new APIError('Tu ne peux pas te défier toi-même.', 400)

    const found = await req.payload.find({
      collection: 'users',
      where: { id: { equals: relRaw(data.opponent) } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { role: true },
      req,
    })
    const opponent = found.docs[0]
    if (!opponent || opponent.role === 'service') throw new APIError('Adversaire introuvable.', 400)

    const timeControl = data.timeControl ?? '10+0'
    const { baseMs } = parseTimeControl(timeControl)

    return {
      host: user.id,
      opponent: opponent.id,
      hostColor: data.hostColor ?? 'random',
      timeControl,
      status: 'pending',
      fen: START_FEN,
      pgn: '',
      whiteMs: baseMs,
      blackMs: baseMs,
    }
  }

  if (!originalDoc) throw new APIError('Partie introuvable.', 404)

  const current = originalDoc.status
  const next = data.status
  const isHost = relId(originalDoc.host) === uid
  const isOpponent = relId(originalDoc.opponent) === uid

  // On renvoie un objet NEUF (jamais `data` : le client ne doit rien pouvoir glisser d'autre),
  // mais Payload valide les champs requis sur cet objet : host et opponent doivent donc y figurer,
  // sinon la mise à jour échoue avec « Host / Opponent : champ requis ».
  const hostRaw = relRaw(originalDoc.host)!
  const opponentRaw = relRaw(originalDoc.opponent)!
  const keep = { host: hostRaw, opponent: opponentRaw }

  if (current === 'pending' && next === 'accepted' && isOpponent) {
    // Les couleurs sont fixées à l'acceptation : le service realtime les lit telles quelles.
    const hostIsWhite = resolveHostColor(originalDoc.hostColor) === 'white'
    return {
      ...keep,
      status: 'accepted',
      whitePlayer: hostIsWhite ? hostRaw : opponentRaw,
      blackPlayer: hostIsWhite ? opponentRaw : hostRaw,
    } as Partial<Game>
  }
  if (current === 'pending' && next === 'declined' && isOpponent) {
    return { ...keep, status: 'declined' } as Partial<Game>
  }
  if (current === 'pending' && next === 'cancelled' && isHost) {
    return { ...keep, status: 'cancelled' } as Partial<Game>
  }

  throw new APIError('Modification non autorisée.', 403)
}

/** Filtre d'accès : seulement les parties où l'utilisateur est l'hôte ou l'adversaire. */
const ownGames = (userId: number | string): Where => ({
  or: [{ host: { equals: userId } }, { opponent: { equals: userId } }],
})

export const Games: CollectionConfig = {
  slug: 'games',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['id', 'host', 'opponent', 'status', 'result', 'createdAt'],
  },
  defaultSort: '-createdAt',
  access: {
    create: ({ req }) => Boolean(req.user),
    read: ({ req }) => {
      const user = req.user
      if (!user) return false
      if (isPrivileged(user)) return true
      return ownGames(user.id)
    },
    update: ({ req }) => {
      const user = req.user
      if (!user) return false
      if (isPrivileged(user)) return true
      return ownGames(user.id)
    },
    delete: ({ req }) => req.user?.role === 'admin',
  },
  hooks: {
    beforeChange: [guardChanges],
  },
  fields: [
    { name: 'host', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'opponent', type: 'relationship', relationTo: 'users', required: true, index: true },
    {
      name: 'hostColor',
      type: 'select',
      defaultValue: 'random',
      options: [
        { label: 'Blancs', value: 'white' },
        { label: 'Noirs', value: 'black' },
        { label: 'Au hasard', value: 'random' },
      ],
    },
    {
      name: 'timeControl',
      type: 'select',
      defaultValue: '10+0',
      options: TIME_CONTROLS.map(({ value, label }) => ({ value, label })),
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'En attente', value: 'pending' },
        { label: 'Acceptée', value: 'accepted' },
        { label: 'En cours', value: 'active' },
        { label: 'Terminée', value: 'finished' },
        { label: 'Refusée', value: 'declined' },
        { label: 'Annulée', value: 'cancelled' },
      ],
    },
    // Renseignés à l'acceptation.
    { name: 'whitePlayer', type: 'relationship', relationTo: 'users' },
    { name: 'blackPlayer', type: 'relationship', relationTo: 'users' },
    // État de la partie, écrit par le service realtime après chaque coup.
    { name: 'fen', type: 'text', defaultValue: START_FEN },
    { name: 'pgn', type: 'textarea', defaultValue: '' },
    { name: 'whiteMs', type: 'number' },
    { name: 'blackMs', type: 'number' },
    { name: 'lastMoveAt', type: 'date' },
    {
      name: 'result',
      type: 'select',
      options: [
        { label: 'Victoire des blancs', value: 'white' },
        { label: 'Victoire des noirs', value: 'black' },
        { label: 'Nulle', value: 'draw' },
      ],
    },
    {
      name: 'resultReason',
      type: 'select',
      options: [
        { label: 'Échec et mat', value: 'checkmate' },
        { label: 'Abandon', value: 'resignation' },
        { label: 'Temps écoulé', value: 'timeout' },
        { label: 'Pat', value: 'stalemate' },
        { label: 'Triple répétition', value: 'repetition' },
        { label: 'Matériel insuffisant', value: 'insufficient' },
        { label: 'Règle des 50 coups', value: 'fifty-moves' },
      ],
    },
  ],
}