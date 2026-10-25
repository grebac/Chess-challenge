import assert from 'node:assert/strict'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, test } from 'node:test'

import { SignJWT } from 'jose'
import { io as connect, type Socket } from 'socket.io-client'

import { JWT_AUDIENCE, JWT_ISSUER } from '../src/auth'
import { createApp } from '../src/app'
import type { Config } from '../src/config'
import { createPayloadClient, type GameDoc } from '../src/payloadClient'
import type { Snapshot } from '../src/types'

const API_KEY = 'test-api-key'
const SECRET = 'test-realtime-secret-0123456789'

// ---- Faux Payload ---------------------------------------------------------

function startFakePayload() {
  const docs = new Map<string, GameDoc>()
  const patches: { id: string; body: Record<string, unknown> }[] = []

  const server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.headers.authorization !== `users API-Key ${API_KEY}`) return send(401, { errors: [] })

    const url = new URL(req.url!, 'http://x')
    const match = url.pathname.match(/^\/api\/games\/([^/]+)$/)

    if (req.method === 'GET' && match) {
      const doc = docs.get(decodeURIComponent(match[1]!))
      return doc ? send(200, doc) : send(404, { errors: [] })
    }
    if (req.method === 'GET' && url.pathname === '/api/games') {
      const wanted = (url.searchParams.get('where[status][in]') ?? '').split(',')
      return send(200, { docs: [...docs.values()].filter((d) => wanted.includes(d.status)) })
    }
    if (req.method === 'PATCH' && match) {
      let raw = ''
      req.on('data', (chunk) => (raw += chunk))
      req.on('end', () => {
        const id = decodeURIComponent(match[1]!)
        const body = JSON.parse(raw) as Record<string, unknown>
        patches.push({ id, body })
        docs.set(id, { ...docs.get(id)!, ...body } as GameDoc)
        send(200, { doc: docs.get(id) })
      })
      return
    }
    send(404, {})
  })

  return new Promise<{ server: HttpServer; url: string; docs: typeof docs; patches: typeof patches }>(
    (resolve) => {
      server.listen(0, '127.0.0.1', () =>
        resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, docs, patches }),
      )
    },
  )
}

const user = (id: number, displayName: string) => ({ id, displayName })

/** Les ids Payload sont des ENTIERS : le test le reproduit exprès (piège n°9). */
function gameDoc(id: number, overrides: Partial<GameDoc> = {}): GameDoc {
  return {
    id,
    status: 'accepted',
    host: user(1, 'Alice'),
    opponent: user(2, 'Bob'),
    whitePlayer: user(1, 'Alice'),
    blackPlayer: user(2, 'Bob'),
    timeControl: '5+0',
    fen: null,
    pgn: '',
    whiteMs: 300_000,
    blackMs: 300_000,
    ...overrides,
  }
}

// ---- Aides client ---------------------------------------------------------

async function token(userId: number, name: string, secret = SECRET): Promise<string> {
  return new SignJWT({ name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret))
}

function client(url: string, tok: string): Promise<Socket> {
  const socket = connect(url, { auth: { token: tok }, transports: ['websocket'], reconnection: false })
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket))
    socket.on('connect_error', reject)
  })
}

const emit = <T = Record<string, unknown>>(socket: Socket, event: string, payload?: unknown): Promise<T> =>
  new Promise((resolve) => socket.emit(event, payload, resolve))

const waitFor = <T>(socket: Socket, event: string): Promise<T> =>
  new Promise((resolve) => socket.once(event, resolve))

// ---- Tests ----------------------------------------------------------------

