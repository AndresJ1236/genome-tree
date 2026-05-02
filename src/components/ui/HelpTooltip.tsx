'use client'

import { useState } from 'react'

interface HelpTooltipProps {
  text: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  maxWidth?: number
  children?: React.ReactNode
}

export function HelpTooltip({ text, position = 'top', maxWidth = 220, children }: HelpTooltipProps) {
  const [visible, setVisible] = useState(false)

  const pos: React.CSSProperties =
    position === 'top'    ? { bottom: 'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)' } :
    position === 'bottom' ? { top:    'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)' } :
    position === 'left'   ? { right:  'calc(100% + 7px)', top:  '50%', transform: 'translateY(-50%)' } :
                            { left:   'calc(100% + 7px)', top:  '50%', transform: 'translateY(-50%)' }

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children ?? <HelpDot />}
      {visible && (
        <span
          style={{
            position: 'absolute',
            zIndex: 9999,
            background: 'rgba(28, 35, 31, 0.93)',
            color: '#F5F0E8',
            fontSize: 11,
            lineHeight: 1.5,
            padding: '7px 11px',
            borderRadius: 4,
            whiteSpace: 'pre-wrap',
            maxWidth,
            pointerEvents: 'none',
            boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
            ...pos,
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}

export function HelpDot() {
  return (
    <span
      style={{
        width: 15, height: 15, borderRadius: '50%',
        border: '1px solid #B5C4BC',
        color: '#8B9E94', fontSize: 9,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'default', fontFamily: 'Georgia, serif', fontStyle: 'italic',
        fontWeight: 700, flexShrink: 0, userSelect: 'none',
      }}
    >
      ?
    </span>
  )
}
