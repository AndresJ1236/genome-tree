// Tipos y constantes compartidos para el módulo de reacciones.
// Vive fuera de `src/app/actions/reactions.ts` porque ese archivo lleva
// la directiva `'use server'`, que en Next.js 16 prohíbe exportar
// cualquier cosa que no sea una función async (las constantes en runtime
// causan el error "A 'use server' file can only export async functions,
// found object").

export const REACTION_TYPES = ['HEART', 'LAUGH', 'WOW', 'SAD', 'PRAY'] as const
export type ReactionTypeValue = typeof REACTION_TYPES[number]

export interface ReactionSummary {
  type:    ReactionTypeValue
  count:   number
  /** True si el usuario actual ya reaccionó con este tipo */
  mine:    boolean
  /** Hasta 3 nombres de quienes reaccionaron, para tooltip "Ana, Pedro y 2 más" */
  preview: string[]
}
