'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type {
  ClaimedRelation,
  PersonFull, StoryItem, RecipeItem, DiaryItem,
  InterviewItem, ObjectItem, SourceItem, ImportantLinkItem,
  MediaItem, ConfidenceLevel,
} from '@/lib/content-types'
import { CLAIMED_RELATION_LABELS, CONFIDENCE_LABELS } from '@/lib/content-types'
import { uploadMedia, deleteMedia, toggleFeaturedMedia } from '@/app/actions/media'
import { getPersonDisplayName } from '@/lib/person-name'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'fotos' | 'historias' | 'recetas' | 'objetos' | 'diario' | 'entrevistas' | 'fuentes' | 'relaciones'

interface TabDef {
  id: Tab
  label: string
  count: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────────────────────

export function PersonPage({ person, familySlug }: { person: PersonFull; familySlug: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('fotos')
  const [lightbox, setLightbox] = useState<MediaItem | null>(null)
  const [mediaCount, setMediaCount] = useState(person.counts.media)
  const modules = person.modules

  const birthYear = person.birthDate ? new Date(person.birthDate).getFullYear() : null
  const deathYear = person.deathDate ? new Date(person.deathDate).getFullYear() : null
  const fullName  = getPersonDisplayName(person)
  const initials  = (person.firstName[0] ?? '') + (person.lastName[0] ?? '')

  const isPet = person.nodeKind === 'PET'

  const tabs: TabDef[] = useMemo(() => [
    ...(modules.moduleMedia ? [{ id: 'fotos' as const, label: 'Fotos', count: mediaCount }] : []),
    ...(modules.moduleStories ? [{ id: 'historias' as const, label: 'Historias', count: person.counts.stories }] : []),
    ...(!isPet && modules.moduleRecipes ? [{ id: 'recetas' as const, label: 'Recetas', count: person.counts.recipes }] : []),
    ...(modules.moduleObjects ? [{ id: 'objetos' as const, label: 'Objetos', count: person.counts.objects }] : []),
    ...(!isPet && modules.moduleDiary ? [
      { id: 'diario' as const, label: 'Diario', count: person.counts.diary },
      { id: 'entrevistas' as const, label: 'Entrevistas', count: person.counts.interviews },
    ] : []),
    ...(modules.moduleStories ? [{ id: 'fuentes' as const, label: 'Fuentes', count: person.counts.sources }] : []),
    ...(!isPet && modules.moduleLinks ? [{ id: 'relaciones' as const, label: 'Relaciones', count: person.counts.importantLinks }] : []),
  ], [isPet, mediaCount, modules, person.counts.diary, person.counts.importantLinks, person.counts.interviews, person.counts.objects, person.counts.recipes, person.counts.sources, person.counts.stories])

  const resolvedActiveTab = tabs.some(tab => tab.id === activeTab)
    ? activeTab
    : (tabs[0]?.id ?? 'fotos')

  return (
    <div
      style={{
        height: '100%',
        background: '#F5F0E8',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >

      {/* ── Lightbox ─────────────────────────────────────────────────────────── */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img
            src={lightbox.url}
            alt={lightbox.alt ?? ''}
            style={{ maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 3 }}
            onClick={e => e.stopPropagation()}
          />
          {lightbox.caption && (
            <p style={{
              position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
              color: '#fff', fontSize: 13, textAlign: 'center',
              background: 'rgba(0,0,0,0.5)', padding: '6px 14px', borderRadius: 2,
            }}>
              {lightbox.caption}
            </p>
          )}
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: 'absolute', top: 16, right: 20,
              background: 'transparent', border: '1.5px solid rgba(255,255,255,0.4)',
              color: '#fff', borderRadius: '50%', width: 32, height: 32,
              cursor: 'pointer', fontSize: 14,
            }}
          >✕</button>
        </div>
      )}

      {/* ── Back nav ─────────────────────────────────────────────────────────── */}
      <div style={{ background: '#EBE6DB', borderBottom: '1px solid #D8D2C7', padding: '10px 24px', flexShrink: 0 }}>
        <Link
          href={"/" + familySlug + "/tree"}
          style={{ fontSize: 12, color: '#2D4A3E', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, letterSpacing: '0.04em' }}
        >
          <span style={{ fontSize: 14 }}>&#8592;</span> Volver al árbol
        </Link>
      </div>

      {/* ── Header de persona ────────────────────────────────────────────────── */}
      <header style={{
        background: '#2D4A3E',
        color: '#fff',
        padding: '28px 32px 24px',
        display: 'flex',
        gap: 28,
        alignItems: 'flex-start',
        flexShrink: 0,
      }}>
        {/* Avatar */}
        {person.coverPhoto ? (
          <img
            src={person.coverPhoto}
            alt={fullName}
            style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.25)', flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 100, height: 100, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.12)', border: '2px solid rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 28, fontFamily: 'Georgia, serif', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
              {initials.toUpperCase()}
            </span>
          </div>
        )}

        {/* Info */}
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 600, margin: '0 0 6px', lineHeight: 1.2 }}>
            {fullName}
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: '0 0 10px' }}>
            {birthYear && (
              <span>{birthYear}{deathYear ? ' – ' + deathYear : ' –'}&nbsp;</span>
            )}
            {person.birthPlace && <span style={{ marginLeft: 4 }}>{person.birthPlace}</span>}
          </p>
          {person.bio && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', margin: 0, lineHeight: 1.6, maxWidth: 560 }}>
              {person.bio}
            </p>
          )}
          {person.canManage && (
            <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <HeaderActionLink href={`/${familySlug}/person/${person.id}/edit`} label="Editar" />
              <HeaderActionLink href={`/${familySlug}/person/new`} label="Nuevo" />
            </div>
          )}

          {/* Familia directa */}
          {(person.parents.length > 0 || person.spouses.length > 0 || person.children.length > 0) && (
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {!isPet && person.spouses.map(p => (
                <FamilyBadge key={p.id} person={p} label="Pareja" familySlug={familySlug} />
              ))}
              {person.parents.map(p => (
                <FamilyBadge key={p.id} person={p} label={isPet ? 'Dueño/a' : 'Padre/Madre'} familySlug={familySlug} />
              ))}
              {!isPet && person.children.map(p => (
                <FamilyBadge key={p.id} person={p} label="Hijo/a" familySlug={familySlug} />
              ))}
            </div>
          )}

          {/* Afiliación a unidad */}
          {!isPet && (person.unitAffiliationLabel || person.claimedRelation) && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {person.unitAffiliationLabel && (
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)',
                  letterSpacing: '0.04em',
                }}>
                  Afiliado a {person.unitAffiliationLabel}
                </span>
              )}
              {person.claimedRelation && (
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 999,
                  background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)',
                  letterSpacing: '0.04em',
                }}>
                  {CLAIMED_RELATION_LABELS[person.claimedRelation as ClaimedRelation]}
                  {person.claimedRelationOf && ` de ${getPersonDisplayName(person.claimedRelationOf)}`}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div style={{
        background: '#EBE6DB',
        borderBottom: '1px solid #D0C9BC',
        display: 'flex',
        overflowX: 'auto',
        padding: '0 16px',
        flexShrink: 0,
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '13px 16px 12px',
              background: 'transparent',
              border: 'none',
              borderBottom: resolvedActiveTab === tab.id ? '2.5px solid #2D4A3E' : '2.5px solid transparent',
              cursor: 'pointer',
              fontSize: 12,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: resolvedActiveTab === tab.id ? '#2D4A3E' : '#7A7060',
              fontFamily: 'Georgia, serif',
              whiteSpace: 'nowrap',
              fontWeight: resolvedActiveTab === tab.id ? 600 : 400,
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 10,
                background: resolvedActiveTab === tab.id ? '#2D4A3E' : '#C0BAB0',
                color: '#fff', borderRadius: 8, padding: '1px 6px',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Contenido de la tab activa ───────────────────────────────────────── */}
      <main style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ padding: '32px 24px', maxWidth: 800, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {modules.moduleMedia && resolvedActiveTab === 'fotos' && <PhotosTab media={person.allMedia} personId={person.id} onOpen={setLightbox} onCountChange={setMediaCount} />}
          {modules.moduleStories && resolvedActiveTab === 'historias' && <StoriesTab items={person.stories} familySlug={familySlug} personId={person.id} canManage={person.canManage} />}
          {modules.moduleRecipes && resolvedActiveTab === 'recetas' && <RecipesTab items={person.recipes} onOpen={setLightbox} familySlug={familySlug} personId={person.id} canManage={person.canManage} />}
          {modules.moduleObjects && resolvedActiveTab === 'objetos' && <ObjectsTab items={person.objects} onOpen={setLightbox} familySlug={familySlug} personId={person.id} canManage={person.canManage} />}
          {modules.moduleDiary && resolvedActiveTab === 'diario' && <DiaryTab items={person.diaryEntries} familySlug={familySlug} personId={person.id} canManage={person.canManage} />}
          {modules.moduleDiary && resolvedActiveTab === 'entrevistas' && <InterviewsTab items={person.interviews} familySlug={familySlug} personId={person.id} canManage={person.canManage} />}
          {modules.moduleStories && resolvedActiveTab === 'fuentes' && <SourcesTab items={person.sources} familySlug={familySlug} personId={person.id} canManage={person.canManage} />}
          {modules.moduleLinks && resolvedActiveTab === 'relaciones' && <LinksTab items={person.importantLinks} familySlug={familySlug} personId={person.id} canManage={person.canManage} />}
        </div>
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FamilyBadge
// ─────────────────────────────────────────────────────────────────────────────

function FamilyBadge({ person, label, familySlug }: { person: { id: string; firstName: string; middleName: string | null; lastName: string }; label: string; familySlug: string }) {
  return (
    <Link
      href={"/" + familySlug + "/person/" + person.id}
      style={{
        fontSize: 11, color: 'rgba(255,255,255,0.82)',
        background: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 2, padding: '3px 10px',
        textDecoration: 'none', lineHeight: 1.4,
      }}
    >
      <span style={{ opacity: 0.6, marginRight: 4 }}>{label}</span>
      {getPersonDisplayName(person)}
    </Link>
  )
}

function HeaderActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: '1px solid rgba(255,255,255,0.22)',
        color: '#fff',
        background: 'rgba(255,255,255,0.08)',
        textDecoration: 'none',
        borderRadius: 2,
        padding: '8px 10px',
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </Link>
  )
}

