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
 * tras hover quieto. 4 burbujas circulares pequeñas con solo emoji,
 * tooltip nativo para el label.
 *
 * Posiciones: N, W, E + esquinas — TODAS evitan el sur (180°) porque
 * ahí está el nombre de la persona.
 *
 * Si la persona ya tiene padre/madre asignado, ese bubble se ve gris y
 * no es clickeable (con tooltip explicando por qué).
 */
const RADIUS = 64      // distancia del centro del nodo al centro del bubble
const BUBBLE = 40      // diámetro de cada burbuja (circular)
const ANIM_MS = 180
// Radio adicional fuera del cual se cierra el menú (menos esa zona = "out of bounds").
// Cubre la burbuja + un margen generoso para que pequeños desajustes
// del mouse no cierren el menú accidentalmente.
const CLOSE_ZONE_PAD = 26
const CLOSE_ZONE = RADIUS + BUBBLE / 2 + CLOSE_ZONE_PAD
// Grace period — al abrir el menú, no cerrar inmediatamente aunque el
// mouse esté lejos por un instante.
const GRACE_MS = 250

interface Action {
  key:      'father' | 'mother' | 'partner' | 'sibling' | 'child'
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

  // ESC cierra
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Auto-close cuando el mouse sale del radio que cubre las burbujas.
  // Con un grace period inicial para no cerrar antes de que el usuario
  // tenga oportunidad de ver el menú o moverse hacia una burbuja.
  useEffect(() => {
    let activeListener: ((e: MouseEvent) => void) | null = null
    const grace = setTimeout(() => {
      activeListener = (e: MouseEvent) => {
        const dx = e.clientX - target.centerX
        const dy = e.clientY - target.centerY
        if (Math.hypot(dx, dy) > CLOSE_ZONE) onClose()
      }
      window.addEventListener('mousemove', activeListener)
    }, GRACE_MS)
    return () => {
      clearTimeout(grace)
      if (activeListener) window.removeEventListener('mousemove', activeListener)
    }
  }, [target.centerX, target.centerY, onClose])

  // 5 burbujas en el arco superior (270° → 0° → 90°) cada 45°, evitando
  // el sur (180°) donde está el nombre.
  //
  //         🤝 Pareja (0°)
  //   👨 Padre              👩 Madre
  //   (315°)                (45°)
  //   🧑‍🤝‍🧑 Hermano    [JP]    👶 Hijo
  //   (270°)                (90°)
  //         (nombre debajo, libre)
  const actions: Action[] = [
    {
      key: 'sibling', icon: '🧑‍🤝‍🧑', label: 'Añadir hermano/a',
      angle: 270, // izquierda
      disabled: false,
    },
    {
      key: 'father',  icon: '👨', label: 'Añadir padre',
      angle: 315, // arriba-izquierda
      disabled: target.hasFather,
      disabledReason: 'Ya tiene padre asignado',
    },
    {
      key: 'partner', icon: '💑', label: 'Añadir pareja',
      angle: 0,   // arriba (norte)
      disabled: false,
    },
    {
      key: 'mother',  icon: '👩', label: 'Añadir madre',
      angle: 45,  // arriba-derecha
      disabled: target.hasMother,
      disabledReason: 'Ya tiene madre asignada',
    },
    {
      key: 'child',   icon: '👶', label: 'Añadir hijo/a',
      angle: 90,  // derecha
      disabled: false,
    },
  ]

  function handleAction(action: Action) {
    if (action.disabled) return
    const params = new URLSearchParams()
    // father/mother: el nuevo es PADRE/MADRE de la persona target
    //   → en el editor, target queda como hijo del nuevo (parentOf)
    // sibling: mismos padres
    // child: el nuevo es HIJO de la persona target (target queda como padre/madre)
    //   → en el editor, target queda como padre/madre del nuevo (childOf)
    // partner: el nuevo es pareja del target
    if (action.key === 'father') {
      params.set('parentOf', target.personId)
      params.set('asParent', 'father')
    } else if (action.key === 'mother') {
      params.set('parentOf', target.personId)
      params.set('asParent', 'mother')
    } else if (action.key === 'sibling') {
      params.set('siblingOf', target.personId)
    } else if (action.key === 'child') {
      params.set('childOf', target.personId)
    } else if (action.key === 'partner') {
      params.set('partnerOf', target.personId)
    }
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

      {/* Burbujas circulares pequeñas — solo emoji, tooltip nativo del browser
          muestra el label completo al hover. Discretas pero claras. */}
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
            title={action.disabled ? action.disabledReason : action.label}
            style={{
              position: 'fixed',
              left: target.centerX + dx - BUBBLE / 2,
              top:  target.centerY + dy - BUBBLE / 2,
              width: BUBBLE, height: BUBBLE,
              borderRadius: '50%',
              border: action.disabled ? '1.5px solid #C8C2B8' : '1.5px solid #2D4A3E',
              background: action.disabled ? '#E8E5DD' : '#FFFDF9',
              color: action.disabled ? '#9B9690' : '#2D4A3E',
              cursor: action.disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              boxShadow: action.disabled ? 'none' : '0 3px 10px rgba(45,74,62,0.22)',
              zIndex: 201,
              transform: open ? 'scale(1)' : 'scale(0.3)',
              opacity: open ? (action.disabled ? 0.7 : 1) : 0,
              transition: `transform ${ANIM_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 30}ms, opacity ${ANIM_MS}ms ease-out ${i * 30}ms`,
              willChange: 'transform, opacity',
            }}
            onMouseEnter={e => {
              if (!action.disabled) {
                e.currentTarget.style.transform = 'scale(1.12)'
                e.currentTarget.style.boxShadow = '0 5px 14px rgba(45,74,62,0.32)'
              }
            }}
            onMouseLeave={e => {
              if (!action.disabled) {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = '0 3px 10px rgba(45,74,62,0.22)'
              }
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1, filter: action.disabled ? 'grayscale(0.7)' : 'none' }}>
              {action.icon}
            </span>
          </button>
        )
      })}
    </>
  )
}

// Helpers compartidos para el componente del nodo
export const QUICK_PRESS_MS = 600
