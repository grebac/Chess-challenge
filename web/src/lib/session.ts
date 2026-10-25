import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

/** Payload + utilisateur courant, déduit du cookie de la requête. */
export async function getSession() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  return { payload, user }
}
