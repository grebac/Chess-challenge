import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ChallengeForm } from '@/components/ChallengeForm'
import { GameLine } from '@/components/GameLine'
import { GuestChallengeForm } from '@/components/GuestChallengeForm'
import { Header } from '@/components/Header'
import { isAdmin } from '@/lib/access'
import { challengeablePlayers, listGuestTargets, listMyGames, listPlayers, namesById } from '@/lib/data'
import { getSession } from '@/lib/session'
import { SITE_NAME } from '@/lib/site'

// Page dépendante de la session : jamais rendue au build (piège n°7).
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const { payload, user } = await getSession()

  // Visiteur sans compte (ou invité qui veut un nouveau défi) : page publique, un pseudo suffit.
  if (!user || user.role === 'guest') {
    const targets = await listGuestTargets(payload)
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <h1 className="text-2xl font-semibold text-amber-400">♞ {SITE_NAME}</h1>
        <p className="mt-2 mb-6 text-sm text-stone-400">
          {targets.length === 1 ? `Défie ${targets[0]!.name}` : 'Lance un défi'} aux échecs, sans compte : choisis un pseudo et une cadence.
        </p>
        <GuestChallengeForm targets={targets} />
        <p className="mt-8 space-x-4 text-xs text-stone-500">
          <span>
            Tu as un compte ?{' '}
            <Link href="/login" className="underline">
              Se connecter
            </Link>
          </span>
          {user && (
            <Link href="/dashboard" className="underline">
              Retrouver ma partie en cours
            </Link>
          )}
        </p>
      </main>
    )
  }

  const meId = String(user.id)
  const players = await listPlayers(payload)
  const names = namesById(players)
  const others = challengeablePlayers(players, meId)

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
