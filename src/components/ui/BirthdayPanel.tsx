'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getMonthBirthdays, getOnThisDayEvents, type MonthBirthday, type OnThisDayEvent } from '@/app/actions/people'

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

interface BirthdayPanelProps {
  familySlug:    string
  /** Si true, se muestra siempre abierto (ej. embebido). Por defecto es popover. */
  alwaysOpen?:   boolean
}

/**
 * Pequeño botón flotante en el header del árbol que muestra los cumpleaños
 * del mes actual. Click → popover con la lista. Si hay un cumple HOY,
 * el botón muestra un dot rojo.
 *
 * Excluye fallecidos por defecto pero ofrece toggle "ver todos" para honrar
 * a quienes ya no están.
 */
export function BirthdayPanel({ familySlug, alwaysOpen = false }: BirthdayPanelProps) {
  const [open, setOpen] = useState(alwaysOpen)
  const [birthdays, setBirthdays] = useState<MonthBirthday[] | null>(null)
  const [events, setEvents] = useState<OnThisDayEvent[] | null>(null)
  const [showDeceased, setShowDeceased] = useState(false)
  const [loading, setLoading] = useState(false)

  // Carga la primera vez que se abre (o de inmediato si alwaysOpen)
  useEffect(() => {
    if (!open || birthdays !== null) return
    setLoading(true)
    Promise.all([getMonthBirthdays(), getOnThisDayEvents()])
      .then(([b, e]) => {
        if (b.ok) setBirthdays(b.data)
        if (e.ok) setEvents(e.data)
      })
      .finally(() => setLoading(false))
  }, [open, birthdays])

  // Cargar al inicio para saber si hay alguien hoy y mostrar el dot
  useEffect(() => {
    if (birthdays !== null) return
    getMonthBirthdays().then(r => {
      if (r.ok) setBirthdays(r.data)
    })
    // También pre-cargamos eventos de "hace X años" — son query liviana
    getOnThisDayEvents().then(r => {
      if (r.ok) setEvents(r.data)
    })
  }, [birthdays])

  const monthName = MONTHS[new Date().getMonth()]
  const filtered = birthdays?.filter(b => showDeceased || !b.deceased) ?? []
  const hasToday = birthdays?.some(b => b.isToday && !b.deceased) ?? false
  const hasEventsToday = (events?.length ?? 0) > 0

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={`Cumpleaños de ${monthName}`}
        style={{
          border: '1px solid #C8D4CE',
          color: '#2D4A3E',
          padding: '9px 12px',
          borderRadius: 2,
          fontSize: 12,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          background: '#FFFDF9',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        🎂 {monthName}
        {(hasToday || hasEventsToday) && (
          <span style={{
            position: 'absolute',
            top: 4, right: 4,
            width: 8, height: 8,
            borderRadius: '50%',
            background: '#C0392B',
          }} />
        )}
      </button>

      {open && (
        <>
          {/* Backdrop para cerrar al click fuera */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'transparent',
              zIndex: 40,
            }}
          />
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 320,
            maxHeight: 480,
            overflowY: 'auto',
            background: '#FFFDF9',
            border: '1px solid #C8D4CE',
            borderRadius: 3,
            boxShadow: '0 4px 16px rgba(44,44,44,0.12)',
            zIndex: 50,
            padding: 14,
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}>
              <p style={{
                fontFamily: 'Georgia, serif',
                fontSize: 15,
                color: '#2D4A3E',
                margin: 0,
                textTransform: 'capitalize',
              }}>
                Cumpleaños · {monthName}
              </p>
              <label style={{
                fontSize: 11,
                color: '#6B7B70',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={showDeceased}
                  onChange={e => setShowDeceased(e.target.checked)}
                  style={{ accentColor: '#2D4A3E' }}
                />
                fallecidos
              </label>
            </div>

            {loading && (
              <p style={{ fontSize: 12, color: '#8B9E94', textAlign: 'center', padding: '20px 0' }}>
                Cargando...
              </p>
            )}

            {/* "Hace X años" — eventos de hoy en años anteriores */}
            {!loading && events && events.length > 0 && (
              <div style={{
                marginBottom: 14,
                padding: '10px 12px',
                background: '#FFF8E6',
                border: '1px solid #E8D68A',
                borderRadius: 3,
              }}>
                <p style={{
                  margin: '0 0 8px',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#8B6411',
                  fontWeight: 600,
                }}>
                  📅 Hace tiempo · hoy
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 5 }}>
                  {events.slice(0, 5).map((ev, i) => (
                    <li key={`${ev.kind}-${ev.personId}-${i}`}>
                      <Link
                        href={`/${familySlug}/person/${ev.personId}`}
                        onClick={() => setOpen(false)}
                        style={{
                          display: 'block',
                          padding: '4px 6px',
                          fontSize: 12,
                          color: '#2C2C2C',
                          textDecoration: 'none',
                          lineHeight: 1.4,
                          borderRadius: 2,
                        }}
                      >
                        <span style={{ color: '#8B6411', fontWeight: 600 }}>
                          Hace {ev.yearsAgo} año{ev.yearsAgo === 1 ? '' : 's'}
                        </span>
                        {' '}
                        {ev.kind === 'BIRTH' ? 'nació' : 'falleció'}{' '}
                        <span style={{ fontWeight: 500 }}>{ev.fullName}</span>
                        {ev.isPet && <span style={{ marginLeft: 4, fontSize: 10 }}>🐾</span>}
                        {ev.ageToday != null && (
                          <span style={{ color: '#8B9E94', fontSize: 11 }}>
                            {' '}· hoy cumpliría {ev.ageToday}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!loading && filtered.length === 0 && (!events || events.length === 0) && (
              <p style={{
                fontSize: 13,
                color: '#8B9E94',
                textAlign: 'center',
                padding: '24px 0',
                lineHeight: 1.5,
              }}>
                {birthdays?.length === 0
                  ? `Nadie cumple años en ${monthName}.`
                  : 'No hay cumpleaños activos este mes.'}
              </p>
            )}

            {!loading && filtered.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                {filtered.map(b => (
                  <li key={b.id}>
                    <Link
                      href={`/${familySlug}/person/${b.id}`}
                      onClick={() => setOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 10px',
                        borderRadius: 3,
                        textDecoration: 'none',
                        color: '#2C2C2C',
                        background: b.isToday ? '#FFF3D6' : (b.isPast ? '#F0EDE5' : '#FAF7F0'),
                        border: b.isToday ? '1px solid #E8C36B' : '1px solid #E0DAD0',
                        opacity: b.deceased ? 0.6 : 1,
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{
                        width: 36,
                        textAlign: 'center',
                        fontFamily: 'Georgia, serif',
                        fontSize: 18,
                        color: b.isToday ? '#8B6411' : '#2D4A3E',
                        fontWeight: b.isToday ? 700 : 400,
                        lineHeight: 1,
                      }}>
                        {b.day}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {b.fullName}
                          {b.isPet && <span style={{ fontSize: 11, marginLeft: 4 }}>🐾</span>}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: '#8B9E94',
                          marginTop: 1,
                        }}>
                          {b.deceased
                            ? (b.birthYear ? `n. ${b.birthYear} · falleció` : 'falleció')
                            : (b.isToday
                              ? (b.age != null ? `¡Hoy cumple ${b.age}!` : '¡Hoy!')
                              : (b.age != null ? `cumple ${b.age}` : ''))}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
