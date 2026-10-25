import { jwtVerify } from 'jose'

export const JWT_ISSUER = 'chess-web'
export const JWT_AUDIENCE = 'chess-realtime'

export interface Claims {
  userId: string
  name: string
}

/** Vérifie le JWT court émis par la route /api/realtime-token du service web. */
export async function verifyToken(token: unknown, secret: string): Promise<Claims> {
  if (typeof token !== 'string' || token.length === 0) throw new Error('missing token')
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  })
  if (!payload.sub) throw new Error('missing subject')
  return {
    userId: String(payload.sub),
    name: typeof payload.name === 'string' ? payload.name : String(payload.sub),
  }
}
