// Helpers compartidos para el sistema de @menciones en comentarios.
// Vive fuera de las server actions para que se pueda importar desde
// componentes client sin tocar la directiva 'use server'.

export interface MentionedUser {
  id:       string
  name:     string
  username: string
  /** Si el usuario tiene una `Person` vinculada, su ID — para linkear al perfil. */
  personId: string | null
}

/**
 * Regex que captura `@palabra` con soporte para acentos y ñ.
 * Un mention NO incluye espacios, así que `@Andres Garcia` matchea solo
 * `@Andres`. El editor de comentarios sugiere autocompletado pero el
 * resultado final es siempre `@unaPalabra` (o el username — único).
 */
export const MENTION_REGEX = /@([\p{L}\p{N}_]+)/gu

/**
 * Dada una lista de usuarios de la familia y el body del comentario,
 * devuelve los usuarios mencionados (sin duplicados, en orden de aparición).
 * Match: case-insensitive, primero contra `username` (único), luego contra
 * la primera palabra de `name`.
 */
export function parseMentions(body: string, members: MentionedUser[]): MentionedUser[] {
  const matched = new Map<string, MentionedUser>()
  const lowerMembers = members.map(m => ({
    ...m,
    usernameLc: m.username.toLowerCase(),
    firstNameLc: m.name.split(/\s+/)[0]?.toLowerCase() ?? '',
  }))

  for (const match of body.matchAll(MENTION_REGEX)) {
    const token = match[1].toLowerCase()
    const hit = lowerMembers.find(m => m.usernameLc === token)
            ?? lowerMembers.find(m => m.firstNameLc === token)
    if (hit && !matched.has(hit.id)) {
      matched.set(hit.id, {
        id: hit.id, name: hit.name, username: hit.username, personId: hit.personId,
      })
    }
  }

  return [...matched.values()]
}
