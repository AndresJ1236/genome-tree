'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface QuickActionTarget {
  personId:  string
  hasFather: boolean
  hasMother: boolean
  /** Coordenada del centro del círculo en SCREEN-space (post zoom/pan) */
  centerX:   number
  centerY:   number
}

interface QuickActionMenuProps {
  target:     QuickActionTarget
  familySlug: string
  onClose:    () => void
}

/**
 * Menú radial de acciones rápidas que se despliega alrededor de un nodo
 * tras un long-press. Las 4 burbujas se posicionan en N/E/S/W (no
 * diagonales para evitar superposición con el nombre debajo del nodo).
 *
 * Si la persona ya tiene padre/madre asignado, ese bubble se ve gris y
 * no es clickeable (con tooltip explicando por qué).
 */
const RADIUS = 80      // distancia del centro del nodo al centro del bubble
const BUBBLE_W = 84
const BUBBLE_H = 64
const ANIM_MS = 180

interface Action {
  key:      'father' | 'mother' | 'sibling' | 'child'
  icon:     string
  label:    string
  /** Ángulo en grados — 0=arriba, 90=derecha, 180=abajo, 270=izquierda */
  angle:    number
  disabled: boolean
  disabledReason?: string
}

export function QuickActionMenu({ target, familySlug, onClose }: QuickActionMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  // Trigger la animación de entrada en el siguiente frame
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // ESC y click-outside cierran
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const actions: Action[] = [
    {
      key: 'father',  icon: '👨', label: 'Padre',
      angle: 315, // arriba-izquierda
      disabled: target.hasFather,
      disabledReason: 'Esta persona ya tiene padre asignado',
    },
    {
      key: 'mother',  icon: '👩', label: 'Madre',
      angle: 45,  // arriba-derecha
      disabled: target.hasMother,
      disabledReason: 'Esta persona ya tiene madre asignada',
    },
    {
      key: 'sibling', icon: '🧑‍🤝‍🧑', label: 'Hermano/a',
      angle: 270, // izquierda
      disabled: false,
    },
    {
      key: 'child',   icon: '👶', label: 'Hijo/a',
      angle: 180, // abajo
      disabled: false,
    },
  ]

  function handleAction(action: Action) {
    if (action.disabled) return
    const params = new URLSearchParams()
    if (action.key === 'father')      params.set('childOf', target.personId)
    else if (action.key === 'mother') params.set('childOf', target.personId)
    else if (action.key === 'sibling') params.set('siblingOf', target.personId)
    else if (action.key === 'child')   params.set('parentOf', target.personId)
    if (action.key === 'father') params.set('asParent', 'father')
    if (action.key === 'mother') params.set('asParent', 'mother')
    router.push(`/${familySlug}/person/new?${params.toString()}`)
  }

  return (
    <>
      {/* Backdrop transparente que captura el click-outside.
          Sin color de fondo para no oscurecer la vista del árbol. */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          cursor: 'default',
        }}
      />

      {/* Bubbles — posicionados absolutamente sobre el viewport */}
      {actions.map((action, i) => {
        const rad = (action.angle - 90) * Math.PI / 180  // -90 para que 0=arriba
        const dx = Math.cos(rad) * RADIUS
        const dy = Math.sin(rad) * RADIUS
        return (
          <button
            key={action.key}
            type="button"
            disabled={action.disabled}
            onClick={() => handleAction(action)}
            title={action.disabled ? action.disabledReason : `Añadir ${action.label.toLowerCase()}`}
            style={{
              position: 'fixed',
              left: target.centerX + dx - BUBBLE_W / 2,
              top:  target.centerY + dy - BUBBLE_H / 2,
              width: BUBBLE_W, height: BUBBLE_H,
              borderRadius: 8,
              border: action.disabled ? '1.5px solid #C8C2B8' : '1.5px solid #2D4A3E',
              background: action.disabled ? '#E8E5DD' : '#FFFDF9',
              color: action.disabled ? '#9B9690' : '#2D4A3E',
              cursor: action.disabled ? 'not-allowed' : 'pointer',
              fontSize: 11,
              fontFamily: 'Georgia, serif',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              boxShadow: action.disabled ? 'none' : '0 4px 14px rgba(45,74,62,0.18)',
              zIndex: 201,
              transform: open ? 'scale(1)' : 'scale(0.4)',
              opacity: open ? 1 : 0,
              transition: `transform ${ANIM_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 30}ms, opacity ${ANIM_MS}ms ease-out ${i * 30}ms`,
              willChange: 'transform, opacity',
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{action.icon}</span>
            <span style={{ letterSpacing: '0.04em' }}>{action.label}</span>
          </button>
        )
      })}
    </>
  )
}

// Helpers compartidos para el componente del nodo
export const QUICK_PRESS_MS = 600
