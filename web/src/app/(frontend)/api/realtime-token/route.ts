import configPromise from '@payload-config'
import { SignJWT } from 'jose'
import { getPayload } from 'payload'

// Doivent rester identiques à realtime/src/auth.ts
const ISSUER = 'chess-web'
const AUDIENCE = 'chess-realtime'

export const dynamic = 'force-dynamic'

/**
 * Émet un JWT court pour la connexion Socket.io et indique l'URL du service realtime.
 * L'URL est lue à l'exécution (REALTIME_URL) : pas de NEXT_PUBLIC_*, donc rien à injecter au build Docker.
 */
export async function GET(request: Request) {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const secret = process.env.REALTIME_SECRET
  const url = process.env.REALTIME_URL
  if (!secret || !url) {
    return Response.json({ error: 'realtime_not_configured' }, { status: 500 })
  }

  const token = await new SignJWT({ name: user.displayName })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))

  return Response.json({ token, url }, { headers: { 'Cache-Control': 'no-store' } })
}
