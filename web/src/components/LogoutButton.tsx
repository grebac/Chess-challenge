'use client'

import { useRouter } from 'next/navigation'

export function LogoutButton() {
  const router = useRouter()

  async function logout() {
    await fetch('/api/users/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <button onClick={logout} className="text-stone-400 underline-offset-4 hover:text-stone-100 hover:underline">
      Se déconnecter
    </button>
  )
}
