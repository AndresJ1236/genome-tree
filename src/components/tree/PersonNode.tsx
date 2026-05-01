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

export function PersonNode({ node, selected, highlighted, onSelect, animDelay }: PersonNodeProps) {
  const initials = (node.firstName[0] ?? '') + (node.lastName[0] ?? '')

  const birthYear = node.birthDate ? new Date(node.birthDate).getFullYear() : null
  const deathYear = node.deathDate ? new Date(node.deathDate).getFullYear() : null
  const isDead = !!deathYear

  const circleStyle: React.CSSProperties = {
    width: NODE_W,
    height: NODE_H,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.25s ease, box-shadow 0.25s ease',
    background: selected ? '#2D4A3E' : highlighted ? '#C8D9D2' : '#EAF0ED',
    border: selected
      ? '2px solid #2D4A3E'
      : highlighted
      ? '2px solid #7aad95'
      : '1.5px solid #B5C4BC',
    boxShadow: selected
      ? '0 0 0 5px rgba(45,74,62,0.18)'
      : highlighted
      ? '0 0 0 3px rgba(122,173,149,0.22)'
      : '0 2px 8px rgba(44,44,44,0.09)',
    opacity: isDead ? 0.68 : 1,
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
            color: selected ? '#fff' : '#2D4A3E',
            letterSpacing: '0.04em',
          }}
        >
          {initials.toUpperCase()}
        </span>
      </div>

      {/* Name + dates below circle */}
      <p
        style={{
          marginTop: 7,
          textAlign: 'center',
          fontSize: 11,
          fontFamily: 'Georgia, Cambria, serif',
          color: '#3a3a3a',
          lineHeight: 1.35,
          whiteSpace: 'nowrap',
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
