import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { Games } from './collections/Games'
import { Users } from './collections/Users'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Games],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      // Piège n°8 : le nom de la variable est DATABASE_URI, partout.
      connectionString: process.env.DATABASE_URI || '',
    },
    // Le schéma ne change que par migrations (`pnpm payload migrate:create` puis commit).
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
    // En production, les migrations commitées sont appliquées au démarrage de Payload :
    // le CLI n'existe pas dans l'image standalone.
    prodMigrations: migrations,
  }),
})
