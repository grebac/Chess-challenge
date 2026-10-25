'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      })
      if (res.ok) {
        router.push('/')
        router.refresh()
        return
      }
      setError('Email ou mot de passe incorrect.')
    } catch {
      setError('Connexion impossible, réessaie dans un instant.')
    }
    setBusy(false)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-stone-300">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 outline-none focus:border-amber-500"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-stone-300">Mot de passe</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-stone-700 bg-stone-900 px-3 py-2 outline-none focus:border-amber-500"
        />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-amber-500 px-4 py-2 font-medium text-stone-950 hover:bg-amber-400 disabled:opacity-50"
      >
        {busy ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  )
}
