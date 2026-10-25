import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './styles.css'

export const metadata: Metadata = {
  title: 'Échecs entre collègues',
  description: 'Parties d’échecs en temps réel contre tes collègues.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-stone-950 text-stone-100 antialiased">{children}</body>
    </html>
  )
}
