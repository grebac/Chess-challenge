import type { Config } from './config'

/** Document `games` tel que renvoyé par l'API REST de Payload (depth=1). */
export interface GameDoc {
  id: number | string
  status: string
  host: UserRef
  opponent: UserRef
  whitePlayer?: UserRef | null
  blackPlayer?: UserRef | null
  timeControl?: string | null
  fen?: string | null
  pgn?: string | null
  whiteMs?: number | null
  blackMs?: number | null
  result?: 'white' | 'black' | 'draw' | null
  resultReason?: string | null
}

export type UserRef = number | string | { id: number | string; displayName?: string; email?: string }

export interface PayloadClient {
  getGame(id: string): Promise<GameDoc | null>
  listActive(): Promise<GameDoc[]>
  patchGame(id: string, body: Record<string, unknown>): Promise<void>
}

export function createPayloadClient(
  config: Pick<Config, 'payloadUrl' | 'payloadApiKey'>,
  fetchImpl: typeof fetch = fetch,
): PayloadClient {
  const headers = {
    Authorization: `users API-Key ${config.payloadApiKey}`,
    'Content-Type': 'application/json',
  }

  async function request(path: string, init?: RequestInit): Promise<Response> {
    return fetchImpl(`${config.payloadUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    })
  }

  return {
    async getGame(id) {
      const res = await request(`/api/games/${encodeURIComponent(id)}?depth=1`)
      if (res.status === 404 || res.status === 403) return null
      if (!res.ok) throw new Error(`Payload GET /api/games/${id} -> ${res.status}`)
      return (await res.json()) as GameDoc
    },

    async listActive() {
      const query = new URLSearchParams({ depth: '1', limit: '200' })
      query.set('where[status][in]', 'accepted,active')
      const res = await request(`/api/games?${query}`)
      if (!res.ok) throw new Error(`Payload GET /api/games -> ${res.status}`)
      const json = (await res.json()) as { docs: GameDoc[] }
      return json.docs
    },

    async patchGame(id, body) {
      const res = await request(`/api/games/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error(`Payload PATCH /api/games/${id} -> ${res.status} ${await res.text()}`)
      }
    },
  }
}
