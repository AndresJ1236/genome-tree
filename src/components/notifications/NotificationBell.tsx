'use client'

import { useEffect, useRef, useState } from 'react'
import { getMyNotifications, markAllNotificationsRead } from '@/app/actions/notifications'
import type { NotificationItem } from '@/lib/content-types'

function formatDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const time = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

  const todayStr = now.toDateString()
  const yesterdayStr = new Date(now.getTime() - 86_400_000).toDateString()

  if (date.toDateString() === todayStr) return `Hoy · ${time}`
  if (date.toDateString() === yesterdayStr) return `Ayer · ${time}`

  const day = date.toLocaleDateString('es', { day: 'numeric', month: 'short' })
  return `${day} · ${time}`
}

const TYPE_ICON: Record<string, string> = {
  PROPOSAL_SUBMITTED: '📋',
  PROPOSAL_APPROVED:  '✅',
  PROPOSAL_REJECTED:  '❌',
  NEW_PERSON_ADDED:   '👤',
  NEW_CONTENT_ADDED:  '📄',
}

export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleOpen() {
    if (open) { setOpen(false); return }
    setOpen(true)
    setLoading(true)
    const result = await getMyNotifications()
    if (result.ok) setItems(result.data)
    setLoading(false)
    if (unreadCount > 0) {
      setUnreadCount(0)
      void markAllNotificationsRead()
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 6px',
          borderRadius: 6,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          color: '#6B6B6B',
          fontSize: 18,
          lineHeight: 1,
        }}
        aria-label="Notificaciones"
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: '#C0392B',
            color: '#fff',
            borderRadius: '999px',
            fontSize: 9,
            fontWeight: 700,
            minWidth: 14,
            height: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 8px)',
          width: 320,
          background: '#fff',
          border: '1px solid #D8D3CA',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
          zIndex: 100,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid #EDE9E0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#2D4A3E', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Notificaciones
            </span>
          </div>

          {loading && (
            <div style={{ padding: '20px 14px', textAlign: 'center', color: '#9B9B9B', fontSize: 13 }}>
              Cargando…
            </div>
          )}

          {!loading && items !== null && items.length === 0 && (
            <div style={{ padding: '20px 14px', textAlign: 'center', color: '#9B9B9B', fontSize: 13 }}>
              Sin notificaciones
            </div>
          )}

          {!loading && items !== null && items.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {items.map((n, i) => {
                const inner = (
                  <div style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 16, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>
                      {TYPE_ICON[n.type] ?? '🔔'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: n.read ? 400 : 600,
                        color: '#2D2D2D',
                        lineHeight: 1.35,
                        marginBottom: n.body ? 2 : 0,
                      }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div style={{
                          fontSize: 12,
                          color: '#6B6B6B',
                          lineHeight: 1.3,
                          marginBottom: 4,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {n.body}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: '#9B9B9B' }}>
                        {formatDate(n.createdAt)}
                      </div>
                    </div>
                    {!n.read && (
                      <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: '#2D4A3E',
                        flexShrink: 0,
                        marginTop: 5,
                      }} />
                    )}
                  </div>
                )

                return (
                  <li key={n.id} style={{ borderBottom: i < items.length - 1 ? '1px solid #F0EDE6' : 'none' }}>
                    {n.href ? (
                      <a href={n.href} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                         onClick={() => setOpen(false)}>
                        {inner}
                      </a>
                    ) : inner}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
