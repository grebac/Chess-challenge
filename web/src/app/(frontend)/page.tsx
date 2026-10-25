import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ChallengeForm } from '@/components/ChallengeForm'
import { GameLine } from '@/components/GameLine'
import { Header } from '@/components/Header'
import { isAdmin } from '@/lib/access'
import { listMyGames, listPlayers, namesById } from '@/lib/data'
import { getSession } from '@/lib/session'

// Page dépendante de la session : jamais rendue au build (piège n°7).
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const { payload, user } = await getSession()
  if (!user) redirect('/login')

  const meId = String(user.id)
  const players = await listPlayers(payload)
  const names = namesById(players)
  const others = players.filter((p) => String(p.id) !== meId)

  const [finished, incoming] = await Promise.all([
    listMyGames(payload, user, { status: { equals: 'finished' } }, 20),
    listMyGames(payload, user, { and: [{ status: { equals: 'pending' } }, { opponent: { equals: user.id } }] }, 50),
  ])

  return (
    <>
      <Header name={user.displayName} isAdmin={isAdmin(user)} />
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-8 md:grid-cols-[minmax(0,22rem)_1fr]">
        <section>
          <h1 className="mb-4 text-xl font-semibold">Défier un collègue</h1>
          <ChallengeForm players={others} />
        </section>

        <section>
          {incoming.length > 0 && (
            <Link
              href="/dashboard"
              className="mb-6 block rounded-lg border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 hover:bg-amber-500/20"
            >
              {incoming.length === 1
                ? 'Tu as 1 défi en attente de réponse.'
                : `Tu as ${incoming.length} défis en attente de réponse.`}
            </Link>
          )}
          <h2 className="mb-4 text-xl font-semibold">Historique</h2>
          {finished.length === 0 ? (
            <p className="text-sm text-stone-400">Aucune partie terminée pour l’instant.</p>
          ) : (
            <ul className="space-y-2">
              {finished.map((game) => (
                <GameLine key={game.id} game={game} meId={meId} names={names} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  )
}
