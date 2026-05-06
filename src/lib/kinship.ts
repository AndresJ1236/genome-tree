import 'server-only'

/**
 * Calculadora de parentesco — dado dos personas A y B (con sus IDs y un mapa
 * de fatherId/motherId), devuelve cómo es B respecto a A.
 *
 * Estrategia:
 *   1. BFS UP desde A para mapear todos sus ancestros con su distancia
 *      (cuántas generaciones arriba está cada uno).
 *   2. BFS UP desde B haciendo lo mismo.
 *   3. Buscar el ANCESTRO COMÚN MÁS RECIENTE (LCA) — la persona presente
 *      en ambos mapas con la suma de distancias mínima.
 *   4. La distancia en pasos hacia el LCA caracteriza el parentesco:
 *      - (0, 0): es la misma persona
 *      - (0, n): B es ancestro directo de A (padre, abuelo, etc.)
 *      - (n, 0): B es descendiente directo de A (hijo, nieto, etc.)
 *      - (1, 1): hermanos
 *      - (1, 2): tío/sobrino
 *      - (2, 2): primos hermanos (1st cousin)
 *      - (m, n) genérico: cousin |m-n| veces removed, m=n primos hermanos
 *
 * Considera SPOUSE/PARTNER explícitos como parentesco político ("X es tu
 * suegro/cuñado/etc.") cuando no hay parentesco sanguíneo directo.
 */

export interface PersonNode {
  id:        string
  fatherId:  string | null
  motherId:  string | null
  gender:    'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'
  firstName: string
  lastName:  string
}

export interface CoupleEdge {
  p1: string
  p2: string
}

export interface KinshipResult {
  /** Texto principal: "tu padre", "tu abuela", "tu primo segundo", "no hay relación visible" */
  label:   string
  /** Categoría tecnica para iconos / tests */
  category:
    | 'self'
    | 'parent'      // padre, madre
    | 'grandparent' // abuelo, abuela, bisabuelo...
    | 'child'       // hijo, hija
    | 'descendant'  // nieto, bisnieto...
    | 'sibling'     // hermano, hermana
    | 'half-sibling'
    | 'aunt-uncle'  // tío, tía
    | 'great-aunt-uncle' // tío abuelo, tía abuela
    | 'niece-nephew'
    | 'great-niece-nephew'
    | 'cousin'           // primo hermano + ordinal
    | 'spouse'           // cónyuge, pareja
    | 'in-law'           // suegro, cuñado, yerno
    | 'unrelated'
  /** Distancia hacia el LCA (puede ayudar para rendering) */
  steps?: { up: number; down: number }
}

/**
 * Calcula el parentesco de B respecto a A (perspectiva de A).
 *
 * @param fromId persona desde donde se mira (típicamente el usuario logueado)
 * @param toId   persona cuyo parentesco queremos saber
 * @param people todas las personas con sus parentescos directos
 * @param couples relaciones explícitas SPOUSE/PARTNER (para suegros/cuñados)
 */
export function calculateKinship(
  fromId: string,
  toId:   string,
  people: PersonNode[],
  couples: CoupleEdge[] = []
): KinshipResult {
  if (fromId === toId) {
    return { label: 'eres tú mismo/a', category: 'self' }
  }

  const personMap = new Map(people.map(p => [p.id, p]))
  const targetPerson = personMap.get(toId)
  if (!targetPerson) {
    return { label: 'no hay relación visible', category: 'unrelated' }
  }

  // Construir índice de hijos: padre → [hijos]
  const childrenOf = new Map<string, string[]>()
  for (const p of people) {
    if (p.fatherId) {
      if (!childrenOf.has(p.fatherId)) childrenOf.set(p.fatherId, [])
      childrenOf.get(p.fatherId)!.push(p.id)
    }
    if (p.motherId) {
      if (!childrenOf.has(p.motherId)) childrenOf.set(p.motherId, [])
      childrenOf.get(p.motherId)!.push(p.id)
    }
  }

  // BFS UP desde un nodo: devuelve Map<id, distancia> de TODOS los ancestros
  const ancestorsOf = (startId: string): Map<string, number> => {
    const result = new Map<string, number>()
    result.set(startId, 0)
    const queue: { id: string; dist: number }[] = [{ id: startId, dist: 0 }]
    while (queue.length > 0) {
      const { id, dist } = queue.shift()!
      const p = personMap.get(id)
      if (!p) continue
      if (p.fatherId && !result.has(p.fatherId)) {
        result.set(p.fatherId, dist + 1)
        queue.push({ id: p.fatherId, dist: dist + 1 })
      }
      if (p.motherId && !result.has(p.motherId)) {
        result.set(p.motherId, dist + 1)
        queue.push({ id: p.motherId, dist: dist + 1 })
      }
    }
    return result
  }

  const fromAncestors = ancestorsOf(fromId)
  const toAncestors   = ancestorsOf(toId)

  // Encontrar LCA: nodo común con (fromDist + toDist) mínimo
  let lca: string | null = null
  let bestSum = Infinity
  let upSteps = 0    // pasos desde from al LCA
  let downSteps = 0  // pasos desde LCA al to

  for (const [aid, fromDist] of fromAncestors) {
    const toDist = toAncestors.get(aid)
    if (toDist == null) continue
    const sum = fromDist + toDist
    if (sum < bestSum) {
      bestSum = sum
      lca = aid
      upSteps = fromDist
      downSteps = toDist
    }
  }

  if (lca == null) {
    // No hay LCA sanguíneo — ¿es político?
    return resolveInLaw(fromId, toId, people, couples, personMap, ancestorsOf, childrenOf)
                  ?? { label: 'no hay relación visible', category: 'unrelated' }
  }

  return labelFromSteps(upSteps, downSteps, targetPerson)
}

