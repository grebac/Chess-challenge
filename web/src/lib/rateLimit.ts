// Limiteur en mémoire. Suffisant tant que le service web tourne sur un seul réplica (c'est le cas ici) ;
// au-delà, il faudrait un stockage partagé (Redis). Les compteurs repartent à zéro à chaque redémarrage.
const hits = new Map<string, number[]>()

/** Enregistre un appel et renvoie false si `limit` appels ont déjà eu lieu dans la fenêtre. */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  // Évite que la table grossisse indéfiniment avec des clés jamais revues.
  if (hits.size > 5000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k)
  }
  return true
}
