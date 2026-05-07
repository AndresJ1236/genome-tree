'use client'

import { useRef } from 'react'
import { NODE_W, NODE_H } from '@/lib/tree-layout'
import type { LayoutNode } from '@/lib/tree-types'

// Trigger discreto: el mouse debe quedarse quieto sobre el nodo durante 1 sec.
// Touch usa el mismo timing — un "tap and hold" estándar.
const HOVER_STILL_MS = 1000
const STILL_MOVE_TOLERANCE = 8  // px — si se mueve más, reseteamos el timer

interface PersonNodeProps {
  node: LayoutNode
  selected: boolean
  highlighted: boolean
  isCurrentUser: boolean
  onSelect: (id: string) => void
  /** Long-press detectado — el componente padre muestra el menú radial.
      El menú se posiciona con las coordenadas tree-space del nodo
      (el padre las conoce vía el layout), así que solo pasamos el ID. */
  onLongPress?: (id: string) => void
  /** Si el viewer tiene permiso para crear personas. Si no, no se activa
      el detector de long-press. */
  longPressEnabled?: boolean
  animDelay: number
}

export function PersonNode({ node, selected, highlighted, isCurrentUser, onSelect, onLongPress, longPressEnabled, animDelay }: PersonNodeProps) {
  if (node.nodeKind === 'PET') {
    return (
      <PetNode
        node={node}
        selected={selected}
        highlighted={highlighted}
        isCurrentUser={isCurrentUser}
        onSelect={onSelect}
        animDelay={animDelay}
      />
    )
  }

  const initials = (node.firstName[0] ?? '') + (node.lastName[0] ?? '')
  const isDead   = !!node.deathDate
  const birthYear = node.birthDate ? new Date(node.birthDate).getFullYear() : null
  const deathYear = node.deathDate ? new Date(node.deathDate).getFullYear() : null

  // ── Hover-still detection ───────────────────────────────────────────
  // Esquema discreto:
  //   • mouseenter (o touchstart) → arrancar timer + guardar coords iniciales
  //   • mousemove → si el mouse se desplazó > N px, reseteamos el timer
  //                 (la idea es "quedarse quieto", micro-movimientos OK)
  //   • mouseleave / touchend / click → cancelar
  //   • timer cumple → onLongPress() abre el menú radial. Los bubbles
  //                    están en un overlay con su propio backdrop, así
  //                    que un mouseleave subsecuente NO los cierra.
  //
  // Click (corto) sigue funcionando normal: abre el panel del perfil.
  // No hace falta suprimir el click porque el trigger es hover, no press.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startCoord = useRef<{ x: number; y: number } | null>(null)

  function clearTimer() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    startCoord.current = null
  }

  function startHoverTimer(clientX: number, clientY: number) {
    if (!longPressEnabled || !onLongPress) return
    startCoord.current = { x: clientX, y: clientY }
    clearTimer()
    hoverTimer.current = setTimeout(() => {
      onLongPress(node.id)
      hoverTimer.current = null
      startCoord.current = null
    }, HOVER_STILL_MS)
  }

  function handleMove(clientX: number, clientY: number) {
    if (!startCoord.current || !hoverTimer.current) return
    const dx = clientX - startCoord.current.x
    const dy = clientY - startCoord.current.y
    if (Math.hypot(dx, dy) > STILL_MOVE_TOLERANCE) {
      // No se quedó quieto — reiniciar el timer en la nueva posición.
      // De esta forma, parar de mover en cualquier momento sigue contando.
      startHoverTimer(clientX, clientY)
    }
  }

  return (
    <div
      onClick={() => onSelect(node.id)}
      onMouseEnter={e => startHoverTimer(e.clientX, e.clientY)}
      onMouseMove={e => handleMove(e.clientX, e.clientY)}
      onMouseLeave={clearTimer}
      onMouseDown={clearTimer}
      onTouchStart={e => {
        const t = e.touches[0]
        if (t) startHoverTimer(t.clientX, t.clientY)
      }}
      onTouchMove={e => {
        const t = e.touches[0]
        if (t) handleMove(t.clientX, t.clientY)
      }}
      onTouchEnd={clearTimer}
      onTouchCancel={clearTimer}
      className="person-node absolute cursor-pointer select-none flex flex-col items-center"
      style={{ left: node.x, top: node.y, width: NODE_W, animationDelay: `${animDelay}ms` }}
    >
      <div
        className={selected ? 'person-circle person-circle--selected' : 'person-circle'}
        style={{
          width: NODE_W,
          height: NODE_H,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.25s ease, box-shadow 0.25s ease',
          background: selected      ? '#2D4A3E'
                    : isCurrentUser ? '#FFF3D6'
                    : highlighted   ? '#C8D9D2'
                    : isDead        ? '#EDE8E0'
                    : '#EAF0ED',
          border: selected      ? '2px solid #2D4A3E'
                : isCurrentUser ? '2px solid #C5973A'
                : highlighted   ? '2px solid #7aad95'
                : isDead        ? '1.5px dashed #9B9690'
                : '1.5px solid #B5C4BC',
          boxShadow: selected      ? '0 0 0 5px rgba(45,74,62,0.18)'
                   : isCurrentUser ? '0 0 0 4px rgba(197,151,58,0.28)'
                   : highlighted   ? '0 0 0 3px rgba(122,173,149,0.22)'
                   : '0 2px 8px rgba(44,44,44,0.09)',
        }}
      >
        <span
          style={{
            fontSize: 17,
            fontFamily: 'Georgia, Cambria, serif',
            fontWeight: 600,
            color: selected ? '#fff' : isCurrentUser ? '#8B5E1A' : isDead ? '#6B6660' : '#2D4A3E',
            letterSpacing: '0.04em',
          }}
        >
          {initials.toUpperCase()}
        </span>
      </div>

      <p
        style={{
          marginTop: 7,
          textAlign: 'center',
          fontSize: 13,
          fontFamily: 'Georgia, Cambria, serif',
          color: '#3a3a3a',
          lineHeight: 1.35,
          maxWidth: NODE_W + 24,
          wordBreak: 'break-word',
        }}
      >
        {node.firstName}
        {birthYear && (
          <>
            <br />
            <span style={{ fontSize: 11, opacity: 0.55 }}>
              {birthYear}{deathYear ? `–${deathYear}` : ''}
            </span>
          </>
        )}
      </p>
    </div>
  )
}

