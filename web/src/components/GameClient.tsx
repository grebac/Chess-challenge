'use client'

import { Chess } from 'chess.js'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Chessboard, type PieceDropHandlerArgs } from 'react-chessboard'
import { io, type Socket } from 'socket.io-client'

import { REASON_LABELS } from '../lib/chess'
import type { Color, PlayerRef, Snapshot } from '../lib/realtime-types'

const ERRORS: Record<string, string> = {
  not_found: 'Partie introuvable.',
  forbidden: 'Tu ne participes pas à cette partie.',
  unavailable: 'Le serveur de parties est momentanément injoignable.',
  opponent_absent: 'Ton adversaire doit être connecté pour lancer la partie.',
  not_your_turn: 'Ce n’est pas ton tour.',
  illegal_move: 'Coup illégal.',
  not_active: 'La partie n’est pas en cours.',
  bad_status: 'La partie a déjà démarré.',
  timeout: 'Temps écoulé.',
  bad_request: 'Requête invalide.',
}
const errorText = (code: string) => ERRORS[code] ?? `Erreur (${code}).`

type Ack = { ok: true; state?: Snapshot } | { ok: false; error: string }
type Connection = 'connecting' | 'connected' | 'disconnected'

async function fetchToken(): Promise<{ token: string; url: string }> {
  const res = await fetch('/api/realtime-token', { cache: 'no-store' })
  if (!res.ok) throw new Error(res.status === 401 ? 'session' : 'config')
  return (await res.json()) as { token: string; url: string }
}

function formatClock(ms: number): string {
  const total = Math.max(0, ms)
  if (total < 10_000) return `${(total / 1000).toFixed(1)}`
  const seconds = Math.ceil(total / 1000)
  const m = Math.floor(seconds / 60)
  return `${m}:${String(seconds % 60).padStart(2, '0')}`
}

function Clock({ ms, active }: { ms: number; active: boolean }) {
  const low = ms < 20_000
  return (
    <div
      className={`rounded-md px-3 py-1 font-mono text-2xl tabular-nums ${
        active ? (low ? 'bg-red-600 text-white' : 'bg-amber-500 text-stone-950') : 'bg-stone-800 text-stone-300'
      }`}
    >
      {formatClock(ms)}
    </div>
  )
}

