'use client'

import { NODE_W, NODE_H } from '@/lib/tree-layout'
import type { LayoutNode } from '@/lib/tree-types'

interface PersonNodeProps {
  node: LayoutNode
  selected: boolean
  highlighted: boolean
  onSelect: (id: string) => void
  animDelay: number
}

// ── Paleta por género (discreta, dentro del tono general del sitio) ────────
const GENDER_PALETTE = {
  MALE: {
    bg:          '#EEF2F7',
    bgDead:      '#E8EAED',
    border:      '1.5px solid #9DB5C8',
    borderDead:  '1.5px dashed #9BA5AE',
    color:       '#2A4A62',
    colorDead:   '#5A6570',
  },
  FEMALE: {
    bg:          '#F7EEED',
    bgDead:      '#EDE8E6',
    border:      '1.5px solid #C49A97',
    borderDead:  '1.5px dashed #AE9896',
    color:       '#6B2D2D',
    colorDead:   '#7A6565',
  },
  OTHER: {
    bg:          '#EAF0ED',
    bgDead:      '#EDE8E0',
    border:      '1.5px solid #B5C4BC',
    borderDead:  '1.5px dashed #9B9690',
    color:       '#2D4A3E',
    colorDead:   '#6B6660',
  },
  UNKNOWN: {
    bg:          '#EAF0ED',
    bgDead:      '#EDE8E0',
    border:      '1.5px solid #B5C4BC',
    borderDead:  '1.5px dashed #9B9690',
    color:       '#2D4A3E',
    colorDead:   '#6B6660',
  },
} as const

export function PersonNode({ node, selected, highlighted, onSelect, animDelay }: PersonNodeProps) {
  const isPet  = node.nodeKind === 'PET'
  const isDead = !!node.deathDate

  const birthYear = node.birthDate ? new Date(node.birthDate).getFullYear() : null
  const deathYear = node.deathDate ? new Date(node.deathDate).getFullYear() : null

  if (isPet) {
    return (
      <PetNode
        node={node}
        selected={selected}
        highlighted={highlighted}
        onSelect={onSelect}
        animDelay={animDelay}
      />
    )
  }

  const palette = GENDER_PALETTE[node.gender] ?? GENDER_PALETTE.UNKNOWN
  const initials = (node.firstName[0] ?? '') + (node.lastName[0] ?? '')

  const circleStyle: React.CSSProperties = {
    width: NODE_W,
    height: NODE_H,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.25s ease, box-shadow 0.25s ease',
    background: selected
      ? '#2D4A3E'
      : highlighted
      ? '#C8D9D2'
      : isDead
      ? palette.bgDead
      : palette.bg,
    border: selected
      ? '2px solid #2D4A3E'
      : highlighted
      ? '2px solid #7aad95'
      : isDead
      ? palette.borderDead
      : palette.border,
    boxShadow: selected
      ? '0 0 0 5px rgba(45,74,62,0.18)'
      : highlighted
      ? '0 0 0 3px rgba(122,173,149,0.22)'
      : '0 2px 8px rgba(44,44,44,0.09)',
  }

  return (
    <div
      onClick={() => onSelect(node.id)}
      className="person-node absolute cursor-pointer select-none flex flex-col items-center"
      style={{ left: node.x, top: node.y, width: NODE_W, animationDelay: `${animDelay}ms` }}
    >
      <div
        className={selected ? 'person-circle person-circle--selected' : 'person-circle'}
        style={circleStyle}
      >
        <span
          style={{
            fontSize: 17,
            fontFamily: 'Georgia, Cambria, serif',
            fontWeight: 600,
            color: selected ? '#fff' : isDead ? palette.colorDead : palette.color,
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
          fontSize: 11,
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
            <span style={{ fontSize: 10, opacity: 0.55 }}>
              {birthYear}{deathYear ? `–${deathYear}` : ''}
            </span>
          </>
        )}
      </p>
    </div>
  )
}

// ── Nodo de mascota — más pequeño y discreto ──────────────────────────────

function PetNode({ node, selected, highlighted, onSelect, animDelay }: PersonNodeProps) {
  const PET_SIZE = 44  // más pequeño que NODE_W/NODE_H (72)
  const initial = (node.firstName[0] ?? '').toUpperCase()

  return (
    <div
      onClick={() => onSelect(node.id)}
      className="person-node absolute cursor-pointer select-none flex flex-col items-center"
      style={{
        // Centrado dentro del espacio NODE_W × NODE_H para no romper el layout
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
          background: selected   ? '#4A3E2D'
                    : highlighted ? '#D9D2C8'
                    : '#F0EBE3',
          border: selected    ? '2px solid #4A3E2D'
                : highlighted ? '2px solid #ad977a'
                : '1.5px dashed #C4B8A8',
          boxShadow: selected
            ? '0 0 0 4px rgba(74,62,45,0.18)'
            : highlighted
            ? '0 0 0 3px rgba(173,151,122,0.22)'
            : '0 1px 5px rgba(44,44,44,0.08)',
        }}
      >
        <span style={{ fontSize: 8, lineHeight: 1, color: selected ? '#fff' : '#8B7B66' }}>
          ◉
        </span>
        <span
          style={{
            fontSize: 13,
            fontFamily: 'Georgia, Cambria, serif',
            fontWeight: 600,
            color: selected ? '#fff' : '#6B5A44',
            letterSpacing: '0.04em',
          }}
        >
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
      </p>
    </div>
  )
}
