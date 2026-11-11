import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { SITE_NAME } from '@/lib/site'

import './styles.css'

export const metadata: Metadata = {
  title: SITE_NAME,
  description: 'Parties d’échecs en temps réel entre collègues.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-stone-950 text-stone-100 antialiased">{children}</body>
    </html>
  )
}
