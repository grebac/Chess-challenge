export const dynamic = 'force-dynamic'

/** Healthcheck Railway : volontairement sans base de données, il ne doit répondre que si Next tourne. */
export function GET() {
  return Response.json({ ok: true })
}
