'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { TIME_CONTROLS } from '../lib/chess'

interface PlayerOption {
  id: number | string
  name: string
}

export function ChallengeForm({ players }: { players: PlayerOption[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    // On renvoie l'id tel que Payload l'a fourni (entier) : jamais une string par erreur de type.
    const opponent = players.find((p) => String(p.id) === form.get('opponent'))?.id

    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opponent,
          hostColor: form.get('hostColor'),
          timeControl: form.get('timeControl'),
        }),
      })
      if (res.ok) {
        router.push('/dashboard')
        router.refresh()
        return
      }
      const body = (await res.json().catch(() => null)) as { errors?: { message: string }[] } | null
      setError(body?.errors?.[0]?.message ?? 'Le défi n’a pas pu être envoyé.')
    } catch {
      setError('Connexion impossible, réessaie dans un instant.')
    }
    setBusy(false)
  }

  if (players.length === 0) {
    return <p className="text-sm text-stone-400">Aucun autre joueur pour l’instant : demande à l’admin de créer des comptes.</p>
  }

  const field = 'w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 outline-none focus:border-amber-500'

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-stone-300">Adversaire</span>
        <select name="opponent" required className={field} defaultValue="">
          <option value="" disabled>
            Choisis un collègue…
          </option>
          {players.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="mb-1 block text-stone-300">Ta couleur</span>
          <select name="hostColor" className={field} defaultValue="random">
            <option value="random">Au hasard</option>
            <option value="white">Blancs</option>
            <option value="black">Noirs</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-300">Cadence</span>
          <select name="timeControl" className={field} defaultValue="10+0">
            {TIME_CONTROLS.map((tc) => (
              <option key={tc.value} value={tc.value}>
                {tc.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-amber-500 px-4 py-2 font-medium text-stone-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? 'Envoi…' : 'Envoyer le défi'}
      </button>
    </form>
  )
}