function SectionActionBar({
  title,
  href,
  canManage,
}: {
  title: string
  href: string
  canManage: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
      <p style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: 20, color: '#2D4A3E' }}>{title}</p>
      {canManage && (
        <Link
          href={href}
          style={{
            textDecoration: 'none',
            border: '1px solid #C8D4CE',
            color: '#2D4A3E',
            background: '#F8F5EE',
            borderRadius: 2,
            padding: '8px 10px',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Nuevo
        </Link>
      )}
    </div>
  )
}

function ItemEditLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: 'none',
        color: '#2D4A3E',
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      Editar
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: '#9BA89F' }}>
      <p style={{ fontFamily: 'Georgia, serif', fontSize: 15, margin: 0 }}>{message}</p>
    </div>
  )
}

function ContentCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E0DAD0',
      borderRadius: 3, padding: '24px 28px', marginBottom: 16,
    }}>
      {children}
    </div>
  )
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 17, color: '#2C2C2C', margin: '0 0 8px', fontWeight: 600 }}>
      {children}
    </h3>
  )
}

function CardMeta({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, color: '#9BA89F', margin: '0 0 14px', letterSpacing: '0.04em' }}>
      {children}
    </p>
  )
}

function CardBody({ text }: { text: string }) {
  return (
    <p style={{ fontSize: 13, color: '#4a4a4a', lineHeight: 1.72, margin: 0, whiteSpace: 'pre-wrap' }}>
      {text}
    </p>
  )
}

