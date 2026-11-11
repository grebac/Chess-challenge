import configPromise from '@payload-config'
import { randomBytes } from 'node:crypto'
import { generatePayloadCookie, getPayload } from 'payload'

import { TIME_CONTROLS } from '@/lib/chess'
import { allow } from '@/lib/rateLimit'

// Route publique : un visiteur sans compte défie un joueur qui l'a autorisé, avec un simple pseudo.
// Elle crée un compte « invité » temporaire (mot de passe aléatoire, jamais communiqué), ouvre sa session
// par cookie, puis envoie le défi. Tout ce qui compte est revérifié côté serveur (hooks de Games/Users).
export const dynamic = 'force-dynamic'

// 2 à 24 caractères : lettres/chiffres d'abord, puis espaces, point, tiret, tiret bas, apostrophe.
const PSEUDO = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]{1,23}$/u
const COLORS = ['white', 'black', 'random'] as const

const fail = (status: number, error: string) => Response.json({ error }, { status })

function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')
  if (real) return real
  // Le proxy ajoute l'IP réelle en dernier ; les premières entrées peuvent être forgées par le client.
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean)
  return forwarded?.at(-1) ?? 'unknown'
}

export async function POST(request: Request) {
  // Refuse les appels venus d'un autre site (le cookie de session invité ne doit pas être posé par un tiers).
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (origin) {
    try {
      if (new URL(origin).host !== host) return fail(403, 'forbidden_origin')
    } catch {
      return fail(403, 'forbidden_origin')
    }
  }

  // Limites : par adresse IP, et globales pour borner les créations de comptes même derrière un proxy.
  if (!allow(`guest:ip:${clientIp(request)}`, 4, 10 * 60_000) || !allow('guest:global', 40, 60 * 60_000)) {
    return fail(429, 'too_many_requests')
  }

  let body: { pseudo?: unknown; target?: unknown; hostColor?: unknown; timeControl?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return fail(400, 'bad_request')
  }

  const pseudo = typeof body.pseudo === 'string' ? body.pseudo.trim().replace(/\s+/g, ' ') : ''
  const hostColor = COLORS.find((c) => c === body.hostColor)
  const timeControl = TIME_CONTROLS.find((tc) => tc.value === body.timeControl)?.value
  const targetId = typeof body.target === 'string' || typeof body.target === 'number' ? String(body.target) : ''
  if (!PSEUDO.test(pseudo)) return fail(400, 'bad_pseudo')
  if (!hostColor || !timeControl || !/^\d+$/.test(targetId)) return fail(400, 'bad_request')

  const payload = await getPayload({ config: configPromise })

  // Ne jamais écraser la session d'un vrai compte par un cookie d'invité.
  const { user: current } = await payload.auth({ headers: request.headers })
  if (current && current.role !== 'guest') return fail(409, 'already_logged_in')

  const found = await payload.find({
    collection: 'users',
    where: {
      and: [{ id: { equals: Number(targetId) } }, { acceptsGuests: { equals: true } }, { role: { in: ['player', 'admin'] } }],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { displayName: true },
  })
  const target = found.docs[0]
  if (!target) return fail(404, 'target_not_found')

  // Le suffixe « (invité) » est toujours ajouté : impossible de se faire passer pour un collègue.
  const email = `guest-${randomBytes(8).toString('hex')}@guest.invalid`
  const password = randomBytes(24).toString('hex')
  const guest = await payload.create({
    collection: 'users',
    data: { email, password, displayName: `${pseudo} (invité)`, role: 'guest' },
    overrideAccess: true,
  })

  try {
    const login = await payload.login({ collection: 'users', data: { email, password } })
    if (!login.token) throw new Error('no_token')

    const game = await payload.create({
      collection: 'games',
      // host et status sont réimposés par le hook ; ils figurent ici seulement pour satisfaire les types.
      data: { host: guest.id, opponent: target.id, status: 'pending', hostColor, timeControl },
      user: { ...login.user, collection: 'users' },
      overrideAccess: false,
    })

    const cookie = generatePayloadCookie({
      collectionAuthConfig: payload.collections.users.config.auth,
      cookiePrefix: payload.config.cookiePrefix,
      token: login.token,
    })
    return Response.json({ gameId: String(game.id) }, { headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } })
  } catch (error) {
    // Pas de compte orphelin si le défi n'a pas pu être créé.
    await payload.delete({ collection: 'users', id: guest.id, overrideAccess: true }).catch(() => {})
    const status = (error as { status?: number }).status
    if (status === 400 || status === 403 || status === 429) return fail(status, (error as Error).message)
    console.error('[guest] échec :', error)
    return fail(500, 'server_error')
  }
}
