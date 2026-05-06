'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SEARCH_MIN_QUERY_LENGTH } from '@/lib/search-utils'
import type { SearchResultItem, SearchResultsData } from '@/lib/content-types'

interface TreeSearchProps {
  enabled: boolean
  onSelectPerson: (personId: string) => void
}

export function TreeSearch({ enabled, onSelectPerson }: TreeSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setResults(null)
      setError(null)
      setLoading(false)
      return
    }

    const trimmed = query.trim()
    if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
      setResults(null)
      setError(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          method: 'GET',
          signal: controller.signal,
          credentials: 'same-origin',
        })
        const payload = await response.json()
        if (!payload.ok) {
          setResults(null)
          setError(payload.error ?? 'No se pudo completar la busqueda.')
          return
        }
        setResults(payload.data as SearchResultsData)
        setOpen(true)
      } catch (fetchError) {
        if ((fetchError as Error).name === 'AbortError') return
        setResults(null)
        setError('No se pudo completar la busqueda.')
      } finally {
        setLoading(false)
      }
    }, 220)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [enabled, query])

  const groupedResults = useMemo(
    () => [
      { label: 'Personas', items: results?.people ?? [] },
      { label: 'Contenido', items: results?.content ?? [] },
      { label: 'Relaciones', items: results?.links ?? [] },
    ],
    [results]
  )

  const hasAnyResults = groupedResults.some(group => group.items.length > 0)

  function handlePersonSelect(item: SearchResultItem) {
    onSelectPerson(item.personId)
    setOpen(false)
    setQuery(item.title)
  }

  return (
    <div
      ref={rootRef}
      onPointerDown={event => event.stopPropagation()}
      style={{
        position: 'absolute',
        top: 20,
        left: 24,
        zIndex: 25,
        width: 'min(360px, calc(100vw - 48px))',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: '#FFFCF8',
          border: '1px solid #D8D3CA',
          borderRadius: 3,
          padding: '10px 12px',
          boxShadow: '0 8px 28px rgba(34, 41, 37, 0.08)',
        }}
      >
        <span style={{ fontSize: 12, color: '#6B7B70' }}>Buscar</span>
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={event => setQuery(event.target.value)}
          placeholder={enabled ? 'Personas, historias, relaciones...' : 'Activa la búsqueda en Administración'}
          disabled={!enabled}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: '#2C2C2C',
            fontSize: 13,
          }}
        />
        {loading && <span style={{ fontSize: 11, color: '#8B9E94' }}>Buscando…</span>}
      </div>

      {enabled && open && (query.trim().length >= SEARCH_MIN_QUERY_LENGTH || error) && (
        <div
          style={{
            marginTop: 8,
            background: '#FFFDF9',
            border: '1px solid #E3DDD3',
            borderRadius: 3,
            boxShadow: '0 18px 40px rgba(34, 41, 37, 0.12)',
            overflow: 'hidden',
          }}
        >
          {error && (
            <div style={{ padding: '12px 14px', fontSize: 12, color: '#8B4444', background: '#FFF4F4' }}>
              {error}
            </div>
          )}

          {!error && !loading && !hasAnyResults && (
            <div style={{ padding: '14px 16px', fontSize: 12, color: '#8B9E94' }}>
              No hubo resultados para “{query.trim()}”.
            </div>
          )}

          {!error && groupedResults.map(group => (
            group.items.length > 0 ? (
              <div key={group.label} style={{ borderTop: '1px solid #F0EBE2' }}>
                <div
                  style={{
                    padding: '10px 14px 6px',
                    fontSize: 10,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#8B9E94',
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {group.label}
                </div>
                <div style={{ display: 'grid' }}>
                  {group.items.map(item => (
                    item.kind === 'PERSON' ? (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handlePersonSelect(item)}
                        style={resultButtonStyle}
                      >
                        <ResultBody item={item} />
                      </button>
                    ) : (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        style={{ ...resultButtonStyle, textDecoration: 'none' }}
                      >
                        <ResultBody item={item} />
                      </Link>
                    )
                  ))}
                </div>
              </div>
            ) : null
          ))}
        </div>
      )}
    </div>
  )
}

function ResultBody({ item }: { item: SearchResultItem }) {
  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ fontSize: 13, color: '#2C2C2C', marginBottom: 2 }}>{item.title}</div>
      <div style={{ fontSize: 11, color: '#8B9E94', marginBottom: item.snippet ? 4 : 0 }}>{item.subtitle}</div>
      {item.snippet && (
        <div style={{ fontSize: 12, color: '#5B5B5B', lineHeight: 1.45 }}>
          {item.snippet}
        </div>
      )}
    </div>
  )
}

const resultButtonStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  border: 'none',
  background: 'transparent',
  padding: '10px 14px 12px',
  cursor: 'pointer',
  borderTop: '1px solid #F6F1E8',
}
