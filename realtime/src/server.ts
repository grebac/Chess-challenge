import { createApp } from './app'
import { loadConfig } from './config'
import { createPayloadClient } from './payloadClient'

const config = loadConfig()
const app = createApp(config, createPayloadClient(config))

app.httpServer.listen(config.port, '0.0.0.0', () => {
  console.log(`[realtime] à l'écoute sur :${config.port} (origines : ${config.webOrigins.join(', ')})`)
})

// Ne bloque pas le démarrage : /health répond tout de suite, les parties se rechargent en tâche de fond.
void app.recover()

// Railway envoie SIGTERM à chaque redéploiement : on vide la file de sauvegarde avant de quitter.
async function shutdown(signal: string): Promise<void> {
  console.log(`[realtime] ${signal} reçu, arrêt propre`)
  await app.close()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