// ── Nodo de mascota — más pequeño y discreto ──────────────────────────────

function PetNode({ node, selected, highlighted, isCurrentUser: _isCurrentUser, onSelect, animDelay }: PersonNodeProps) {
  const PET_SIZE   = 44
  const initial    = (node.firstName[0] ?? '').toUpperCase()
  const birthYear  = node.birthDate ? new Date(node.birthDate).getFullYear() : null
  const deathYear  = node.deathDate ? new Date(node.deathDate).getFullYear() : null

  return (
    <div
      onClick={() => onSelect(node.id)}
      className="person-node absolute cursor-pointer select-none flex flex-col items-center"
      style={{
        left: node.x + (NODE_W - PET_SIZE) / 2,
        top:  node.y + (NODE_H - PET_SIZE) / 2,
        width: PET_SIZE,
        animationDelay: `${animDelay}ms`,
      }}
    >
      <div
        style={{
          width: PET_SIZE,
          height: PET_SIZE,
          borderRadius: '50%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          transition: 'background 0.25s ease, box-shadow 0.25s ease',
          background: selected   ? '#4A3E2D' : highlighted ? '#D9D2C8' : '#F0EBE3',
          border:     selected   ? '2px solid #4A3E2D'
                    : highlighted ? '2px solid #ad977a'
                    : '1.5px dashed #C4B8A8',
          boxShadow: selected    ? '0 0 0 4px rgba(74,62,45,0.18)'
                   : highlighted ? '0 0 0 3px rgba(173,151,122,0.22)'
                   : '0 1px 5px rgba(44,44,44,0.08)',
        }}
      >
        <span style={{ fontSize: 8, lineHeight: 1, color: selected ? '#fff' : '#8B7B66' }}>◉</span>
        <span style={{ fontSize: 13, fontFamily: 'Georgia, Cambria, serif', fontWeight: 600, color: selected ? '#fff' : '#6B5A44', letterSpacing: '0.04em' }}>
          {initial}
        </span>
      </div>

      <p
        style={{
          marginTop: 4,
          textAlign: 'center',
          fontSize: 10,
          fontFamily: 'Georgia, Cambria, serif',
          color: '#7A6B5A',
          lineHeight: 1.3,
          maxWidth: NODE_W,
          wordBreak: 'break-word',
          opacity: 0.85,
        }}
      >
        {node.firstName}
        {birthYear && (
          <>
            <br />
            <span style={{ fontSize: 9, opacity: 0.6 }}>
              {birthYear}{deathYear ? `–${deathYear}` : ''}
            </span>
          </>
        )}
      </p>
    </div>
  )
}