function labelFromSteps(up: number, down: number, target: PersonNode): KinshipResult {
  const isMale   = target.gender === 'MALE'
  const isFemale = target.gender === 'FEMALE'

  // (0, 0) ya manejado arriba

  // (0, N): target ES un ancestro
  if (up === 0 && down > 0) {
    if (down === 1) {
      return { label: isFemale ? 'tu hija' : isMale ? 'tu hijo' : 'tu hijo/a', category: 'child', steps: { up, down } }
    }
    if (down === 2) {
      return { label: isFemale ? 'tu nieta' : isMale ? 'tu nieto' : 'tu nieto/a', category: 'descendant', steps: { up, down } }
    }
    const prefix = down === 3 ? 'bis' : 'tatara'.repeat(down - 3) + 'bis'
    return { label: isFemale ? `tu ${prefix}nieta` : isMale ? `tu ${prefix}nieto` : `tu ${prefix}nieto/a`, category: 'descendant', steps: { up, down } }
  }

  // (N, 0): target es ancestro de from (target = ancestro)
  if (up > 0 && down === 0) {
    if (up === 1) {
      return { label: isFemale ? 'tu mamá' : isMale ? 'tu papá' : 'tu padre/madre', category: 'parent', steps: { up, down } }
    }
    if (up === 2) {
      return { label: isFemale ? 'tu abuela' : isMale ? 'tu abuelo' : 'tu abuelo/a', category: 'grandparent', steps: { up, down } }
    }
    const prefix = up === 3 ? 'bis' : 'tatara'.repeat(up - 3) + 'bis'
    return { label: isFemale ? `tu ${prefix}abuela` : isMale ? `tu ${prefix}abuelo` : `tu ${prefix}abuelo/a`, category: 'grandparent', steps: { up, down } }
  }

  // (1, 1): hermanos (LCA es padre/madre común)
  if (up === 1 && down === 1) {
    return { label: isFemale ? 'tu hermana' : isMale ? 'tu hermano' : 'tu hermano/a', category: 'sibling', steps: { up, down } }
  }

  // (1, 2): tío/tía (LCA es padre, downSteps llega a hermano del padre)
  // Wait — actually (1, 2) means: from→LCA up 1 (parent), LCA→target down 2 (grandchild of parent = niece/nephew)
  // (2, 1) means: from→LCA up 2 (grandparent), LCA→target down 1 (child of grandparent = aunt/uncle)
  // Let me redo this more carefully.

  // Tío/tía: from→parent→grandparent (up=2), grandparent→sibling-of-parent (down=1) → target is parent's sibling
  if (up === 2 && down === 1) {
    return { label: isFemale ? 'tu tía' : isMale ? 'tu tío' : 'tu tío/a', category: 'aunt-uncle', steps: { up, down } }
  }

  // Sobrino/sobrina: from→parent (up=1), parent→sibling→child (down=2)
  if (up === 1 && down === 2) {
    return { label: isFemale ? 'tu sobrina' : isMale ? 'tu sobrino' : 'tu sobrino/a', category: 'niece-nephew', steps: { up, down } }
  }

  // Tío abuelo / sobrino nieto: (3,1) y (1,3)
  if (up === 3 && down === 1) {
    return { label: isFemale ? 'tu tía abuela' : isMale ? 'tu tío abuelo' : 'tu tío/tía abuelo/a', category: 'great-aunt-uncle', steps: { up, down } }
  }
  if (up === 1 && down === 3) {
    return { label: isFemale ? 'tu sobrina nieta' : isMale ? 'tu sobrino nieto' : 'tu sobrino/a nieto/a', category: 'great-niece-nephew', steps: { up, down } }
  }

  // Primos: cuando up >= 2 Y down >= 2
  if (up >= 2 && down >= 2) {
    const cousinDegree = Math.min(up, down) - 1   // 2,2 → 1ro; 3,3 → 2do
    const removed = Math.abs(up - down)            // 0 = no removed; 1 = once removed
    const ordinal = cousinDegree === 1 ? 'primer' : cousinDegree === 2 ? 'segundo' : `${cousinDegree}º`
    const removedText = removed === 0 ? '' : removed === 1 ? ' una vez' : ` ${removed} veces`
    const baseLabel = `tu ${ordinal} primo${isFemale ? 'a' : ''}${removedText ? ` removido${isFemale ? 'a' : ''}${removedText}` : ''}`
    return { label: baseLabel, category: 'cousin', steps: { up, down } }
  }

  // Casos exóticos no cubiertos
  return { label: `pariente lejano (${up}↑, ${down}↓)`, category: 'unrelated', steps: { up, down } }
}

