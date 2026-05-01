'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { getPersonProfile } from '@/app/actions/content'
import type { PersonProfile, PersonBasic } from '@/lib/content-types'
import { getPersonDisplayName } from '@/lib/person-name'

const PANEL_W = 380

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface PersonPanelProps {
  personId:   string | null
  familySlug: string
  onClose:    () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel principal
// ─────────────────────────────────────────────────────────────────────────────

export function PersonPanel({ personId, familySlug, onClose }: PersonPanelProps) {
  const [profile, setProfile]   = useState<PersonProfile | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!personId) {
      setProfile(null)
      setError(null)
      return
    }

    setError(null)
    startTransition(async () => {
      const res = await getPersonProfile(personId)
      if (res.ok) {
        setProfile(res.data)
        return
      }

      setProfile(null)
      setError(res.error)
    })
  }, [personId])

  const isOpen = !!personId
  const visibleProfile = isOpen ? profile : null
  const visibleError = isOpen ? error : null

  return (
    <>
      {/* Backdrop semitransparente — cierra el panel al hacer clic */}
      <div
        onClick={onClose}
        style={{
          position:      'fixed',
          inset:         0,
          zIndex:        40,
          background:    'transparent',
          opacity:       isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition:    'opacity 0.2s ease',
        }}
      />

      {/* Panel lateral */}
      <aside
        aria-label="Perfil de persona"
        style={{
          position:   'fixed',
          top:        0,
          right:      0,
          height:     '100dvh',
          width:      PANEL_W,
          background: '#FAFAF7',
          borderLeft: '1px solid #DDE4DF',
          boxShadow:  '-6px 0 32px rgba(0,0,0,0.10)',
          zIndex:     50,
          transform:  isOpen ? 'translateX(0)' : `translateX(${PANEL_W}px)`,
          transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)',
          display:    'flex',
          flexDirection: 'column',
          overflow:   'hidden',
        }}
      >
        {/* Botón cerrar */}
        <button
          onClick={onClose}
          aria-label="Cerrar panel"
          style={{
            position:       'absolute',
            top:            14,
            right:          14,
            width:          28,
            height:         28,
            borderRadius:   '50%',
            border:         '1.5px solid #C8D0CA',
            background:     'transparent',
            cursor:         'pointer',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            color:          '#6B7B70',
            fontSize:       13,
            zIndex:         1,
            transition:     'border-color 0.2s, color 0.2s',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#2D4A3E'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#2D4A3E'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#C8D0CA'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#6B7B70'
          }}
        >
          ✕
        </button>

        {/* Contenido scrolleable */}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '32px 24px 24px' }}>
          {isPending && !visibleProfile && <PanelSkeleton />}
          {!isPending && visibleError   && <PanelError message={visibleError} />}
          {visibleProfile               && (
            <PanelContent
              profile={visibleProfile}
              familySlug={familySlug}
            />
          )}
        </div>
        {visibleProfile && (
          <div
            style={{
              borderTop: '1px solid #E1DCD3',
              background: 'rgba(250, 250, 247, 0.96)',
              backdropFilter: 'blur(10px)',
              padding: '14px 24px 18px',
              display: 'grid',
              gap: 10,
            }}
          >
            <Link
              href={`/${familySlug}/person/${visibleProfile.id}`}
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '11px 0',
                background: '#2D4A3E',
                color: '#fff',
                fontFamily: 'Georgia, serif',
                fontSize: 13,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                borderRadius: 2,
              }}
            >
              Ver perfil completo
            </Link>

            {visibleProfile.canManage && (
              <Link
                href={`/${familySlug}/person/${visibleProfile.id}/edit`}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '10px 0',
                  background: '#F5F0E8',
                  color: '#2D4A3E',
                  fontFamily: 'Georgia, serif',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                  borderRadius: 2,
                  border: '1px solid #D8D3CA',
                }}
              >
                Editar persona
              </Link>
            )}
          </div>
        )}
      </aside>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Contenido del panel
// ─────────────────────────────────────────────────────────────────────────────

