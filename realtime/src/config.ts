// Piège n°8 : les noms lus ici sont exactement ceux définis sur Railway.
export interface Config {
  port: number
  payloadUrl: string
  payloadApiKey: string
  realtimeSecret: string
  webOrigins: string[]
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing = ['PAYLOAD_URL', 'PAYLOAD_API_KEY', 'REALTIME_SECRET', 'WEB_ORIGIN'].filter(
    (name) => !env[name],
  )
  if (missing.length > 0) {
    throw new Error(`Variables d'environnement manquantes : ${missing.join(', ')}`)
  }

  return {
    port: Number(env.PORT ?? 4000),
    payloadUrl: env.PAYLOAD_URL!.replace(/\/+$/, ''),
    payloadApiKey: env.PAYLOAD_API_KEY!,
    realtimeSecret: env.REALTIME_SECRET!,
    webOrigins: env
      .WEB_ORIGIN!.split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  }
}
