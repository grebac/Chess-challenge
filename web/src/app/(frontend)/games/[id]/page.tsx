import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { GameClient } from '@/components/GameClient'
import { Header } from '@/components/Header'
import { isAdmin } from '@/lib/access'
import { STATUS_LABELS } from '@/lib/chess'
import { getSession } from '@/lib/session'
import type { Game } from '@/payload-types'

// Piège n°7 : aucune generateStaticParams ici, la page est rendue à la demande.
export const dynamic = 'force-dynamic'

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { payload, user } = await getSession()
  if (!user) redirect('/login')

  // Paramètre de route = toujours une string ; l'id Postgres est un entier (piège n°9).
  if (!/^\d+$/.test(id)) notFound()

  let game: Game
  try {
    game = await payload.findByID({
      collection: 'games',
      id: Number(id),
      user,
      overrideAccess: false, // seuls l'hôte, l'adversaire et les admins accèdent à la partie
      depth: 0,
    })
  } catch {
    notFound()
  }

  const playable = game.status === 'accepted' || game.status === 'active' || game.status === 'finished'

  return (
    <>
      <Header name={user.displayName} isAdmin={isAdmin(user)} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        {playable ? (
          // Les deux ids passent en string : ce sont les clés de room côté realtime.
          <GameClient gameId={String(game.id)} meId={String(user.id)} />
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-stone-300">
              Cette partie n’est pas jouable : {(STATUS_LABELS[game.status] ?? game.status).toLowerCase()}.
            </p>
            <Link href="/dashboard" className="text-amber-400 underline-offset-4 hover:underline">
              Retour à mes défis et parties
            </Link>
          </div>
        )}
      </main>
    </>
  )
}
