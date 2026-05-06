'use client'

import { useEffect, useState } from 'react'
import { getKinship, type KinshipResult } from '@/app/actions/people'

interface KinshipBadgeProps {
  /** ID de la persona cuyo parentesco queremos mostrar (relativo al usuario logueado) */
  personId: string
}

/**
 * Pequeño badge que aparece debajo del nombre en PersonPanel mostrando
 * cómo se relaciona esa persona con el usuario logueado: "tu papá", "tu
 * primo segundo", "tu cuñada", etc. Click → ocultar para no molestar.
 *
 * Usa el helper calculateKinship vía server action getKinship. Cargado
 * lazy: si la persona es el propio usuario, no aparece.
 */
export function KinshipBadge({ personId }: KinshipBadgeProps) {
  const [result, setResult] = useState<KinshipResult | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
    setResult(null)
    getKinship(personId).then(r => {
      setLoaded(true)
      if (r.ok) setResult(r.data)
    })
  }, [personId])

  if (!loaded) return null

  // Si es uno mismo, o si no hay relación visible, no mostramos badge
  // (la opción 'unrelated' suele ser falso negativo cuando faltan parentescos
  // en los datos, así que tampoco la mostramos para no confundir)
  if (!result || result.category === 'self' || result.category === 'unrelated') {
    return null
  }

  // Color según categoría — código de colores para distinguir consanguíneo / político
  const palette: Record<KinshipResult['category'], { bg: string; fg: string; border: string }> = {
    self:                { bg: '#fff', fg: '#333', border: '#ccc' },
    parent:              { bg: '#EAF0ED', fg: '#2D4A3E', border: '#B5C4BC' },
    grandparent:         { bg: '#EAF0ED', fg: '#2D4A3E', border: '#B5C4BC' },
    child:               { bg: '#EAF0ED', fg: '#2D4A3E', border: '#B5C4BC' },
    descendant:          { bg: '#EAF0ED', fg: '#2D4A3E', border: '#B5C4BC' },
    sibling:             { bg: '#FFF8E6', fg: '#8B6411', border: '#E8D68A' },
    'half-sibling':      { bg: '#FFF8E6', fg: '#8B6411', border: '#E8D68A' },
    'aunt-uncle':        { bg: '#F0EDE5', fg: '#6B5A35', border: '#D4C7A8' },
    'great-aunt-uncle':  { bg: '#F0EDE5', fg: '#6B5A35', border: '#D4C7A8' },
    'niece-nephew':      { bg: '#F0EDE5', fg: '#6B5A35', border: '#D4C7A8' },
    'great-niece-nephew':{ bg: '#F0EDE5', fg: '#6B5A35', border: '#D4C7A8' },
    cousin:              { bg: '#EFF2EE', fg: '#5B6E61', border: '#C8D4CE' },
    spouse:              { bg: '#FAEBEB', fg: '#8B4444', border: '#E6C1C1' },
    'in-law':            { bg: '#FAEBEB', fg: '#8B4444', border: '#E6C1C1' },
    unrelated:           { bg: '#fff', fg: '#999', border: '#ddd' },
  }
  const c = palette[result.category]

  return (
    <span
      title={`Parentesco calculado desde tu posición en el árbol`}
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        fontSize: 11,
        letterSpacing: '0.04em',
        fontWeight: 500,
      }}
    >
      {result.label}
    </span>
  )
}
