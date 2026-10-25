import Link from 'next/link'

import { LogoutButton } from './LogoutButton'

export function Header({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  return (
    <header className="border-b border-stone-800">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
        <Link href="/" className="text-base font-semibold text-amber-400">
          ♞ Échecs entre collègues
        </Link>
        <nav className="flex gap-4 text-stone-300">
          <Link href="/" className="hover:text-white">
            Accueil
          </Link>
          <Link href="/dashboard" className="hover:text-white">
            Mes défis et parties
          </Link>
          {isAdmin && (
            <a href="/admin" className="hover:text-white">
              Admin
            </a>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="text-stone-400">{name}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