function PanelContent({ profile, familySlug }: { profile: PersonProfile; familySlug: string }) {
  const birthYear = profile.birthDate ? new Date(profile.birthDate).getFullYear() : null
  const deathYear = profile.deathDate ? new Date(profile.deathDate).getFullYear() : null
  const fullName  = getPersonDisplayName(profile)
  const initials  = (profile.firstName[0] ?? '') + (profile.lastName[0] ?? '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Avatar + nombre + fechas ─────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 8 }}>

        {/* Foto o círculo de iniciales */}
        {profile.coverPhoto ? (
          <img
            src={profile.coverPhoto}
            alt={fullName}
            style={{
              width: 84, height: 84,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2.5px solid #B5C4BC',
              marginBottom: 14,
            }}
          />
        ) : (
          <div style={{
            width: 84, height: 84,
            borderRadius: '50%',
            background: '#2D4A3E',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14,
            border: '2.5px solid #2D4A3E',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 22, fontFamily: 'Georgia, serif', fontWeight: 600, color: '#fff', letterSpacing: '0.04em' }}>
              {initials.toUpperCase()}
            </span>
          </div>
        )}

        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 600, color: '#2C2C2C', margin: 0, lineHeight: 1.3 }}>
          {fullName}
        </h2>

        {(birthYear || profile.birthPlace) && (
          <p style={{ fontSize: 12, color: '#6B6B6B', margin: '5px 0 0', lineHeight: 1.5 }}>
            {birthYear && (
              <span>{birthYear}{deathYear ? ` – ${deathYear}` : ''}</span>
            )}
            {birthYear && profile.birthPlace && <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>}
            {profile.birthPlace && <span>{profile.birthPlace}</span>}
          </p>
        )}
      </div>

      {/* ── Familia directa ──────────────────────────────────────────────── */}
      <FamilySection profile={profile} />

      {/* ── Fotos destacadas 3×3 ─────────────────────────────────────────── */}
      <FeaturedGrid media={profile.featuredMedia} />

      {/* ── Bio ──────────────────────────────────────────────────────────── */}
      {profile.bio && (
        <section>
          <SectionLabel>Sobre {profile.firstName}</SectionLabel>
          <p style={{ fontSize: 13, color: '#4a4a4a', lineHeight: 1.65, margin: 0,
            display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {profile.bio}
          </p>
        </section>
      )}

      {/* ── Contadores de archivo ─────────────────────────────────────────── */}
      <ArchiveCounts counts={profile.counts} />

      {/* ── Botón perfil completo ─────────────────────────────────────────── */}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Familia directa
// ─────────────────────────────────────────────────────────────────────────────

function FamilySection({ profile }: { profile: PersonProfile }) {
  const { parents, spouses, children } = profile
  if (!parents.length && !spouses.length && !children.length) return null

  return (
    <section>
      <SectionLabel>Familia directa</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {spouses.map(p => (
          <FamilyChip key={p.id} person={p} relation="Pareja" />
        ))}
        {parents.map(p => (
          <FamilyChip key={p.id} person={p} relation="Padre/Madre" />
        ))}
        {children.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#6B7B70', letterSpacing: '0.03em' }}>Hijos</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {children.map(p => (
                <span key={p.id} style={{
                  fontSize: 11, color: '#4a5c54',
                  background: '#EAF0ED', border: '1px solid #C8D4CE',
                  borderRadius: 2, padding: '2px 7px',
                }}>
                  {p.firstName}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function FamilyChip({ person, relation }: { person: PersonBasic; relation: string }) {
  const birthYear = person.birthDate ? new Date(person.birthDate).getFullYear() : null
  const deathYear = person.deathDate ? new Date(person.deathDate).getFullYear() : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      {/* Mini avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: '#EAF0ED', border: '1.5px solid #B5C4BC',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 10, fontFamily: 'Georgia, serif', color: '#2D4A3E', fontWeight: 600 }}>
          {(person.firstName[0] ?? '').toUpperCase()}{(person.lastName[0] ?? '').toUpperCase()}
        </span>
      </div>
      {/* Nombre y relación */}
      <div>
        <span style={{ fontSize: 12, color: '#2C2C2C' }}>{getPersonDisplayName(person)}</span>
        <span style={{ fontSize: 10, color: '#8B9E94', marginLeft: 6 }}>
          {relation}{birthYear ? ` · ${birthYear}${deathYear ? `–${deathYear}` : ''}` : ''}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid 3×3 de fotos destacadas
// ─────────────────────────────────────────────────────────────────────────────

function FeaturedGrid({ media }: { media: PersonProfile['featuredMedia'] }) {
  // Siempre mostrar 9 celdas — las vacías son placeholders
  const cells = Array.from({ length: 9 }, (_, i) => media[i] ?? null)

  return (
    <section>
      <SectionLabel>Fotos destacadas</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {cells.map((item, i) =>
          item ? (
            <img
              key={item.id}
              src={item.url}
              alt={item.alt ?? ''}
              style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 2, display: 'block' }}
            />
          ) : (
            <div
              key={i}
              style={{
                aspectRatio:  '1',
                borderRadius: 2,
                background:   '#EEE9E0',
                border:       '1.5px dashed #C8C0B4',
              }}
            />
          )
        )}
      </div>
      {media.length === 0 && (
        <p style={{ fontSize: 11, color: '#9BA89F', marginTop: 6, textAlign: 'center' }}>
          Sin fotos aún
        </p>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Contadores del archivo
// ─────────────────────────────────────────────────────────────────────────────

const COUNTER_ITEMS: { key: keyof PersonProfile['counts']; label: string; symbol: string }[] = [
  { key: 'stories',        label: 'Historias',             symbol: '◈' },
  { key: 'recipes',        label: 'Recetas',               symbol: '◉' },
  { key: 'diary',          label: 'Diario',                symbol: '◎' },
  { key: 'interviews',     label: 'Entrevistas',           symbol: '◌' },
  { key: 'objects',        label: 'Objetos',               symbol: '◇' },
  { key: 'importantLinks', label: 'Relaciones importantes', symbol: '◆' },
]

function ArchiveCounts({ counts }: { counts: PersonProfile['counts'] }) {
  const hasAny = COUNTER_ITEMS.some(({ key }) => counts[key] > 0)

  return (
    <section>
      <SectionLabel>Archivo</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {COUNTER_ITEMS.map(({ key, label, symbol }) => {
          const count   = counts[key]
          const isEmpty = count === 0
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: isEmpty ? '#C4CBC6' : '#2D4A3E', width: 12, flexShrink: 0 }}>
                {symbol}
              </span>
              <span style={{ fontSize: 12, color: isEmpty ? '#B0BAB4' : '#3a3a3a', flex: 1 }}>
                {label}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600,
                color:      isEmpty ? '#C4CBC6' : '#2D4A3E',
                minWidth:   18, textAlign: 'right',
              }}>
                {count}
              </span>
            </div>
          )
        })}
        {!hasAny && (
          <p style={{ fontSize: 11, color: '#9BA89F', marginTop: 2 }}>
            Sin contenido registrado aún.
          </p>
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componentes utilitarios
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize:      10,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color:         '#8B9E94',
      fontFamily:    'Georgia, serif',
      margin:        '0 0 10px',
    }}>
      {children}
    </p>
  )
}

function PanelSkeleton() {
  const bar = (w: string, h = 10) => (
    <div style={{ height: h, borderRadius: 2, background: '#E4E0D8', width: w, marginBottom: 8 }} />
  )
  return (
    <div style={{ paddingTop: 8, animation: 'pulse 1.4s ease-in-out infinite' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#E4E0D8', marginBottom: 12 }} />
        {bar('60%', 16)}
        {bar('40%', 10)}
      </div>
      {bar('100%', 10)}
      {bar('80%', 10)}
      {bar('90%', 10)}
    </div>
  )
}

function PanelError({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: 40 }}>
      <p style={{ fontSize: 13, color: '#9B4444', fontFamily: 'Georgia, serif' }}>
        {message}
      </p>
    </div>
  )
}
