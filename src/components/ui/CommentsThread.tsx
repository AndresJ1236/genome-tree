'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { listComments, createComment, deleteComment, listFamilyMembersForMention, type CommentItem } from '@/app/actions/comments'
import { MENTION_REGEX, type MentionedUser } from '@/lib/mentions'

interface CommentsThreadProps {
  contentId: string
  /** Slug de la familia, para construir links de @menciones al perfil. */
  familySlug?: string
  /** Texto del placeholder; depende del tipo de contenido (historia, receta, etc.) */
  placeholder?: string
}

/**
 * Renderiza el body de un comentario reemplazando `@palabra` con un span
 * destacado o un Link al perfil del mencionado si tiene Person.
 */
function renderBodyWithMentions(
  body: string,
  mentions: MentionedUser[],
  familySlug: string | undefined
): React.ReactNode {
  if (mentions.length === 0) return body

  const byUsernameLc = new Map(mentions.map(m => [m.username.toLowerCase(), m]))
  const byFirstNameLc = new Map(mentions.map(m => [m.name.split(/\s+/)[0]?.toLowerCase() ?? '', m]))

  const out: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0
  for (const match of body.matchAll(MENTION_REGEX)) {
    const start = match.index ?? 0
    const token = match[1].toLowerCase()
    const user = byUsernameLc.get(token) ?? byFirstNameLc.get(token)
    if (!user) continue
    if (start > lastIndex) out.push(body.slice(lastIndex, start))
    const href = familySlug && user.personId
      ? `/${familySlug}/person/${user.personId}`
      : null
    const tag = `@${user.name.split(/\s+/)[0]}`
    out.push(
      href ? (
        <Link key={key++} href={href} style={{ color: '#2D4A3E', fontWeight: 600, textDecoration: 'none', background: '#EAF0ED', padding: '0 4px', borderRadius: 2 }}>
          {tag}
        </Link>
      ) : (
        <span key={key++} style={{ color: '#2D4A3E', fontWeight: 600, background: '#EAF0ED', padding: '0 4px', borderRadius: 2 }}>
          {tag}
        </span>
      )
    )
    lastIndex = start + match[0].length
  }
  if (lastIndex < body.length) out.push(body.slice(lastIndex))
  return out
}

/**
 * Hilo de comentarios embebido al final de cada item de Content.
 * Carga lazy: solo pide los comentarios cuando se hace clic en "Mostrar".
 * Esto evita N queries cuando un perfil tiene 30 historias.
 */
export function CommentsThread({ contentId, familySlug, placeholder = 'Escribe un comentario...' }: CommentsThreadProps) {
  const [items, setItems] = useState<CommentItem[] | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [count, setCount] = useState<number | null>(null)
  const [members, setMembers] = useState<MentionedUser[]>([])

  // Cargar la lista de miembros la primera vez que se expande, para
  // autocompletado de @menciones. Lazy: no cargarlo hasta que se necesite.
  useEffect(() => {
    if (!expanded || members.length > 0) return
    listFamilyMembersForMention().then(r => {
      if (r.ok) setMembers(r.data)
    })
  }, [expanded, members.length])

  // Sugerencias de @ basadas en la palabra que está escribiendo después del último @
  const mentionSuggestions = useMemo(() => {
    const lastAtIdx = draft.lastIndexOf('@')
    if (lastAtIdx === -1) return null
    const after = draft.slice(lastAtIdx + 1)
    // Si ya escribió un espacio o un salto de línea, no es un mention activo
    if (/\s/.test(after)) return null
    const query = after.toLowerCase()
    const matches = members
      .filter(m =>
        m.username.toLowerCase().startsWith(query) ||
        m.name.toLowerCase().startsWith(query) ||
        (m.name.split(/\s+/)[0]?.toLowerCase() ?? '').startsWith(query)
      )
      .slice(0, 5)
    return matches.length > 0 ? { query, matches, atIndex: lastAtIdx } : null
  }, [draft, members])

  function applyMention(member: MentionedUser, atIndex: number) {
    // Reemplaza desde el último @ hasta el final del draft con @firstName
    const firstName = member.name.split(/\s+/)[0] || member.username
    setDraft(draft.slice(0, atIndex) + `@${firstName} `)
  }

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
                  <p id={`comment-${c.id}`} style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#2C2C2C',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {renderBodyWithMentions(c.body, c.mentions, familySlug)}
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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={placeholder + ' (usa @ para mencionar a alguien)'}
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
            {mentionSuggestions && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#FFFDF9', border: '1px solid #C8D4CE', borderRadius: 2, zIndex: 10, marginTop: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                {mentionSuggestions.matches.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => applyMention(m, mentionSuggestions.atIndex)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12, color: '#2D4A3E', borderBottom: '1px solid #F0EDE5' }}
                  >
                    <strong>@{m.name.split(/\s+/)[0]}</strong> <span style={{ color: '#8B9E94' }}>{m.name}</span>
                  </button>
                ))}
              </div>
            )}
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
