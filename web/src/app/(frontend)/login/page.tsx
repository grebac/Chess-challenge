import { redirect } from 'next/navigation'

import { LoginForm } from '@/components/LoginForm'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const { user } = await getSession()
  if (user) redirect('/')

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold text-amber-400">♞ Échecs entre collègues</h1>
      <p className="mt-2 mb-6 text-sm text-stone-400">Connecte-toi avec le compte créé par l’admin.</p>
      <LoginForm />
      <p className="mt-8 text-xs text-stone-500">
        Premier lancement ? Crée le compte admin sur <a href="/admin" className="underline">/admin</a>.
      </p>
    </main>
  )
}