describe('service realtime', () => {
  let fake: Awaited<ReturnType<typeof startFakePayload>>
  let appUrl: string
  let app: ReturnType<typeof createApp>
  const sockets: Socket[] = []
  const silent = { log() {}, warn() {}, error() {} }

  const config = (): Config => ({
    port: 0,
    payloadUrl: fake.url,
    payloadApiKey: API_KEY,
    realtimeSecret: SECRET,
    webOrigins: ['http://localhost:3000'],
  })

  before(async () => {
    fake = await startFakePayload()
    app = createApp(config(), createPayloadClient(config()), { log: silent, persistRetryDelays: [10] })
    await new Promise<void>((resolve) => app.httpServer.listen(0, '127.0.0.1', resolve))
    appUrl = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`
  })

  after(async () => {
    for (const socket of sockets) socket.disconnect()
    await app.close()
    fake.server.close()
  })

  const track = async (promise: Promise<Socket>) => {
    const socket = await promise
    sockets.push(socket)
    return socket
  }

  test('/health répond et ping fait écho', async () => {
    const res = await fetch(`${appUrl}/health`)
    assert.equal(res.status, 200)
    const alice = await track(client(appUrl, await token(1, 'Alice')))
    const pong = await emit<{ ok: boolean; userId: string }>(alice, 'ping')
    assert.equal(pong.ok, true)
    assert.equal(pong.userId, '1')
  })

  test('refuse un JWT absent, invalide ou signé avec un autre secret', async () => {
    await assert.rejects(client(appUrl, ''), /unauthorized/)
    await assert.rejects(client(appUrl, 'pas-un-jwt'), /unauthorized/)
    await assert.rejects(client(appUrl, await token(1, 'Alice', 'autre-secret-0123456789abcdef')), /unauthorized/)
  })

  test('partie complète : attente, host:ready, mat du berger, persistance', async () => {
    fake.docs.set('10', gameDoc(10))
    const alice = await track(client(appUrl, await token(1, 'Alice')))
    const bob = await track(client(appUrl, await token(2, 'Bob')))
    const carol = await track(client(appUrl, await token(3, 'Carol')))

    // Un tiers ne peut pas entrer ; un id absent renvoie not_found.
    assert.deepEqual(await emit(carol, 'game:join', { gameId: '10' }), { ok: false, error: 'forbidden' })
    assert.deepEqual(await emit(carol, 'game:join', { gameId: '999' }), { ok: false, error: 'not_found' })

    // Piège n°9 : l'id arrive en nombre OU en string, c'est la même room.
    const joinedBob = await emit<{ ok: true; state: Snapshot }>(bob, 'game:join', { gameId: 10 })
    assert.equal(joinedBob.ok, true)
    assert.equal(joinedBob.state.status, 'accepted')
    assert.equal(joinedBob.state.connected.white, false) // l'hôte n'est pas encore là

    // L'hôte ne peut pas lancer tant que l'adversaire... est là ? Ici Bob attend : Alice arrive.
    const bobSeesAlice = waitFor<Snapshot>(bob, 'game:state')
    const joinedAlice = await emit<{ ok: true; state: Snapshot }>(alice, 'game:join', { gameId: '10' })
    assert.equal(joinedAlice.ok, true)
    assert.equal((await bobSeesAlice).connected.white, true)

    // Seul l'hôte peut lancer ; coups refusés avant le départ.
    assert.deepEqual(await emit(bob, 'host:ready', { gameId: '10' }), { ok: false, error: 'forbidden' })
    assert.deepEqual(await emit(alice, 'game:move', { gameId: '10', from: 'e2', to: 'e4' }), {
      ok: false,
      error: 'not_active',
    })

    const bobStarts = waitFor<Snapshot>(bob, 'game:start')
    const started = await emit<{ ok: true; state: Snapshot }>(alice, 'host:ready', { gameId: '10' })
    assert.equal(started.ok, true)
    assert.equal((await bobStarts).status, 'active') // l'adversaire en attente entre en partie

    // Coups illégaux / hors tour.
    assert.deepEqual(await emit(bob, 'game:move', { gameId: '10', from: 'e7', to: 'e5' }), {
      ok: false,
      error: 'not_your_turn',
    })
    assert.deepEqual(await emit(alice, 'game:move', { gameId: '10', from: 'e2', to: 'e5' }), {
      ok: false,
      error: 'illegal_move',
    })
    assert.deepEqual(await emit(alice, 'game:move', { gameId: '10', from: 'zz', to: 'e4' }), {
      ok: false,
      error: 'bad_request',
    })

    // Mat du berger : 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#
    const line: [typeof alice, string, string][] = [
      [alice, 'e2', 'e4'],
      [bob, 'e7', 'e5'],
      [alice, 'f1', 'c4'],
      [bob, 'b8', 'c6'],
      [alice, 'd1', 'h5'],
      [bob, 'g8', 'f6'],
    ]
    for (const [who, from, to] of line) {
      assert.deepEqual(await emit(who, 'game:move', { gameId: '10', from, to }), { ok: true })
    }
    const over = waitFor<Snapshot>(bob, 'game:over')
    assert.deepEqual(await emit(alice, 'game:move', { gameId: '10', from: 'h5', to: 'f7' }), { ok: true })

    const final = await over
    assert.equal(final.status, 'finished')
    assert.deepEqual(final.outcome, { winner: 'white', reason: 'checkmate' })
    assert.equal(final.moves.at(-1), 'Qxf7#')
    assert.equal(final.ticking, null)

    // Persistance : le dernier PATCH contient le résultat, et chaque coup a été sauvegardé.
    await app.flush()
    const last = fake.patches.filter((p) => p.id === '10').at(-1)!
    assert.equal(last.body.status, 'finished')
    assert.equal(last.body.result, 'white')
    assert.equal(last.body.resultReason, 'checkmate')
    assert.match(String(last.body.pgn), /Qxf7#/)
    assert.ok(fake.patches.filter((p) => p.id === '10').length >= 8) // start + 7 coups
  })

  test('host:ready refusé si l\'adversaire n\'est pas connecté', async () => {
    fake.docs.set('11', gameDoc(11))
    const alice = await track(client(appUrl, await token(1, 'Alice')))
    await emit(alice, 'game:join', { gameId: '11' })
    assert.deepEqual(await emit(alice, 'host:ready', { gameId: '11' }), { ok: false, error: 'opponent_absent' })
  })

  test('abandon', async () => {
    fake.docs.set('12', gameDoc(12))
    const alice = await track(client(appUrl, await token(1, 'Alice')))
    const bob = await track(client(appUrl, await token(2, 'Bob')))
    await emit(alice, 'game:join', { gameId: '12' })
    await emit(bob, 'game:join', { gameId: '12' })
    await emit(alice, 'host:ready', { gameId: '12' })
    const over = waitFor<Snapshot>(alice, 'game:over')
    assert.deepEqual(await emit(bob, 'game:resign', { gameId: '12' }), { ok: true })
    assert.deepEqual((await over).outcome, { winner: 'white', reason: 'resignation' })
  })

  test('drapeau : le temps écoulé termine la partie sans action des joueurs', async () => {
    fake.docs.set('13', gameDoc(13, { whiteMs: 150, blackMs: 60_000 }))
    const alice = await track(client(appUrl, await token(1, 'Alice')))
    const bob = await track(client(appUrl, await token(2, 'Bob')))
    await emit(alice, 'game:join', { gameId: '13' })
    await emit(bob, 'game:join', { gameId: '13' })
    const over = waitFor<Snapshot>(bob, 'game:over')
    await emit(alice, 'host:ready', { gameId: '13' }) // les blancs ont 150 ms et ne jouent pas
    const final = await over
    assert.deepEqual(final.outcome, { winner: 'black', reason: 'timeout' })
    await app.flush()
    assert.equal(fake.docs.get('13')!.result, 'black')
  })

  test('reprise après redémarrage : état, horloges et coups conservés', async () => {
    fake.docs.set('14', gameDoc(14))
    const alice = await track(client(appUrl, await token(1, 'Alice')))
    const bob = await track(client(appUrl, await token(2, 'Bob')))
    await emit(alice, 'game:join', { gameId: '14' })
    await emit(bob, 'game:join', { gameId: '14' })
    await emit(alice, 'host:ready', { gameId: '14' })
    await emit(alice, 'game:move', { gameId: '14', from: 'd2', to: 'd4' })
    await emit(bob, 'game:move', { gameId: '14', from: 'd7', to: 'd5' })
    await app.flush()

    // Second processus : mémoire vide, mêmes données Payload.
    const app2 = createApp(config(), createPayloadClient(config()), { log: silent })
    await app2.recover()
    assert.equal(app2.games.size >= 1, true)
    const reloaded = app2.games.get('14')!
    assert.equal(reloaded.status, 'active')
    assert.deepEqual(reloaded.chess.history(), ['d4', 'd5'])
    assert.equal(reloaded.turnColor(), 'white')
    assert.ok(reloaded.remaining('white', Date.now()) > 250_000)
    await app2.close()
  })
})
