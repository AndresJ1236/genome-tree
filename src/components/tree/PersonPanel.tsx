'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { getPersonProfile } from '@/app/actions/content'
import type { PersonProfile, PersonBasic } from '@/lib/content-types'
import { pickMediaUrl } from '@/lib/content-types'
import { getPersonDisplayName } from '@/lib/person-name'
import { KinshipBadge } from '@/components/ui/KinshipBadge'

const PANEL_W = 380
const MOBILE_BREAKPOINT = 640

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
  const [bioExpanded, setBioExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    setIsMobile(mq.matches)
    const fn = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    if (!personId) {
      setProfile(null)
      setError(null)
      return
    }

    setError(null)
    setBioExpanded(false)
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
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:      'fixed',
          inset:         0,
          zIndex:        40,
          background:    isMobile ? 'rgba(0,0,0,0.45)' : 'transparent',
          opacity:       isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition:    'opacity 0.25s ease',
        }}
      />

      {/* Panel — bottom sheet en mobile, lateral en desktop */}
      <aside
        aria-label="Perfil de persona"
        style={isMobile ? {
          position:      'fixed',
          bottom:        0,
          left:          0,
          right:         0,
          height:        '78dvh',
          background:    '#FAFAF7',
          borderRadius:  '12px 12px 0 0',
          boxShadow:     '0 -8px 40px rgba(0,0,0,0.18)',
          zIndex:        50,
          transform:     isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition:    'transform 0.32s cubic-bezier(0.4,0,0.2,1)',
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
        } : {
          position:      'fixed',
          top:           0,
          right:         0,
          height:        '100dvh',
          width:         PANEL_W,
          background:    '#FAFAF7',
          borderLeft:    '1px solid #DDE4DF',
          boxShadow:     '-6px 0 32px rgba(0,0,0,0.10)',
          zIndex:        50,
          transform:     isOpen ? 'translateX(0)' : `translateX(${PANEL_W}px)`,
          transition:    'transform 0.30s cubic-bezier(0.4,0,0.2,1)',
          display:       'flex',
          flexDirection: 'column',
          overflow:      'hidden',
        }}
      >
        {/* Drag handle (mobile) / botón cerrar (desktop) */}
        {isMobile ? (
          <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#C8D0CA' }} />
          </div>
        ) : (
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
        )}

        {/* Contenido scrolleable */}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: isMobile ? '8px 20px 8px' : '32px 24px 24px' }}>
          {isPending && !visibleProfile && <PanelSkeleton />}
          {!isPending && visibleError   && <PanelError message={visibleError} />}
          {visibleProfile               && (
            <PanelContent
              profile={visibleProfile}
              familySlug={familySlug}
              bioExpanded={bioExpanded}
              onToggleBio={() => setBioExpanded(v => !v)}
            />
          )}
        </div>
        {visibleProfile && (
          <div
            style={{
              borderTop:      '1px solid #E1DCD3',
              background:     'rgba(250, 250, 247, 0.96)',
              backdropFilter: 'blur(10px)',
              padding:        `14px 24px calc(18px + env(safe-area-inset-bottom, 0px))`,
              display:        'grid',
              gap:            10,
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
                style={secondaryLinkStyle}
              >
                Editar datos
              </Link>
            )}
          </div>
        )}
      </aside>
    </>
  )
}

