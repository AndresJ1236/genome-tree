'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createInviteLink } from '@/app/actions/admin'

export interface QuickActionTarget {
  personId:  string
  hasFather: boolean
  hasMother: boolean
  /** Coord SCREEN del centro del círculo del nodo (post zoom/pan) */
  centerX:   number
  centerY:   number
  /** Radio EN PANTALLA del círculo del nodo (post zoom). */
  nodeScreenRadius: number
}

interface QuickActionMenuProps {
  target:     QuickActionTarget
  familySlug: string
  /** Si el viewer es admin, se añade la 6ª burbuja "Invitar" */
  canInvite:  boolean
  onClose:    () => void
}

const BUBBLE = 32           // diámetro fijo de cada burbuja en px screen — más discreto
const GAP    = 8            // distancia entre el borde del nodo y el borde de la burbuja
const CLOSE_PAD = 28        // margen adicional fuera del cual se cierra el menú
const ANIM_MS = 180
const GRACE_MS = 250

/**
 * Radio del menú radial — pegado al borde del nodo en pantalla.
 * RADIUS = nodeScreenRadius + GAP + BUBBLE/2.
 *
 * Decisión de UX: las burbujas son fijas (32px) pero su POSICIÓN sigue
 * el borde del nodo, así que a zoom medio/cercano (que es cuando el
 * usuario las usa) se ven discretas y pegadas al nodo, sin meterse
 * adentro del círculo. A zoom extremo lejano puede haber overlap entre
 * burbujas — eso está OK, el usuario explícitamente dijo no importa.
 */
function computeRadius(nodeScreenRadius: number): number {
  return nodeScreenRadius + GAP + BUBBLE / 2
}

interface Action {
  key:      'father' | 'mother' | 'partner' | 'sibling' | 'child' | 'invite'
  label:    string
  /** Renderer del icono — recibe color (currentColor en stroke) */
  Icon:     React.ComponentType<{ size?: number }>
  disabled: boolean
  disabledReason?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Iconos SVG inline (estilo Lucide, line-based) — más discretos que emojis
// y con tamaño/color totalmente controlable
// ─────────────────────────────────────────────────────────────────────────────

const SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function IconFather({ size = 18 }: { size?: number }) {
  // Silueta masculina — cabeza + hombros rectos + línea de corbata vertical
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <circle cx="12" cy="6" r="2.6" />
      <path d="M6 21v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2" />
      <path d="M12 14v3.5" />
    </svg>
  )
}

function IconMother({ size = 18 }: { size?: number }) {
  // Silueta femenina — cabeza + falda triangular (estilo letrero universal)
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <circle cx="12" cy="6" r="2.6" />
      <path d="M9 9h6" />
      <path d="M6 21l3-12h6l3 12z" />
    </svg>
  )
}

function IconChild({ size = 18 }: { size?: number }) {
  // figura más pequeña — bebé/niño
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <circle cx="12" cy="9" r="3" />
      <path d="M7 21v-1a5 5 0 0 1 10 0v1" />
      <path d="M10 9.5h.01M14 9.5h.01" />
    </svg>
  )
}

function IconSibling({ size = 18 }: { size?: number }) {
  // dos personas lado a lado
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <circle cx="8" cy="9" r="2.5" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M3 20v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1" />
      <path d="M13 20v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1" />
    </svg>
  )
}

