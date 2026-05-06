'use client'

import { useEffect, useState, useTransition } from 'react'
import { listComments, createComment, deleteComment, type CommentItem } from '@/app/actions/comments'

interface CommentsThreadProps {
  contentId: string
  /** Texto del placeholder; depende del tipo de contenido (historia, receta, etc.) */
  placeholder?: string
}

/**
 * Hilo de comentarios embebido al final de cada item de Content.
 * Carga lazy: solo pide los comentarios cuando se hace clic en "Mostrar".
 * Esto evita N queries cuando un perfil tiene 30 historias.
 */
export function CommentsThread({ contentId, placeholder = 'Escribe un comentario...' }: CommentsThreadProps) {
  const [items, setItems] = useState<CommentItem[] | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [count, setCount] = useState<number | null>(null)

  // Lazy load on first expansion
  useEffect(() => {
    if (!expanded || items !== null) return
    listComments(contentId).then(r => {
      if (r.ok) {
        setItems(r.data)
        setCount(r.data.length)
      } else {
        setError(r.error)
      }
    })
  }, [expanded, contentId, items])

  // Carga ligera del CONTEO al montar (sin la lista) para mostrar "3 comentarios"
  // en el botón. Reusamos listComments y descartamos el detalle si no se expandió.
  useEffect(() => {
    if (count !== null) return
    listComments(contentId).then(r => {
      if (r.ok) setCount(r.data.length)
    })
  }, [contentId, count])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    startTransition(async () => {
      const r = await createComment(contentId, draft)
      if (r.ok) {
        setItems(prev => [...(prev ?? []), r.data])
        setCount(c => (c ?? 0) + 1)
        setDraft('')
        setError(null)
      } else {
        setError(r.error)
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('¿Borrar este comentario?')) return
    startTransition(async () => {
      const r = await deleteComment(id)
      if (r.ok) {
        setItems(prev => prev?.filter(c => c.id !== id) ?? null)
        setCount(c => (c != null ? Math.max(0, c - 1) : null))
      } else {
        setError(r.error)
      }
    })
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #E0DAD0' }}>
      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#2D4A3E',
            fontSize: 12,
            letterSpacing: '0.04em',
            cursor: 'pointer',
            padding: 0,
            textDecoration: 'underline',
          }}
        >
          {count === 0 || count === null
            ? '💬 Comentar'
            : `💬 Ver ${count} comentario${count === 1 ? '' : 's'}`}
        </button>
      )}

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items === null && (
            <p style={{ fontSize: 12, color: '#8B9E94' }}>Cargando comentarios...</p>
          )}

          {items && items.length === 0 && (
            <p style={{ fontSize: 12, color: '#8B9E94', fontStyle: 'italic' }}>
              Aún no hay comentarios. Sé el primero.
            </p>
          )}

          {items && items.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(c => (
                <li key={c.id} style={{
                  padding: '8px 12px',
                  background: c.isMine ? '#F0EDE5' : '#FAF7F0',
                  border: '1px solid #E0DAD0',
                  borderRadius: 3,
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                    marginBottom: 4,
                  }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#2D4A3E',
                      letterSpacing: '0.04em',
                    }}>
                      {c.authorName}{c.isMine ? ' (tú)' : ''}
                    </span>
                    <span style={{ fontSize: 10, color: '#8B9E94' }}>
                      {formatRelative(c.createdAt)}
                    </span>
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#2C2C2C',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {c.body}
                  </p>
                  {c.isMine && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={pending}
                      style={{
                        marginTop: 6,
                        background: 'transparent',
                        border: 'none',
                        color: '#8B4444',
                        fontSize: 10,
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline',
                      }}
                    >
                      borrar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={placeholder}
              rows={2}
              maxLength={2000}
              disabled={pending}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #C8D4CE',
                borderRadius: 2,
                resize: 'vertical',
                fontFamily: 'inherit',
                background: '#FFFDF9',
              }}
            />
            {error && (
              <p style={{ fontSize: 11, color: '#8B4444', margin: 0 }}>{error}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => { setExpanded(false); setDraft(''); setError(null) }}
                disabled={pending}
                style={{
                  background: 'transparent',
                  border: '1px solid #E0DAD0',
                  borderRadius: 2,
                  padding: '6px 14px',
                  fontSize: 11,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#6B6B6B',
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={pending || !draft.trim()}
                style={{
                  background: '#2D4A3E',
                  color: '#F5F0E8',
                  border: 'none',
                  borderRadius: 2,
                  padding: '6px 16px',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  opacity: pending || !draft.trim() ? 0.5 : 1,
                }}
              >
                {pending ? 'Enviando...' : 'Comentar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'ahora'
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`
  if (diffSec < 86400 * 7) return `hace ${Math.floor(diffSec / 86400)} d`
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}
