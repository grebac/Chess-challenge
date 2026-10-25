import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { ChallengeActions } from '@/components/ChallengeActions'
import { GameLine } from '@/components/GameLine'
import { Header } from '@/components/Header'
import { isAdmin } from '@/lib/access'
import { listMyGames, listPlayers, namesById } from '@/lib/data'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

function Section({ title, empty, count, children }: { title: string; empty: string; count: number; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {count === 0 ? <p className="text-sm text-stone-400">{empty}</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  )
}

export default async function DashboardPage() {
  const { payload, user } = await getSession()
  if (!user) redirect('/login')

  const meId = String(user.id)
  const names = namesById(await listPlayers(payload))

  // Le contrôle d'accès de Payload limite déjà les résultats à mes parties.
  const [incoming, outgoing, live] = await Promise.all([
    listMyGames(payload, user, { and: [{ status: { equals: 'pending' } }, { opponent: { equals: user.id } }] }),
    listMyGames(payload, user, { and: [{ status: { equals: 'pending' } }, { host: { equals: user.id } }] }),
    listMyGames(payload, user, { status: { in: ['accepted', 'active'] } }),
  ])

  const nameOf = (id: unknown) => names[String(typeof id === 'object' && id ? (id as { id: unknown }).id : id)] ?? 'Un collègue'

  return (
    <>
      <Header name={user.displayName} isAdmin={isAdmin(user)} />
      <main className="mx-auto max-w-3xl space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Mes défis et parties</h1>

        <Section title="Parties à jouer" empty="Aucune partie en cours ou en salle d’attente." count={live.length}>
          {live.map((game) => (
            <GameLine key={game.id} game={game} meId={meId} names={names} />
          ))}
        </Section>

        <Section title="Défis reçus" empty="Aucun défi en attente." count={incoming.length}>
          {incoming.map((game) => (
            <GameLine
              key={game.id}
              game={game}
              meId={meId}
              names={names}
              title={`${nameOf(game.host)} te défie`}
              action={<ChallengeActions gameId={game.id} kind="incoming" />}
            />
          ))}
        </Section>

        <Section title="Défis envoyés" empty="Aucun défi envoyé en attente de réponse." count={outgoing.length}>
          {outgoing.map((game) => (
            <GameLine
              key={game.id}
              game={game}
              meId={meId}
              names={names}
              title={`Défi envoyé à ${nameOf(game.opponent)}`}
              action={<ChallengeActions gameId={game.id} kind="outgoing" />}
            />
          ))}
        </Section>
      </main>
    </>
  )
}
