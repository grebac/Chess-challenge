// Rôles : player (défaut), admin, service (clé API utilisée par le service realtime).
type WithRole = { role?: 'player' | 'admin' | 'service' | null } | null | undefined

export const isAdmin = (user: WithRole): boolean => user?.role === 'admin'
export const isService = (user: WithRole): boolean => user?.role === 'service'
export const isPrivileged = (user: WithRole): boolean => isAdmin(user) || isService(user)

/** Valeur brute d'une relation (id ou document peuplé) -> id d'origine. */
export function relRaw(value: unknown): number | string | null {
  if (value == null) return null
  if (typeof value === 'object') return (value as { id: number | string }).id ?? null
  return value as number | string
}

/** Piège n°9 : toujours comparer les ids sous forme de string. */
export function relId(value: unknown): string | null {
  const raw = relRaw(value)
  return raw == null ? null : String(raw)
}
