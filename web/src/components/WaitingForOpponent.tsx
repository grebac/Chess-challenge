'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { ChallengeActions } from './ChallengeActions'

/**
 * Écran de l'hôte tant que le défi n'est pas accepté : la page se rafraîchit seule.
 * Dès que l'adversaire accepte, le serveur affiche la partie (salle d'attente) à la place de cet écran.
 */
export function WaitingForOpponent({ gameId, opponentName }: { gameId: number | string; opponentName: string }) {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, 4000)
    return () => clearInterval(timer)
  }, [router])

  return (
    <div className="max-w-md space-y-4 rounded-lg border border-stone-700 bg-stone-900 p-6">
      <h1 className="text-lg font-semibold">Défi envoyé</h1>
      <p className="text-sm text-stone-300">
        En attente que <strong>{opponentName}</strong> accepte ton défi. Garde cette page ouverte : la partie
        s’affichera d’elle-même dès qu’il aura répondu.
      </p>
      <ChallengeActions gameId={gameId} kind="outgoing" />
    </div>
  )
}
