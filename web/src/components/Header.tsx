import Link from 'next/link'

import { SITE_NAME } from '../lib/site'
import { LogoutButton } from './LogoutButton'

/** `guest` : compte invité temporaire (pas de lien Accueil/Admin, il repart de la page publique). */
export function Header({ name, isAdmin, guest = false }: { name: string; isAdmin: boolean; guest?: boolean }) {
  return (
    <header className="border-b border-stone-800">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
        <Link href="/" className="text-base font-semibold text-amber-400">
          ♞ {SITE_NAME}
        </Link>
        <nav className="flex gap-4 text-stone-300">
          {!guest && (
            <Link href="/" className="hover:text-white">
              Accueil
            </Link>
          )}
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