/**
 * Si no hay parentesco sanguíneo, busca si son relacionados por matrimonio:
 * - cónyuge directo
 * - suegro/suegra: cónyuge del padre/madre del partner
 * - cuñado/cuñada: hermano/a del cónyuge, o cónyuge del hermano/a
 * - yerno/nuera: cónyuge del hijo/a
 *
 * Implementación simple cubre los casos más comunes.
 */
function resolveInLaw(
  fromId: string,
  toId:   string,
  people: PersonNode[],
  couples: CoupleEdge[],
  personMap: Map<string, PersonNode>,
  ancestorsOf: (id: string) => Map<string, number>,
  childrenOf: Map<string, string[]>
): KinshipResult | null {
  const target = personMap.get(toId)
  if (!target) return null
  const isFemale = target.gender === 'FEMALE'
  const isMale   = target.gender === 'MALE'

  // Construir índice bidireccional de spouses
  const spousesOf = new Map<string, string[]>()
  for (const c of couples) {
    if (!spousesOf.has(c.p1)) spousesOf.set(c.p1, [])
    if (!spousesOf.has(c.p2)) spousesOf.set(c.p2, [])
    spousesOf.get(c.p1)!.push(c.p2)
    spousesOf.get(c.p2)!.push(c.p1)
  }

  // ¿Cónyuge directo?
  if ((spousesOf.get(fromId) ?? []).includes(toId)) {
    return { label: isFemale ? 'tu esposa' : isMale ? 'tu esposo' : 'tu pareja', category: 'spouse' }
  }

  // ¿Suegro/suegra? = padre/madre del cónyuge
  const myPartners = spousesOf.get(fromId) ?? []
  for (const partnerId of myPartners) {
    const partner = personMap.get(partnerId)
    if (!partner) continue
    if (partner.fatherId === toId) {
      return { label: isFemale ? 'tu suegra' : isMale ? 'tu suegro' : 'tu suegro/a', category: 'in-law' }
    }
    if (partner.motherId === toId) {
      return { label: isFemale ? 'tu suegra' : isMale ? 'tu suegro' : 'tu suegro/a', category: 'in-law' }
    }
  }

  // ¿Cuñado/cuñada? = hermano/a del cónyuge, O cónyuge de mi hermano/a
  for (const partnerId of myPartners) {
    const partner = personMap.get(partnerId)
    if (!partner) continue
    // Hermanos del partner: comparten padre o madre con partner
    const partnerSiblings = people.filter(p =>
      p.id !== partner.id &&
      ((partner.fatherId && p.fatherId === partner.fatherId) ||
       (partner.motherId && p.motherId === partner.motherId))
    )
    if (partnerSiblings.some(s => s.id === toId)) {
      return { label: isFemale ? 'tu cuñada' : isMale ? 'tu cuñado' : 'tu cuñado/a', category: 'in-law' }
    }
  }

  const me = personMap.get(fromId)
  if (me) {
    const mySiblings = people.filter(p =>
      p.id !== fromId &&
      ((me.fatherId && p.fatherId === me.fatherId) ||
       (me.motherId && p.motherId === me.motherId))
    )
    for (const sib of mySiblings) {
      if ((spousesOf.get(sib.id) ?? []).includes(toId)) {
        return { label: isFemale ? 'tu cuñada' : isMale ? 'tu cuñado' : 'tu cuñado/a', category: 'in-law' }
      }
    }
  }

  // ¿Yerno/nuera? = cónyuge de hijo/a
  const myChildren = childrenOf.get(fromId) ?? []
  for (const cid of myChildren) {
    if ((spousesOf.get(cid) ?? []).includes(toId)) {
      return { label: isFemale ? 'tu nuera' : isMale ? 'tu yerno' : 'tu yerno/nuera', category: 'in-law' }
    }
  }

  void ancestorsOf  // avoids unused warning; reservado para futuras extensiones
  return null
}
