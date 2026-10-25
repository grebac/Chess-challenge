import type { CollectionConfig } from 'payload'

import { isAdmin, isPrivileged } from '../lib/access'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'email', 'role'],
  },
  auth: {
    // Le service realtime s'authentifie avec la clé API d'un utilisateur de rôle "service".
    useAPIKey: true,
    tokenExpiration: 60 * 60 * 24 * 14,
    cookies: {
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
  access: {
    // Seuls les admins entrent dans /admin ; les collègues utilisent le site.
    admin: ({ req }) => isAdmin(req.user),
    // Pas d'inscription publique : l'admin crée les comptes (le tout premier compte passe par /admin).
    create: ({ req }) => isAdmin(req.user),
    read: ({ req }) => {
      const user = req.user
      if (!user) return false
      if (isPrivileged(user)) return true
      return { id: { equals: user.id } }
    },
    update: ({ req }) => {
      const user = req.user
      if (!user) return false
      if (isAdmin(user)) return true
      return { id: { equals: user.id } }
    },
    delete: ({ req }) => isAdmin(req.user),
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        if (operation === 'create') {
          // Le premier compte créé devient admin.
          const { totalDocs } = await req.payload.count({
            collection: 'users',
            overrideAccess: true,
            req,
          })
          if (totalDocs === 0) data.role = 'admin'
        } else if (req.user && !isAdmin(req.user)) {
          // Un joueur ne peut pas modifier son propre rôle.
          delete data.role
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'displayName',
      label: 'Nom affiché',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'player',
      saveToJWT: true,
      options: [
        { label: 'Joueur', value: 'player' },
        { label: 'Admin', value: 'admin' },
        { label: 'Service (clé API du service realtime)', value: 'service' },
      ],
      admin: { position: 'sidebar' },
    },
  ],
}
