'use client'

import { useEffect, useState, useTransition } from 'react'
import { listReactions, toggleReaction } from '@/app/actions/reactions'
import { REACTION_TYPES, type ReactionSummary, type ReactionTypeValue } from '@/lib/reactions-types'

interface ReactionBarProps {
  contentId?: string
  mediaId?:   string
  /** Visual variant: full bar with all 5 types, or compact "❤️ 3" pill */
  variant?:   'full' | 'compact'
}

const EMOJI: Record<ReactionTypeValue, string> = {
  HEART: '❤️',
  LAUGH: '😄',
  WOW:   '😮',
  SAD:   '😢',
  PRAY:  '🙏',
}

const LABEL: Record<ReactionTypeValue, string> = {
  HEART: 'Me emociona',
  LAUGH: 'Qué chistoso',
  WOW:   'No sabía',
  SAD:   'Qué tristeza',
  PRAY:  'Honor',
}

/**
 * Barra de reacciones para una historia o foto. Muestra los 5 tipos
 * disponibles; sólo aparecen counts en los que tengan al menos 1
 * reacción (los demás son botones blancos pequeños hasta que se usen).
 *
 * Optimistic update: al hacer clic, el conteo se actualiza inmediatamente
 * y luego se sincroniza con el servidor.
 */
export function ReactionBar({ contentId, mediaId, variant = 'full' }: ReactionBarProps) {
  const [summary, setSummary] = useState<ReactionSummary[] | null>(null)
  const [pending, startTransition] = useTransition()

  // Carga inicial
  useEffect(() => {
    if (!contentId && !mediaId) return
    listReactions({ contentId, mediaId }).then(r => {
      if (r.ok) setSummary(r.data)
    })
  }, [contentId, mediaId])

  function handleClick(type: ReactionTypeValue) {
    if (!summary) return
    // Optimistic flip
    setSummary(prev =>
      prev?.map(r =>
        r.type === type
          ? { ...r, mine: !r.mine, count: r.mine ? r.count - 1 : r.count + 1 }
          : r
      ) ?? null
    )
    startTransition(async () => {
      const res = await toggleReaction({ type, contentId, mediaId })
      if (res.ok) setSummary(res.data)
    })
  }

  if (!summary) return null   // o un skeleton, pero no es crítico

  // Compact: solo el agregado total, ej. "❤️ 5" — útil debajo de fotos
  if (variant === 'compact') {
    const total = summary.reduce((sum, r) => sum + r.count, 0)
    if (total === 0) return null
    const top = summary.filter(r => r.count > 0).sort((a, b) => b.count - a.count).slice(0, 3)
    return (
      <div style={{
        display: 'inline-flex',
        gap: 4,
        alignItems: 'center',
        fontSize: 11,
        color: '#6B6B6B',
        background: 'rgba(255,255,255,0.92)',
        padding: '3px 8px',
        borderRadius: 12,
        border: '1px solid #E0DAD0',
      }}>
        {top.map(r => <span key={r.type}>{EMOJI[r.type]}</span>)}
        <span style={{ marginLeft: 2 }}>{total}</span>
      </div>
    )
  }

  // Full: barra con los 5 tipos. Tipos sin count son más sutiles.
  return (
    <div style={{
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      flexWrap: 'wrap',
      marginTop: 8,
    }}>
      {REACTION_TYPES.map(type => {
        const r = summary.find(s => s.type === type)!
        const active = r.mine
        const empty = r.count === 0

        const tooltip = r.count > 0
          ? `${LABEL[type]}: ${r.preview.join(', ')}${r.count > r.preview.length ? ` y ${r.count - r.preview.length} más` : ''}`
          : LABEL[type]

        return (
          <button
            key={type}
            type="button"
            onClick={() => handleClick(type)}
            disabled={pending}
            title={tooltip}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: empty ? '4px 8px' : '4px 10px',
              fontSize: 13,
              border: '1px solid',
              borderColor: active ? '#2D4A3E' : '#E0DAD0',
              background: active ? '#EAF0ED' : (empty ? '#FFFDF9' : '#FAF7F0'),
              color: active ? '#2D4A3E' : '#6B6B6B',
              borderRadius: 14,
              cursor: pending ? 'wait' : 'pointer',
              transition: 'all 0.15s',
              opacity: empty && !active ? 0.55 : 1,
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => {
              if (!pending) (e.currentTarget as HTMLButtonElement).style.opacity = '1'
            }}
            onMouseLeave={e => {
              if (empty && !active) (e.currentTarget as HTMLButtonElement).style.opacity = '0.55'
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>{EMOJI[type]}</span>
            {r.count > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600 }}>{r.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
