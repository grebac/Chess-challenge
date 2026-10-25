/**
 * Piège n°9 : les ids Postgres sont des entiers, les paramètres de route des strings.
 * Toute clé de room ou de Map passe par ces deux helpers.
 */
export const gameKey = (id: unknown): string => String(id)

export const roomKey = (id: unknown): string => `game:${gameKey(id)}`

/** Accepte uniquement des ids raisonnables venant du réseau. */
export function parseGameId(input: unknown): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null
  const id = gameKey(input)
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null
}
