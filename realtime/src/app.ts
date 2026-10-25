import { createServer } from 'node:http'
import { Server } from 'socket.io'

import { verifyToken } from './auth'
import type { Config } from './config'
import { LiveGame, liveFromDoc } from './game'
import { parseGameId, roomKey } from './keys'
import type { PayloadClient } from './payloadClient'
import type { Ack, Snapshot } from './types'

interface SocketData {
  userId: string
  name: string
  games: Set<string>
}

export interface AppOptions {
  now?: () => number
  log?: Pick<Console, 'log' | 'warn' | 'error'>
  /** Délais (ms) entre les tentatives de sauvegarde vers Payload. */
  persistRetryDelays?: number[]
  /** Durée de conservation en mémoire d'une partie terminée. */
  finishedTtlMs?: number
}

const SQUARE = /^[a-h][1-8]$/
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type AckFn = (response: Ack<{ state?: Snapshot; now?: number; userId?: string }>) => void
const ackOf = (cb: unknown): AckFn => (typeof cb === 'function' ? (cb as AckFn) : () => {})

export function createApp(config: Config, payload: PayloadClient, options: AppOptions = {}) {
  const now = options.now ?? Date.now
  const log = options.log ?? console
  const retryDelays = options.persistRetryDelays ?? [300, 1000, 3000]
  const finishedTtlMs = options.finishedTtlMs ?? 10 * 60_000

  /** Clé = String(id) : voir keys.ts (piège n°9). */
  const games = new Map<string, LiveGame>()
  const loading = new Map<string, Promise<LiveGame | null>>()
  const queues = new Map<string, Promise<void>>()
  let recovered = false

  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, recovered, games: games.size }))
      return
    }
    res.writeHead(404)
    res.end()
  })

  const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(
    httpServer,
    {
      cors: { origin: config.webOrigins },
      maxHttpBufferSize: 10_000,
      // Les navigateurs envoient toujours Origin ; les clients non-navigateur (tests) n'en ont pas
      // mais doivent de toute façon présenter un JWT valide.
      allowRequest: (req, callback) => {
        const origin = req.headers.origin
        callback(null, !origin || config.webOrigins.includes(origin))
      },
    },
  )

  // ---- Persistance vers Payload (file séquentielle par partie) -------------

  function persist(game: LiveGame): void {
    const body = game.persistBody(now())
    const previous = queues.get(game.id) ?? Promise.resolve()
    const next = previous
      .then(async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            await payload.patchGame(game.id, body)
            return
          } catch (error) {
            if (attempt >= retryDelays.length) throw error
            await sleep(retryDelays[attempt]!)
          }
        }
      })
      .catch((error) => log.error(`[persist] partie ${game.id} non sauvegardée :`, error))
    queues.set(game.id, next)
  }

  const flush = async (): Promise<void> => {
    await Promise.all([...queues.values()])
  }

  // ---- Diffusion et cycle de vie -----------------------------------------

  function broadcast(game: LiveGame): void {
    io.to(roomKey(game.id)).emit('game:state', game.snapshot(now()))
  }

  function scheduleCleanup(game: LiveGame): void {
    clearTimeout(game.cleanupTimer)
    game.cleanupTimer = setTimeout(() => {
      if (game.presence.size > 0) return scheduleCleanup(game)
      games.delete(game.id)
      queues.delete(game.id)
    }, finishedTtlMs)
    game.cleanupTimer.unref()
  }

  /** À appeler quand une partie vient de se terminer. */
  function settle(game: LiveGame): void {
    clearTimeout(game.flagTimer)
    persist(game)
    const state = game.snapshot(now())
    io.to(roomKey(game.id)).emit('game:state', state)
    io.to(roomKey(game.id)).emit('game:over', state)
    scheduleCleanup(game)
  }

  function scheduleFlag(game: LiveGame): void {
    clearTimeout(game.flagTimer)
    const ms = game.msUntilFlag(now())
    if (ms === null) return
    game.flagTimer = setTimeout(() => {
      if (game.flag(now())) settle(game)
      else scheduleFlag(game)
    }, ms + 20)
  }

  function register(game: LiveGame): LiveGame {
    games.set(game.id, game)
    if (game.status === 'active') scheduleFlag(game)
    if (game.status === 'finished') scheduleCleanup(game)
    return game
  }

  async function getGame(id: string): Promise<LiveGame | null> {
    const cached = games.get(id)
    if (cached) return cached
    const inFlight = loading.get(id)
    if (inFlight) return inFlight

    const promise = (async () => {
      const doc = await payload.getGame(id)
      if (!doc) return null
      const game = liveFromDoc(doc, now())
      return game ? register(game) : null
    })().finally(() => loading.delete(id))
    loading.set(id, promise)
    return promise
  }

  /** Recharge les parties acceptées/actives (redéploiement). Tente jusqu'à ce que Payload réponde. */
  async function recover(maxAttempts = 12): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const docs = await payload.listActive()
        for (const doc of docs) {
          const game = liveFromDoc(doc, now())
          if (game && !games.has(game.id)) register(game)
        }
        recovered = true
        log.log(`[recover] ${games.size} partie(s) rechargée(s)`)
        return
      } catch (error) {
        log.warn(`[recover] tentative ${attempt + 1} échouée :`, (error as Error).message)
        await sleep(Math.min(30_000, 1000 * 2 ** attempt))
      }
    }
    log.error('[recover] abandon : les parties seront chargées à la demande')
  }

  // ---- Authentification ---------------------------------------------------

  io.use(async (socket, next) => {
    try {
      const claims = await verifyToken(
        (socket.handshake.auth as { token?: unknown } | undefined)?.token,
        config.realtimeSecret,
      )
      socket.data.userId = claims.userId
      socket.data.name = claims.name
      socket.data.games = new Set()
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  // ---- Événements ---------------------------------------------------------

  io.on('connection', (socket) => {
    const userId = socket.data.userId
    const gameFrom = (input: unknown): { id: string; game: LiveGame | undefined } | null => {
      const id = parseGameId((input as { gameId?: unknown } | null)?.gameId)
      return id ? { id, game: games.get(id) } : null
    }

    // Étape 2 du plan de déploiement : simple écho pour valider WebSocket, CORS et domaines.
    // Variadique : `emit('ping', cb)` et `emit('ping', données, cb)` fonctionnent tous les deux.
    socket.on('ping', (...args: unknown[]) => {
      ackOf(args.at(-1))({ ok: true, now: now(), userId })
    })

    socket.on('game:join', async (input: unknown, cb: unknown) => {
      const reply = ackOf(cb)
      const id = parseGameId((input as { gameId?: unknown } | null)?.gameId)
      if (!id) return reply({ ok: false, error: 'bad_request' })

      let game: LiveGame | null
      try {
        game = await getGame(id)
      } catch (error) {
        log.error('[join] Payload injoignable :', (error as Error).message)
        return reply({ ok: false, error: 'unavailable' })
      }
      if (!game) return reply({ ok: false, error: 'not_found' })
      if (!game.colorOf(userId)) return reply({ ok: false, error: 'forbidden' })

      await socket.join(roomKey(game.id))
      socket.data.games.add(game.id)
      game.join(userId, socket.id)
      broadcast(game) // l'autre joueur voit l'arrivée (salle d'attente)
      reply({ ok: true, state: game.snapshot(now()) })
    })

    // L'hôte lance la partie ; l'adversaire en attente y entre via game:start.
    socket.on('host:ready', (input: unknown, cb: unknown) => {
      const reply = ackOf(cb)
      const target = gameFrom(input)
      if (!target?.game) return reply({ ok: false, error: 'not_found' })
      const { game } = target
      if (userId !== game.hostId) return reply({ ok: false, error: 'forbidden' })
      if (game.status !== 'accepted') return reply({ ok: false, error: 'bad_status' })
      if (!game.bothConnected()) return reply({ ok: false, error: 'opponent_absent' })

      game.start(now())
      scheduleFlag(game)
      persist(game)
      const state = game.snapshot(now())
      io.to(roomKey(game.id)).emit('game:start', state)
      reply({ ok: true, state })
    })

    socket.on('game:move', (input: unknown, cb: unknown) => {
      const reply = ackOf(cb)
      const target = gameFrom(input)
      if (!target?.game) return reply({ ok: false, error: 'not_found' })
      const { game } = target

      const { from, to, promotion } = (input ?? {}) as { from?: unknown; to?: unknown; promotion?: unknown }
      if (typeof from !== 'string' || typeof to !== 'string' || !SQUARE.test(from) || !SQUARE.test(to)) {
        return reply({ ok: false, error: 'bad_request' })
      }
      const promo = typeof promotion === 'string' && /^[qrbn]$/.test(promotion) ? promotion : undefined

      const result = game.applyMove(userId, { from, to, promotion: promo }, now())
      if (!result.ok) {
        if (result.error === 'timeout') settle(game)
        return reply(result)
      }
      if (game.status === 'finished') {
        settle(game)
      } else {
        persist(game)
        scheduleFlag(game)
        broadcast(game)
      }
      reply({ ok: true })
    })

    socket.on('game:resign', (input: unknown, cb: unknown) => {
      const reply = ackOf(cb)
      const target = gameFrom(input)
      if (!target?.game) return reply({ ok: false, error: 'not_found' })
      const result = target.game.resign(userId, now())
      if (!result.ok) return reply(result)
      settle(target.game)
      reply({ ok: true })
    })

    socket.on('disconnect', () => {
      for (const id of socket.data.games) {
        const game = games.get(id)
        if (!game) continue
        game.leave(userId, socket.id)
        broadcast(game)
      }
    })
  })

  async function close(): Promise<void> {
    for (const game of games.values()) {
      clearTimeout(game.flagTimer)
      clearTimeout(game.cleanupTimer)
    }
    await flush()
    await new Promise<void>((resolve) => {
      io.close(() => resolve())
    })
  }

  return { httpServer, io, games, recover, flush, close }
}
