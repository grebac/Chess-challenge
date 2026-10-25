'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Kind = 'incoming' | 'outgoing'

/** Boutons d'un défi en attente : accepter / refuser (adversaire) ou annuler (hôte). */
export function ChallengeActions({ gameId, kind }: { gameId: number | string; kind: Kind }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setStatus(status: 'accepted' | 'declined' | 'cancelled') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { errors?: { message: string }[] } | null
        setError(body?.errors?.[0]?.message ?? 'Action impossible.')
        setBusy(false)
        return
      }
      if (status === 'accepted') {
        router.push(`/games/${gameId}`) // l'adversaire entre directement dans la salle d'attente
        return
      }
      router.refresh()
    } catch {
      setError('Connexion impossible.')
    }
    setBusy(false)
  }

  const base = 'rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50'

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {kind === 'incoming' ? (
          <>
            <button disabled={busy} onClick={() => setStatus('accepted')} className={`${base} bg-amber-500 text-stone-950 hover:bg-amber-400`}>
              Accepter
            </button>
            <button disabled={busy} onClick={() => setStatus('declined')} className={`${base} border border-stone-600 hover:bg-stone-800`}>
              Refuser
            </button>
          </>
        ) : (
          <button disabled={busy} onClick={() => setStatus('cancelled')} className={`${base} border border-stone-600 hover:bg-stone-800`}>
            Annuler
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