const secondaryLinkStyle: React.CSSProperties = {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Contenido del panel
// ─────────────────────────────────────────────────────────────────────────────

function PanelContent({ profile, familySlug, bioExpanded, onToggleBio }: {
  profile: PersonProfile
  familySlug: string
  bioExpanded: boolean
  onToggleBio: () => void
}) {
  const birthYear = profile.birthDate ? new Date(profile.birthDate).getFullYear() : null
  const deathYear = profile.deathDate ? new Date(profile.deathDate).getFullYear() : null
  const fullName  = getPersonDisplayName(profile)
  const isPet     = profile.nodeKind === 'PET'
  const initials  = ((profile.firstName[0] ?? '') + (profile.lastName[0] ?? '')).toUpperCase() || '?'

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
            <span style={{ fontSize: isPet ? 18 : 22, fontFamily: 'Georgia, serif', fontWeight: 600, color: '#fff', letterSpacing: '0.04em' }}>
              {isPet ? '◉' : initials}
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

        <div style={{ marginTop: 8 }}>
          <KinshipBadge personId={profile.id} />
        </div>
      </div>

      {/* ── Familia directa ──────────────────────────────────────────────── */}
      <FamilySection profile={profile} />

      {/* ── Fotos destacadas ─────────────────────────────────────────────── */}
      <FeaturedGrid media={profile.featuredMedia} isPet={isPet} />

      {/* ── Bio ──────────────────────────────────────────────────────────── */}
      {profile.bio && (
        <section>
          <SectionLabel>{isPet ? 'Historia' : `Sobre ${profile.firstName}`}</SectionLabel>
          <p style={{
            fontSize: 14, color: '#4a4a4a', lineHeight: 1.7, margin: 0,
            ...(bioExpanded ? {} : {
              display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }),
          }}>
            {profile.bio}
          </p>
          {profile.bio.length > 180 && (
            <button
              onClick={onToggleBio}
              style={{ marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#2D4A3E', padding: 0, letterSpacing: '0.04em' }}
            >
              {bioExpanded ? 'Ver menos ↑' : 'Ver más ↓'}
            </button>
          )}
        </section>
      )}

      {/* ── Contadores de archivo ─────────────────────────────────────────── */}
      <ArchiveCounts counts={profile.counts} isPet={isPet} />

      {/* ── Botón perfil completo ─────────────────────────────────────────── */}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Familia directa
// ─────────────────────────────────────────────────────────────────────────────

function parentLabel(p: PersonBasic): string {
  if (p.gender === 'MALE')   return 'Padre'
  if (p.gender === 'FEMALE') return 'Madre'
  return 'Padre/Madre'
}

function spouseLabel(p: PersonBasic): string {
  if (p.gender === 'MALE')   return 'Esposo'
  if (p.gender === 'FEMALE') return 'Esposa'
  return 'Pareja'
}

function childLabel(p: PersonBasic): string {
  if (p.gender === 'MALE')   return 'Hijo'
  if (p.gender === 'FEMALE') return 'Hija'
  return 'Hijo/a'
}

function ownerLabel(p: PersonBasic): string {
  if (p.gender === 'MALE')   return 'Dueño'
  if (p.gender === 'FEMALE') return 'Dueña'
  return 'Dueño/a'
}

function FamilySection({ profile }: { profile: PersonProfile }) {
  const { parents, spouses, children } = profile
  const isPet = profile.nodeKind === 'PET'
  if (!parents.length && !spouses.length && !children.length) return null

  return (
    <section>
      <SectionLabel>{isPet ? 'Dueños y convivientes' : 'Familia directa'}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {spouses.map(p => (
          <FamilyChip key={p.id} person={p} relation={isPet ? ownerLabel(p) : spouseLabel(p)} />
        ))}
        {parents.map(p => (
          <FamilyChip key={p.id} person={p} relation={isPet ? ownerLabel(p) : parentLabel(p)} />
        ))}
        {!isPet && children.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#6B7B70', letterSpacing: '0.03em', paddingTop: 3, flexShrink: 0 }}>Hijos</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {children.map(p => (
                <span key={p.id} title={childLabel(p)} style={{
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
        {isPet && children.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#6B7B70', letterSpacing: '0.03em', paddingTop: 3, flexShrink: 0 }}>Convive con</span>
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
        <span style={{ fontSize: 13, color: '#2C2C2C' }}>{getPersonDisplayName(person)}</span>
        <span style={{ fontSize: 12, color: '#8B9E94', marginLeft: 6 }}>
          {relation}{birthYear ? ` · ${birthYear}${deathYear ? `–${deathYear}` : ''}` : ''}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid 3×3 de fotos destacadas
// ─────────────────────────────────────────────────────────────────────────────

function FeaturedGrid({ media, isPet }: { media: PersonProfile['featuredMedia']; isPet: boolean }) {
  if (media.length === 0) {
    return (
      <section>
        <SectionLabel>Fotos destacadas</SectionLabel>
        <p style={{ fontSize: 11, color: '#9BA89F', margin: 0, textAlign: 'center', padding: '8px 0' }}>
          Sin fotos aún
        </p>
      </section>
    )
  }

  // Mascotas: mostrar solo las fotos reales, sin placeholders
  // Personas: rellenar hasta 9 celdas con placeholders
  const cells = isPet
    ? media.slice(0, 9)
    : Array.from({ length: 9 }, (_, i) => media[i] ?? null)

  return (
    <section>
      <SectionLabel>Fotos destacadas</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {cells.map((item, i) =>
          item ? (
            <img
              key={item.id}
              src={pickMediaUrl(item, 'medium')}
              alt={item.alt ?? ''}
              style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 2, display: 'block' }}
            />
          ) : (
            <div
              key={i}
              style={{ aspectRatio: '1', borderRadius: 2, background: '#EEE9E0', border: '1.5px dashed #C8C0B4' }}
            />
          )
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Contadores del archivo
// ─────────────────────────────────────────────────────────────────────────────

const COUNTER_ITEMS: { key: keyof PersonProfile['counts']; label: string; symbol: string; petOnly?: false }[] = [
  { key: 'stories',        label: 'Historias',              symbol: '◈' },
  { key: 'recipes',        label: 'Recetas',                symbol: '◉' },
  { key: 'diary',          label: 'Diario',                 symbol: '◎' },
  { key: 'interviews',     label: 'Entrevistas',            symbol: '◌' },
  { key: 'objects',        label: 'Objetos',                symbol: '◇' },
  { key: 'importantLinks', label: 'Relaciones importantes', symbol: '◆' },
]

const PET_COUNTER_KEYS = new Set<keyof PersonProfile['counts']>(['stories', 'objects'])

function ArchiveCounts({ counts, isPet }: { counts: PersonProfile['counts']; isPet: boolean }) {
  const items  = isPet ? COUNTER_ITEMS.filter(i => PET_COUNTER_KEYS.has(i.key)) : COUNTER_ITEMS
  const hasAny = items.some(({ key }) => counts[key] > 0)

  return (
    <section>
      <SectionLabel>Archivo</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map(({ key, label, symbol }) => {
          const count   = counts[key]
          const isEmpty = count === 0
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: isEmpty ? '#C4CBC6' : '#2D4A3E', flex: 1 }}>
                {label}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 600,
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
      fontSize:      12,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color:         '#6B7B70',
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