function IconHeart({ size = 18 }: { size?: number }) {
  // corazón — pareja
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function IconMail({ size = 18 }: { size?: number }) {
  // sobre — invitar
  return (
    <svg width={size} height={size} {...SVG_PROPS}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Algoritmo de distribución — ángulos derivados del número de burbujas,
// no hardcoded. Para N burbujas, distribuye en arco superior 180° desde
// W (270°) pasando por N (0°) hasta E (90°), evitando el sur (180°).
// ─────────────────────────────────────────────────────────────────────────────

function distributeAngles(n: number): number[] {
  if (n === 0) return []
  if (n === 1) return [0]                  // norte (arriba)
  if (n === 2) return [315, 45]            // NW + NE — más compacto que W+E
  // n >= 3: span 180° de 270° a 90° (clockwise por el norte)
  const start = 270
  const span  = 180
  const step  = span / (n - 1)
  return Array.from({ length: n }, (_, i) => (start + step * i) % 360)
}

// ─────────────────────────────────────────────────────────────────────────────

export function QuickActionMenu({ target, familySlug, canInvite, onClose }: QuickActionMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null)

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

  // Construir lista de actions ANTES de calcular RADIUS, porque RADIUS
  // depende del número de burbujas (para evitar overlap entre ellas
  // cuando el nodo está muy zoomed-out).
  const baseActions: Action[] = [
    { key: 'sibling', label: 'Añadir hermano/a', Icon: IconSibling, disabled: false },
    { key: 'father',  label: 'Añadir padre',     Icon: IconFather,  disabled: target.hasFather, disabledReason: 'Ya tiene padre asignado' },
    { key: 'partner', label: 'Añadir pareja',    Icon: IconHeart,   disabled: false },
    { key: 'mother',  label: 'Añadir madre',     Icon: IconMother,  disabled: target.hasMother, disabledReason: 'Ya tiene madre asignada' },
    { key: 'child',   label: 'Añadir hijo/a',    Icon: IconChild,   disabled: false },
  ]
  if (canInvite) {
    baseActions.push({ key: 'invite', label: 'Generar link de invitación', Icon: IconMail, disabled: false })
  }

  // RADIUS sigue el borde del nodo en pantalla — siempre afuera del
  // círculo sin importar el zoom. A zoom-out extremo puede haber overlap
  // entre burbujas; user explicitamente dijo "no importa cómo se vea de
  // lejos, lo que importa es medio/cerca".
  const RADIUS = computeRadius(target.nodeScreenRadius)
  const CLOSE_ZONE = RADIUS + BUBBLE / 2 + CLOSE_PAD

  useEffect(() => {
    let listener: ((e: MouseEvent) => void) | null = null
    const grace = setTimeout(() => {
      listener = (e: MouseEvent) => {
        const dx = e.clientX - target.centerX
        const dy = e.clientY - target.centerY
        if (Math.hypot(dx, dy) > CLOSE_ZONE) onClose()
      }
      window.addEventListener('mousemove', listener)
    }, GRACE_MS)
    return () => {
      clearTimeout(grace)
      if (listener) window.removeEventListener('mousemove', listener)
    }
  }, [target.centerX, target.centerY, CLOSE_ZONE, onClose])

  // El orden de baseActions (definido arriba) determina la posición en el
  // arco — de izquierda a derecha pasando por arriba. distributeAngles()
  // se encarga del cálculo angular.
  const actions = baseActions
  const angles = distributeAngles(actions.length)

  async function handleAction(action: Action) {
    if (action.disabled) return

    if (action.key === 'invite') {
      // Crear invite + copy al portapapeles, sin redirección. Mostramos
      // feedback inline por 2 segundos y luego cerramos.
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
    <>
      {/* Backdrop transparente que captura el click-outside */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 200 }}
      />

      {/* Burbujas — tamaño fijo (BUBBLE px) sin importar el zoom del árbol.
          Posición: a RADIUS px del centro del nodo, donde RADIUS depende
          del tamaño actual del nodo en pantalla. Así siempre quedan
          justo afuera del borde del círculo, no dentro. */}
      {actions.map((action, i) => {
        const angle = angles[i]
        const rad = (angle - 90) * Math.PI / 180  // -90 → 0° = arriba
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
              border: action.disabled ? '1.2px solid #C8C2B8' : '1.2px solid #2D4A3E',
              background: action.disabled ? '#EDEAE3' : '#FFFDF9',
              color: action.disabled ? '#9B9690' : '#2D4A3E',
              cursor: action.disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              boxShadow: action.disabled ? 'none' : '0 2px 8px rgba(45,74,62,0.18)',
              zIndex: 201,
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
            <action.Icon size={18} />
          </button>
        )
      })}

      {/* Feedback inline (solo para invite — el resto navega) */}
      {inviteFeedback && (
        <div
          style={{
            position: 'fixed',
            left: target.centerX,
            top:  target.centerY + RADIUS + BUBBLE / 2 + 14,
            transform: 'translateX(-50%)',
            background: '#2D4A3E', color: '#F5F0E8',
            padding: '6px 12px', borderRadius: 14,
            fontSize: 11, letterSpacing: '0.04em',
            zIndex: 202,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          }}
        >
          {inviteFeedback}
        </div>
      )}
    </>
  )
}