function PlayerBar({ player, color, ms, active, online }: { player: PlayerRef; color: Color; ms: number; active: boolean; online: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-3 w-3 rounded-full border ${color === 'white' ? 'border-stone-400 bg-white' : 'border-stone-500 bg-stone-900'}`} />
        <span className="font-medium">{player.name}</span>
        <span className={`text-xs ${online ? 'text-emerald-400' : 'text-stone-500'}`}>{online ? '● en ligne' : '○ hors ligne'}</span>
      </div>
      <Clock ms={ms} active={active} />
    </div>
  )
}

function outcomeText(snap: Snapshot): string {
  if (!snap.outcome) return ''
  const reason = REASON_LABELS[snap.outcome.reason] ?? snap.outcome.reason
  if (snap.outcome.winner === 'draw') return `Partie nulle (${reason})`
  const winner = snap.outcome.winner === 'white' ? snap.white : snap.black
  return `${winner.name} gagne (${reason})`
}

export function GameClient({ gameId, meId }: { gameId: string; meId: string }) {
  const socketRef = useRef<Socket | null>(null)
  const [received, setReceived] = useState<{ snap: Snapshot; at: number } | null>(null)
  const [pendingFen, setPendingFen] = useState<string | null>(null)
  const [conn, setConn] = useState<Connection>('connecting')
  const [fatal, setFatal] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // ---- Connexion Socket.io ------------------------------------------------
  useEffect(() => {
    let cancelled = false
    let socket: Socket | null = null

    const accept = (snap: Snapshot) => {
      setReceived({ snap, at: Date.now() })
      setPendingFen(null)
    }

    ;(async () => {
      let first: { token: string; url: string }
      try {
        first = await fetchToken()
      } catch (error) {
        if (!cancelled) {
          setFatal((error as Error).message === 'session' ? 'Session expirée : reconnecte-toi.' : 'Le service de parties n’est pas configuré.')
        }
        return
      }
      if (cancelled) return

      let firstUsed = false
      socket = io(first.url, {
        // Fonction : un JWT frais est demandé à chaque (re)connexion, le premier est réutilisé.
        auth: (cb) => {
          if (!firstUsed) {
            firstUsed = true
            cb({ token: first.token })
            return
          }
          fetchToken()
            .then((t) => cb({ token: t.token }))
            .catch(() => cb({ token: '' }))
        },
      })
      socketRef.current = socket
      const s = socket

      s.on('connect', () => {
        setConn('connected')
        // Re-join à chaque (re)connexion : le serveur renvoie un snapshot complet.
        s.emit('game:join', { gameId }, (res: Ack) => {
          if (res.ok && res.state) accept(res.state)
          else if (!res.ok) setFatal(errorText(res.error))
        })
      })
      s.on('disconnect', () => setConn('disconnected'))
      s.on('connect_error', () => {
        setConn('disconnected')
        // Refus du serveur (JWT expiré) : socket.io ne réessaie pas seul, on relance avec un token frais.
        if (!s.active) setTimeout(() => !cancelled && s.connect(), 2000)
      })
      s.on('game:state', accept)
      s.on('game:start', accept)
    })()

    return () => {
      cancelled = true
      socket?.disconnect()
      socketRef.current = null
    }
  }, [gameId])

  // ---- Horloges : un rendu régulier tant qu'une horloge tourne --------------
  const ticking = received?.snap.ticking ?? null
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [ticking])

  if (fatal) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 p-6">
        <p className="text-red-300">{fatal}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-amber-400 hover:underline">
          Retour à mes parties
        </Link>
      </div>
    )
  }
  if (!received) {
    return <p className="text-stone-400">{conn === 'connecting' ? 'Connexion à la partie…' : 'Reconnexion…'}</p>
  }

  const { snap, at } = received
  const myColor: Color = snap.white.id === meId ? 'white' : 'black'
  const opponentColor: Color = myColor === 'white' ? 'black' : 'white'
  const player = (color: Color) => (color === 'white' ? snap.white : snap.black)
  const clock = (color: Color) => {
    const base = color === 'white' ? snap.whiteMs : snap.blackMs
    return snap.ticking === color ? Math.max(0, base - (now - at)) : base
  }
  const isHost = snap.hostId === meId
  const canMove = snap.status === 'active' && snap.turn === myColor && pendingFen === null

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!canMove || !targetSquare || !socketRef.current) return false
    // Vérification locale pour le confort uniquement : le serveur reste l'arbitre.
    const local = new Chess(snap.fen)
    try {
      local.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
    } catch {
      return false
    }
    setMessage(null)
    setPendingFen(local.fen())
    socketRef.current.emit('game:move', { gameId, from: sourceSquare, to: targetSquare, promotion: 'q' }, (res: Ack) => {
      if (!res.ok) {
        setPendingFen(null)
        setMessage(errorText(res.error))
      }
    })
    return true
  }

  function startGame() {
    setMessage(null)
    socketRef.current?.emit('host:ready', { gameId }, (res: Ack) => {
      if (!res.ok) setMessage(errorText(res.error))
    })
  }

  function resign() {
    if (!window.confirm('Abandonner la partie ?')) return
    socketRef.current?.emit('game:resign', { gameId }, (res: Ack) => {
      if (!res.ok) setMessage(errorText(res.error))
    })
  }

  const highlight = 'rgba(250, 204, 21, 0.4)'
  const squareStyles: Record<string, React.CSSProperties> = {}
  if (snap.lastMove) {
    squareStyles[snap.lastMove.from] = { backgroundColor: highlight }
    squareStyles[snap.lastMove.to] = { backgroundColor: highlight }
  }

  const movePairs: { n: number; white: string; black?: string }[] = []
  snap.moves.forEach((san, index) => {
    if (index % 2 === 0) movePairs.push({ n: index / 2 + 1, white: san })
    else movePairs[movePairs.length - 1]!.black = san
  })

  let banner: { text: string; tone: 'info' | 'good' | 'bad' } | null = null
  if (snap.status === 'finished') {
    const iWon = snap.outcome?.winner === myColor
    const draw = snap.outcome?.winner === 'draw'
    banner = { text: outcomeText(snap), tone: draw ? 'info' : iWon ? 'good' : 'bad' }
  } else if (snap.status === 'active') {
    banner = {
      text: snap.turn === myColor ? (snap.inCheck ? 'À toi de jouer : tu es en échec !' : 'À toi de jouer') : `Au tour de ${player(snap.turn).name}`,
      tone: 'info',
    }
  }
  const tone = { info: 'border-stone-700 bg-stone-900', good: 'border-emerald-800 bg-emerald-950/50 text-emerald-200', bad: 'border-red-900 bg-red-950/40 text-red-200' }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,640px)_1fr]">
      <div className="space-y-3">
        <PlayerBar
          player={player(opponentColor)}
          color={opponentColor}
          ms={clock(opponentColor)}
          active={snap.ticking === opponentColor}
          online={snap.connected[opponentColor]}
        />
        <div className="aspect-square w-full">
          <Chessboard
            options={{
              id: `game-${gameId}`,
              position: pendingFen ?? snap.fen,
              boardOrientation: myColor,
              allowDragging: canMove,
              canDragPiece: ({ piece }) => piece.pieceType.startsWith(myColor === 'white' ? 'w' : 'b'),
              onPieceDrop,
              squareStyles,
              animationDurationInMs: 150,
            }}
          />
        </div>
        <PlayerBar
          player={player(myColor)}
          color={myColor}
          ms={clock(myColor)}
          active={snap.ticking === myColor}
          online={snap.connected[myColor]}
        />
      </div>

      <aside className="space-y-4">
        {conn !== 'connected' && (
          <p className="rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
            Connexion perdue, reconnexion en cours… La partie reprendra où elle en était.
          </p>
        )}

        {snap.status === 'accepted' && (
          <div className="rounded-lg border border-stone-700 bg-stone-900 p-4">
            <h2 className="font-semibold">Salle d’attente</h2>
            <p className="mt-1 text-sm text-stone-300">
              Tu joues les {myColor === 'white' ? 'blancs' : 'noirs'}.{' '}
              {isHost
                ? snap.connected[opponentColor]
                  ? `${player(opponentColor).name} est là, tu peux lancer la partie.`
                  : `En attente de ${player(opponentColor).name}…`
                : `En attente que ${player(opponentColor).name} lance la partie…`}
            </p>
            {isHost && (
              <button
                onClick={startGame}
                disabled={!snap.connected[opponentColor]}
                className="mt-3 rounded-md bg-amber-500 px-4 py-2 font-medium text-stone-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Lancer la partie
              </button>
            )}
          </div>
        )}

        {banner && <p className={`rounded-md border px-3 py-2 text-sm font-medium ${tone[banner.tone]}`}>{banner.text}</p>}
        {message && <p className="text-sm text-red-400">{message}</p>}

        <div className="rounded-lg border border-stone-800 bg-stone-900/60 p-4">
          <h2 className="mb-2 text-sm font-semibold text-stone-300">Coups</h2>
          {movePairs.length === 0 ? (
            <p className="text-sm text-stone-500">Aucun coup joué.</p>
          ) : (
            <ol className="grid max-h-72 grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-1 overflow-y-auto font-mono text-sm">
              {movePairs.map((pair) => (
                <li key={pair.n} className="contents">
                  <span className="text-stone-500">{pair.n}.</span>
                  <span>{pair.white}</span>
                  <span>{pair.black ?? ''}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          {snap.status === 'active' && (
            <button onClick={resign} className="rounded-md border border-stone-600 px-3 py-1.5 text-sm hover:bg-stone-800">
              Abandonner
            </button>
          )}
          {snap.status === 'finished' && (
            <Link href="/" className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-amber-400">
              Nouveau défi
            </Link>
          )}
          <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-sm text-stone-400 hover:text-white">
            Mes parties
          </Link>
        </div>
      </aside>
    </div>
  )
}
