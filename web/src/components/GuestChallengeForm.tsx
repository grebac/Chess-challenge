'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { TIME_CONTROLS } from '../lib/chess'

interface Target {
  id: number | string
  name: string
}

const ERRORS: Record<string, string> = {
  bad_pseudo: 'Pseudo invalide : 2 à 24 caractères (lettres, chiffres, espace, . _ - ou apostrophe).',
  bad_request: 'Formulaire incomplet.',
  too_many_requests: 'Trop de tentatives, réessaie dans quelques minutes.',
  target_not_found: 'Ce joueur n’accepte plus les défis pour l’instant.',
  already_logged_in: 'Tu es déjà connecté avec un compte : utilise la page d’accueil.',
  forbidden_origin: 'Requête refusée.',
}

/** Défi sans compte : un pseudo suffit. Le serveur crée un compte invité temporaire et ouvre sa session. */
export function GuestChallengeForm({ targets }: { targets: Target[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      const res = await fetch('/api/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pseudo: form.get('pseudo'),
          target: form.get('target'),
          hostColor: form.get('hostColor'),
          timeControl: form.get('timeControl'),
        }),
      })
      const body = (await res.json().catch(() => null)) as { gameId?: string; error?: string } | null
      if (res.ok && body?.gameId) {
        router.push(`/games/${body.gameId}`)
        router.refresh()
        return
      }
      setError(ERRORS[body?.error ?? ''] ?? 'Le défi n’a pas pu être envoyé, réessaie dans un instant.')
    } catch {
      setError('Connexion impossible, réessaie dans un instant.')
    }
    setBusy(false)
  }

  if (targets.length === 0) {
    return <p className="text-sm text-stone-400">Personne n’accepte les défis d’invités pour l’instant.</p>
  }

  const field = 'w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 outline-none focus:border-amber-500'

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-stone-300">Ton pseudo</span>
        <input name="pseudo" required minLength={2} maxLength={24} autoComplete="nickname" className={field} placeholder="Ex. Camille" />
        <span className="mt-1 block text-xs text-stone-500">Il sera affiché avec la mention « (invité) ».</span>
      </label>

      {targets.length === 1 ? (
        <div className="text-sm">
          <input type="hidden" name="target" value={String(targets[0]!.id)} />
          <span className="mb-1 block text-stone-300">Adversaire</span>
          <p className="rounded-md border border-stone-800 bg-stone-900/60 px-3 py-2">{targets[0]!.name}</p>
        </div>
      ) : (
        <label className="block text-sm">
          <span className="mb-1 block text-stone-300">Adversaire</span>
          <select name="target" required className={field} defaultValue="">
            <option value="" disabled>
              Choisis qui défier…
            </option>
            {targets.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}

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
