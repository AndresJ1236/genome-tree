'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createInviteLink } from '@/app/actions/admin'
import { NODE_W, NODE_H } from '@/lib/tree-layout'

export interface QuickActionTarget {
  personId:  string
  hasFather: boolean
  hasMother: boolean
  /** Posición del nodo en TREE coordinates (top-left del cuadrado del nodo).
      El menú se renderiza dentro del mismo contenedor transformado que los
      PersonNode, así que comparte el sistema de coordenadas y se escala
      automáticamente con el zoom/pan del árbol. */
  nodeX: number
  nodeY: number
}

interface QuickActionMenuProps {
  target:     QuickActionTarget
  familySlug: string
  /** Si el viewer es admin, se añade la 6ª burbuja "Invitar" */
  canInvite:  boolean
  onClose:    () => void
}

// Tamaños en TREE-COORDS px — al estar dentro del transformed container
// del árbol, escalan automáticamente con el zoom. Esto significa:
//   - A zoom 1x: BUBBLE se ve a BUBBLE_TREE_PX en pantalla
//   - A zoom 2x: BUBBLE se ve al doble
//   - La POSICIÓN relativa al nodo es siempre la misma
// Resultado: las burbujas siempre quedan justo afuera del borde del nodo
// con el mismo gap relativo, sin importar el zoom.
const BUBBLE = 36           // diámetro de cada burbuja en tree-px
const GAP    = 8            // espacio entre el borde del nodo y la burbuja en tree-px
const CLOSE_PAD = 36        // padding adicional EN PANTALLA para auto-close
const ANIM_MS = 180
const GRACE_MS = 250

interface Action {
  key:      'father' | 'mother' | 'partner' | 'sibling' | 'child' | 'invite'
  label:    string
  Icon:     React.ComponentType<{ size?: number }>
  disabled: boolean
  disabledReason?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Iconos SVG inline — line-based, monocromos, estilo Lucide
// ─────────────────────────────────────────────────────────────────────────────

const SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function IconFather({ size = 20 }: { size?: number }) {
  // Silueta masculina — cabeza + hombros rectos + corbata vertical
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <circle cx="12" cy="6" r="2.6" />
      <path d="M6 21v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2" />
      <path d="M12 14v3.5" />
    </svg>
  )
}

function IconMother({ size = 20 }: { size?: number }) {
  // Silueta femenina — cabeza + falda triangular tipo letrero universal
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <circle cx="12" cy="6" r="2.6" />
      <path d="M9 9h6" />
      <path d="M6 21l3-12h6l3 12z" />
    </svg>
  )
}

function IconChild({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <circle cx="12" cy="9" r="3" />
      <path d="M7 21v-1a5 5 0 0 1 10 0v1" />
      <path d="M10 9.5h.01M14 9.5h.01" />
    </svg>
  )
}

function IconSibling({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <circle cx="8" cy="9" r="2.5" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M3 20v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1" />
      <path d="M13 20v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1" />
    </svg>
  )
}