function ConfidencePill({ level }: { level: ConfidenceLevel | null }) {
  if (!level) return null
  const colors: Record<ConfidenceLevel, string> = { HIGH: '#3A6B4D', MEDIUM: '#856A30', LOW: '#8B4444' }
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, padding: '2px 8px', borderRadius: 2,
      background: colors[level] + '18', color: colors[level],
      border: '1px solid ' + colors[level] + '44', letterSpacing: '0.03em',
    }}>
      {CONFIDENCE_LABELS[level]}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FOTOS
// ─────────────────────────────────────────────────────────────────────────────

function PhotosTab({
  media: initialMedia,
  personId,
  onOpen,
  onCountChange,
}: {
  media:          MediaItem[]
  personId:       string
  onOpen:         (m: MediaItem) => void
  onCountChange:  (n: number) => void
}) {
  const router              = useRouter()
  const fileInputRef        = useRef<HTMLInputElement>(null)
  const [media, setMedia]   = useState<MediaItem[]>(initialMedia)
  const [dragging, setDrag] = useState(false)
  const [uploading, setUpl] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    onCountChange(media.length)
  }, [media.length, onCountChange])

  // ── Subir uno o varios archivos ────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList) => {
    if (!files.length) return
    setError(null)
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    for (const file of Array.from(files)) {
      if (!allowed.includes(file.type)) {
        setError(`Archivo no permitido: "${file.name}". Solo se aceptan JPG, PNG, WebP o GIF.`)
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(`"${file.name}" supera el límite de 10 MB.`)
        return
      }
    }
    setUpl(true)
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('personId', personId)
      const res = await uploadMedia(fd)
      if (!res.ok) {
        setError(res.error)
        break
      }
      const newItem: MediaItem = {
        id: res.data.id, url: res.data.url,
        alt: null, caption: null, featured: false, order: 0, mimeType: file.type,
      }
      setMedia(prev => [...prev, newItem])
    }
    setUpl(false)
  }, [personId])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  // ── Eliminar ───────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta foto?')) return
    const res = await deleteMedia(id)
    if (!res.ok) { setError(res.error); return }
    setMedia(prev => prev.filter(m => m.id !== id))
    router.refresh()
  }, [router])

  // ── Toggle destacada ───────────────────────────────────────────────────────
  const handleToggle = useCallback(async (id: string, current: boolean) => {
    const res = await toggleFeaturedMedia(id, !current)
    if (!res.ok) { setError(res.error); return }
    setMedia(prev => prev.map(m => m.id === id ? { ...m, featured: !current } : m))
  }, [])

  return (
    <div>
      {/* Zona de upload */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed ' + (dragging ? '#2D4A3E' : '#B5C4BC'),
          borderRadius: 6,
          padding: '28px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 20,
          background: dragging ? '#EAF0ED' : 'transparent',
          transition: 'background 0.15s, border-color 0.15s',
          userSelect: 'none',
        }}
      >
        {uploading ? (
          <p style={{ margin: 0, fontSize: 13, color: '#2D4A3E' }}>Subiendo…</p>
        ) : (
          <>
            <p style={{ margin: '0 0 4px', fontSize: 22, lineHeight: 1 }}>↑</p>
            <p style={{ margin: 0, fontSize: 13, color: '#5a7a68' }}>
              Arrastra fotos aquí o <u>haz clic para seleccionar</u>
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9BA89F' }}>
              JPG · PNG · WebP · GIF · máx 10 MB por imagen
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files) handleFiles(e.target.files) }}
        />
      </div>

      {error && (
        <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 16, padding: '8px 12px', background: '#fdf0ee', borderRadius: 4 }}>
          {error}
        </p>
      )}

      {/* Grid de fotos */}
      {media.length === 0 ? (
        <p style={{ color: '#9BA89F', fontSize: 13, textAlign: 'center', marginTop: 8 }}>
          Sin fotos registradas aún.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {media.map(m => (
            <PhotoCard key={m.id} item={m} onOpen={onOpen} onDelete={handleDelete} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  )
}

function PhotoCard({
  item, onOpen, onDelete, onToggle,
}: {
  item:     MediaItem
  onOpen:   (m: MediaItem) => void
  onDelete: (id: string) => void
  onToggle: (id: string, current: boolean) => void
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', aspectRatio: '1', background: '#E4E0D8', cursor: 'pointer' }}
    >
      <img
        src={item.url}
        alt={item.alt ?? ''}
        onClick={() => onOpen(item)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'opacity 0.2s', opacity: hover ? 0.85 : 1 }}
      />

      {/* Botón eliminar — aparece en hover */}
      {hover && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(item.id) }}
          title="Eliminar foto"
          style={{
            position: 'absolute', top: 5, left: 5,
            width: 22, height: 22, borderRadius: '50%',
            background: 'rgba(180,30,30,0.82)', border: 'none',
            color: '#fff', fontSize: 12, lineHeight: 1,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✕
        </button>
      )}

      {/* Botón estrella (destacar) — siempre visible si destacada, en hover si no */}
      {(hover || item.featured) && (
        <button
          onClick={e => { e.stopPropagation(); onToggle(item.id, item.featured) }}
          title={item.featured ? 'Quitar de destacadas' : 'Marcar como destacada'}
          style={{
            position: 'absolute', top: 5, right: 5,
            width: 22, height: 22, borderRadius: '50%',
            background: item.featured ? 'rgba(45,74,62,0.88)' : 'rgba(0,0,0,0.45)',
            border: 'none', color: item.featured ? '#FFD966' : '#fff',
            fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ★
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORIAS
// ─────────────────────────────────────────────────────────────────────────────

function StoriesTab({
  items,
  familySlug,
  personId,
  canManage,
}: {
  items: StoryItem[]
  familySlug: string
  personId: string
  canManage: boolean
}) {
  if (items.length === 0) {
    return (
      <div>
        <SectionActionBar title="Historias" href={`/${familySlug}/person/${personId}/content/new?type=STORY`} canManage={canManage} />
        <EmptyState message="Sin historias registradas aun." />
      </div>
    )
  }
  return (
    <div>
      <SectionActionBar title="Historias" href={`/${familySlug}/person/${personId}/content/new?type=STORY`} canManage={canManage} />
      {items.map(s => (
        <ContentCard key={s.id}>
          {s.canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <ItemEditLink href={`/${familySlug}/person/${personId}/content/${s.id}/edit`} />
            </div>
          )}
          <CardTitle>{s.title}</CardTitle>
          <CardMeta>
            {s.approximateDate && s.approximateDate + ' · '}
            {s.authorName && 'por ' + s.authorName + ' · '}
            {new Date(s.createdAt).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}
          </CardMeta>
          {s.confidence && <div style={{ marginBottom: 12 }}><ConfidencePill level={s.confidence} /></div>}
          <CardBody text={s.body} />
          {s.source && (
            <p style={{ fontSize: 11, color: '#9BA89F', marginTop: 14, marginBottom: 0 }}>
              Fuente: {s.source}
            </p>
          )}
        </ContentCard>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RECETAS
// ─────────────────────────────────────────────────────────────────────────────

function RecipesTab({
  items,
  onOpen,
  familySlug,
  personId,
  canManage,
}: {
  items: RecipeItem[]
  onOpen: (m: MediaItem) => void
  familySlug: string
  personId: string
  canManage: boolean
}) {
  if (items.length === 0) {
    return (
      <div>
        <SectionActionBar title="Recetas" href={`/${familySlug}/person/${personId}/content/new?type=RECIPE`} canManage={canManage} />
        <EmptyState message="Sin recetas registradas aun." />
      </div>
    )
  }
  return (
    <div>
      <SectionActionBar title="Recetas" href={`/${familySlug}/person/${personId}/content/new?type=RECIPE`} canManage={canManage} />
      {items.map(r => (
        <ContentCard key={r.id}>
          {r.canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <ItemEditLink href={`/${familySlug}/person/${personId}/content/${r.id}/edit`} />
            </div>
          )}
          <CardTitle>{r.title}</CardTitle>
          <CardMeta>
            {new Date(r.createdAt).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}
          </CardMeta>
          {r.body && <p style={{ fontSize: 13, color: '#4a4a4a', lineHeight: 1.65, margin: '0 0 20px', fontStyle: 'italic' }}>{r.body}</p>}

          {r.media.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {r.media.map(m => (
                <img
                  key={m.id}
                  src={m.url}
                  alt={m.alt ?? ''}
                  onClick={() => onOpen(m)}
                  style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 3, cursor: 'pointer', border: '1px solid #E0DAD0' }}
                />
              ))}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8B9E94', margin: '0 0 10px', fontFamily: 'Georgia, serif' }}>
                Ingredientes
              </p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {r.ingredients.map((ing, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#3a3a3a', lineHeight: 1.7, marginBottom: 2 }}>{ing}</li>
                ))}
              </ul>
            </div>
            <div>
              <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8B9E94', margin: '0 0 10px', fontFamily: 'Georgia, serif' }}>
                Preparacion
              </p>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {r.steps.map((step, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#3a3a3a', lineHeight: 1.65, marginBottom: 8 }}>{step}</li>
                ))}
              </ol>
            </div>
          </div>

          {r.notes && (
            <p style={{ fontSize: 12, color: '#6B7B70', marginTop: 18, marginBottom: 0, borderTop: '1px solid #EAE5DB', paddingTop: 14, lineHeight: 1.6 }}>
              {r.notes}
            </p>
          )}
        </ContentCard>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OBJETOS
// ─────────────────────────────────────────────────────────────────────────────

function ObjectsTab({
  items,
  onOpen,
  familySlug,
  personId,
  canManage,
}: {
  items: ObjectItem[]
  onOpen: (m: MediaItem) => void
  familySlug: string
  personId: string
  canManage: boolean
}) {
  if (items.length === 0) {
    return (
      <div>
        <SectionActionBar title="Objetos" href={`/${familySlug}/person/${personId}/content/new?type=OBJECT`} canManage={canManage} />
        <EmptyState message="Sin objetos registrados aun." />
      </div>
    )
  }
  return (
    <div>
      <SectionActionBar title="Objetos" href={`/${familySlug}/person/${personId}/content/new?type=OBJECT`} canManage={canManage} />
      {items.map(obj => (
        <ContentCard key={obj.id}>
          {obj.canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <ItemEditLink href={`/${familySlug}/person/${personId}/content/${obj.id}/edit`} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            {obj.media.length > 0 && (
              <img
                src={obj.media[0].url}
                alt={obj.media[0].alt ?? ''}
                onClick={() => onOpen(obj.media[0])}
                style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 3, cursor: 'pointer', flexShrink: 0, border: '1px solid #E0DAD0' }}
              />
            )}
            <div style={{ flex: 1 }}>
              <CardTitle>{obj.title}</CardTitle>
              <CardMeta>
                {new Date(obj.createdAt).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}
              </CardMeta>
              {obj.confidence && <div style={{ marginBottom: 10 }}><ConfidencePill level={obj.confidence} /></div>}
              {obj.body && <CardBody text={obj.body} />}
              {obj.notes && (
                <p style={{ fontSize: 12, color: '#6B7B70', marginTop: 10, marginBottom: 0, lineHeight: 1.6, fontStyle: 'italic' }}>
                  {obj.notes}
                </p>
              )}
            </div>
          </div>
        </ContentCard>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DIARIO
// ─────────────────────────────────────────────────────────────────────────────

function DiaryTab({
  items,
  familySlug,
  personId,
  canManage,
}: {
  items: DiaryItem[]
  familySlug: string
  personId: string
  canManage: boolean
}) {
  if (items.length === 0) {
    return (
      <div>
        <SectionActionBar title="Diario" href={`/${familySlug}/person/${personId}/content/new?type=DIARY`} canManage={canManage} />
        <EmptyState message="Sin entradas de diario registradas aun." />
      </div>
    )
  }
  return (
    <div>
      <SectionActionBar title="Diario" href={`/${familySlug}/person/${personId}/content/new?type=DIARY`} canManage={canManage} />
      {items.map(d => (
        <ContentCard key={d.id}>
          {d.canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <ItemEditLink href={`/${familySlug}/person/${personId}/content/${d.id}/edit`} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
            <CardTitle>{d.title}</CardTitle>
            {d.entryDate && (
              <span style={{ fontSize: 11, color: '#9BA89F', flexShrink: 0 }}>
                {new Date(d.entryDate).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            )}
          </div>
          <CardBody text={d.body} />
        </ContentCard>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTREVISTAS
// ─────────────────────────────────────────────────────────────────────────────

function InterviewsTab({
  items,
  familySlug,
  personId,
  canManage,
}: {
  items: InterviewItem[]
  familySlug: string
  personId: string
  canManage: boolean
}) {
  if (items.length === 0) {
    return (
      <div>
        <SectionActionBar title="Entrevistas" href={`/${familySlug}/person/${personId}/content/new?type=INTERVIEW`} canManage={canManage} />
        <EmptyState message="Sin entrevistas registradas aun." />
      </div>
    )
  }
  return (
    <div>
      <SectionActionBar title="Entrevistas" href={`/${familySlug}/person/${personId}/content/new?type=INTERVIEW`} canManage={canManage} />
      {items.map(iv => (
        <ContentCard key={iv.id}>
          {iv.canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <ItemEditLink href={`/${familySlug}/person/${personId}/content/${iv.id}/edit`} />
            </div>
          )}
          <CardTitle>{iv.title}</CardTitle>
          <CardMeta>
            {iv.approximateDate && iv.approximateDate + ' · '}
            {iv.authorName && 'Entrevistador: ' + iv.authorName}
          </CardMeta>
          {iv.confidence && <div style={{ marginBottom: 14 }}><ConfidencePill level={iv.confidence} /></div>}
          <div style={{ borderLeft: '3px solid #C8D4CE', paddingLeft: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#2D4A3E', fontStyle: 'italic', margin: 0, lineHeight: 1.65 }}>
              {iv.question}
            </p>
          </div>
          <CardBody text={iv.body} />
        </ContentCard>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FUENTES
// ─────────────────────────────────────────────────────────────────────────────

function SourcesTab({
  items,
  familySlug,
  personId,
  canManage,
}: {
  items: SourceItem[]
  familySlug: string
  personId: string
  canManage: boolean
}) {
  if (items.length === 0) {
    return (
      <div>
        <SectionActionBar title="Fuentes" href={`/${familySlug}/person/${personId}/content/new?type=SOURCE`} canManage={canManage} />
        <EmptyState message="Sin fuentes documentales registradas aun." />
      </div>
    )
  }
  return (
    <div>
      <SectionActionBar title="Fuentes" href={`/${familySlug}/person/${personId}/content/new?type=SOURCE`} canManage={canManage} />
      {items.map(src => (
        <ContentCard key={src.id}>
          {src.canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <ItemEditLink href={`/${familySlug}/person/${personId}/content/${src.id}/edit`} />
            </div>
          )}
          <CardTitle>{src.title}</CardTitle>
          <CardMeta>
            {new Date(src.createdAt).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}
          </CardMeta>
          {src.confidence && <div style={{ marginBottom: 12 }}><ConfidencePill level={src.confidence} /></div>}
          {src.body && <CardBody text={src.body} />}
          {src.source && (
            <p style={{ fontSize: 11, color: '#9BA89F', marginTop: 14, marginBottom: 0 }}>
              Referencia: {src.source}
            </p>
          )}
        </ContentCard>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RELACIONES IMPORTANTES
// ─────────────────────────────────────────────────────────────────────────────

function LinksTab({
  items,
  familySlug,
  personId,
  canManage,
}: {
  items: ImportantLinkItem[]
  familySlug: string
  personId: string
  canManage: boolean
}) {
  if (items.length === 0) {
    return (
      <div>
        <SectionActionBar title="Relaciones" href={`/${familySlug}/person/${personId}/content/new?type=IMPORTANT_LINK`} canManage={canManage} />
        <EmptyState message="Sin relaciones importantes registradas aun." />
      </div>
    )
  }
  return (
    <div>
      <SectionActionBar title="Relaciones" href={`/${familySlug}/person/${personId}/content/new?type=IMPORTANT_LINK`} canManage={canManage} />
      {items.map(lnk => {
        const name = lnk.relatedPerson
          ? getPersonDisplayName(lnk.relatedPerson)
          : (lnk.externalName ?? '—')
        const initials = name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
        return (
          <ContentCard key={lnk.id}>
            {lnk.canEdit && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <ItemEditLink href={`/${familySlug}/person/${personId}/content/${lnk.id}/edit`} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* Mini avatar */}
              <div style={{
                width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
                background: '#EAF0ED', border: '2px solid #B5C4BC',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 13, fontFamily: 'Georgia, serif', color: '#2D4A3E', fontWeight: 600 }}>{initials}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  {lnk.relatedPerson ? (
                    <Link
                      href={"/" + familySlug + "/person/" + lnk.relatedPerson.id}
                      style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 600, color: '#2D4A3E', textDecoration: 'none' }}
                    >
                      {name}
                    </Link>
                  ) : (
                    <span style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 600, color: '#2C2C2C' }}>{name}</span>
                  )}
                  <span style={{
                    fontSize: 11, color: '#5a7a68', background: '#EAF0ED',
                    border: '1px solid #C0D0C8', borderRadius: 2, padding: '2px 8px',
                  }}>
                    {lnk.label}
                  </span>
                  {lnk.relatedPerson === null && (
                    <span style={{ fontSize: 10, color: '#9BA89F' }}>externo al árbol</span>
                  )}
                </div>
                {lnk.notes && (
                  <p style={{ fontSize: 13, color: '#4a4a4a', lineHeight: 1.65, margin: '10px 0 0' }}>
                    {lnk.notes}
                  </p>
                )}
                {lnk.confidence && (
                  <div style={{ marginTop: 10 }}>
                    <ConfidencePill level={lnk.confidence} />
                  </div>
                )}
              </div>
            </div>
          </ContentCard>
        )
      })}
    </div>
  )
}