function IconHeart({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function IconMail({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Algoritmo de distribución — reparte N burbujas en arco superior 180°
// (W → N → E), evitando el sur (180°) donde está el nombre.
// ─────────────────────────────────────────────────────────────────────────────

function distributeAngles(n: number): number[] {
  if (n === 0) return []
  if (n === 1) return [0]
  if (n === 2) return [315, 45]
  const step = 180 / (n - 1)
  return Array.from({ length: n }, (_, i) => (270 + step * i) % 360)
}

// ─────────────────────────────────────────────────────────────────────────────

export function QuickActionMenu({ target, familySlug, canInvite, onClose }: QuickActionMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Trigger animación de entrada en el siguiente frame
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

  // Auto-close cuando el cursor sale del radio que cubre las burbujas.
  // wrapperRef.getBoundingClientRect() devuelve coords SCREEN ya con el
  // transform del árbol aplicado, así que el centro y el tamaño cambian
  // automáticamente con el zoom — todo en pantalla.
  useEffect(() => {
    let listener: ((e: MouseEvent) => void) | null = null
    const grace = setTimeout(() => {
      listener = (e: MouseEvent) => {
        if (!wrapperRef.current) return
        const rect = wrapperRef.current.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy)
        const closeZone = rect.width / 2 + CLOSE_PAD
        if (dist > closeZone) onClose()
      }
      window.addEventListener('mousemove', listener)
    }, GRACE_MS)
    return () => {
      clearTimeout(grace)
      if (listener) window.removeEventListener('mousemove', listener)
    }
  }, [onClose])

  // Construcción de actions — el orden define la posición en el arco
  const actions: Action[] = [
    { key: 'sibling', label: 'Añadir hermano/a', Icon: IconSibling, disabled: false },
    { key: 'father',  label: 'Añadir padre',     Icon: IconFather,  disabled: target.hasFather, disabledReason: 'Ya tiene padre asignado' },
    { key: 'partner', label: 'Añadir pareja',    Icon: IconHeart,   disabled: false },
    { key: 'mother',  label: 'Añadir madre',     Icon: IconMother,  disabled: target.hasMother, disabledReason: 'Ya tiene madre asignada' },
    { key: 'child',   label: 'Añadir hijo/a',    Icon: IconChild,   disabled: false },
  ]
  if (canInvite) {
    actions.push({ key: 'invite', label: 'Generar link de invitación', Icon: IconMail, disabled: false })
  }
  const angles = distributeAngles(actions.length)

  // Centro del nodo en TREE coords. NODE_W ≈ NODE_H (círculo aproximado).
  const nodeRadius = Math.min(NODE_W, NODE_H) / 2
  const cx = target.nodeX + NODE_W / 2
  const cy = target.nodeY + NODE_H / 2

  // RADIUS en TREE-px — distancia del centro del nodo al centro de la
  // burbuja. = radio del nodo + GAP + radio de la burbuja. Garantiza que
  // las burbujas siempre estén justo afuera del borde del nodo, no
  // adentro, sin importar zoom (porque todo está en mismas coords).
  const RADIUS = nodeRadius + GAP + BUBBLE / 2

  // Tamaño del wrapper que encompass las burbujas — necesario para
  // que getBoundingClientRect dé el centro y radio del cluster.
  const HALF = RADIUS + BUBBLE / 2 + 2

  async function handleAction(action: Action) {
    if (action.disabled) return

    if (action.key === 'invite') {
      setInviteFeedback('Generando…')
      const result = await createInviteLink({
        role: 'MEMBER',
        scope: 'FAMILY',
        branchRootId: '',
        personId: target.personId,
      })
      if (!result.ok) {
        setInviteFeedback(`Error: ${result.error}`)
        setTimeout(onClose, 2200)
        return
      }
      try {
        await navigator.clipboard.writeText(result.data.url)
        setInviteFeedback('✓ Link copiado al portapapeles')
      } catch {
        setInviteFeedback('Link generado — copia desde el editor')
      }
      setTimeout(onClose, 1800)
      return
    }

    const params = new URLSearchParams()
    if (action.key === 'father') {
      params.set('parentOf', target.personId); params.set('asParent', 'father')
    } else if (action.key === 'mother') {
      params.set('parentOf', target.personId); params.set('asParent', 'mother')
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
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        left: cx - HALF,
        top:  cy - HALF,
        width: HALF * 2,
        height: HALF * 2,
        // pointerEvents:none en el wrapper para que clicks en el espacio
        // entre burbujas pasen al árbol que está debajo. Las burbujas
        // re-habilitan pointerEvents:auto.
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      {actions.map((action, i) => {
        const angle = angles[i]
        const rad = (angle - 90) * Math.PI / 180
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
              position: 'absolute',
              left: HALF + dx - BUBBLE / 2,
              top:  HALF + dy - BUBBLE / 2,
              width: BUBBLE,
              height: BUBBLE,
              borderRadius: '50%',
              border: action.disabled ? '1.2px solid #C8C2B8' : '1.2px solid #2D4A3E',
              background: action.disabled ? '#EDEAE3' : '#FFFDF9',
              color: action.disabled ? '#9B9690' : '#2D4A3E',
              cursor: action.disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              boxShadow: action.disabled ? 'none' : '0 2px 8px rgba(45,74,62,0.18)',
              pointerEvents: 'auto',
              transform: open ? 'scale(1)' : 'scale(0.3)',
              opacity: open ? (action.disabled ? 0.55 : 1) : 0,
              transition: `transform ${ANIM_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 25}ms, opacity ${ANIM_MS}ms ease-out ${i * 25}ms, box-shadow 150ms ease, background 150ms ease`,
              willChange: 'transform, opacity',
            }}
            onMouseEnter={e => {
              if (!action.disabled) {
                e.currentTarget.style.background = '#EAF0ED'
                e.currentTarget.style.boxShadow = '0 3px 12px rgba(45,74,62,0.28)'
              }
            }}
            onMouseLeave={e => {
              if (!action.disabled) {
                e.currentTarget.style.background = '#FFFDF9'
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(45,74,62,0.18)'
              }
            }}
          >
            <action.Icon size={Math.round(BUBBLE * 0.55)} />
          </button>
        )
      })}

      {inviteFeedback && (
        <div
          style={{
            position: 'absolute',
            left: HALF,
            top:  HALF + RADIUS + BUBBLE / 2 + 8,
            transform: 'translateX(-50%)',
            background: '#2D4A3E', color: '#F5F0E8',
            padding: '4px 10px', borderRadius: 12,
            fontSize: 10, letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {inviteFeedback}
        </div>
      )}
    </div>
  )
}
