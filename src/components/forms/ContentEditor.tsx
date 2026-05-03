'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  createDiaryEntry,
  createImportantLink,
  createInterview,
  createObject,
  createRecipe,
  createSource,
  createStory,
  deleteContent,
  deleteImportantLink,
  updateContent,
  updateImportantLink,
} from '@/app/actions/content'
import { deleteMedia, uploadContentMedia } from '@/app/actions/media'
import type { ContentEditorData, ContentVisibility, MediaItem, PersonOption } from '@/lib/content-types'
import { getPersonDisplayName } from '@/lib/person-name'
import { ConfirmButton } from '@/components/ui/ConfirmButton'

const visibilityOptions: ContentVisibility[] = ['BRANCH', 'FAMILY', 'ADMIN']

export function ContentEditor({
  initialData,
  familySlug,
  personId,
  contentId,
  people,
  isAdmin = false,
}: {
  initialData: ContentEditorData
  familySlug: string
  personId: string
  contentId?: string
  people: PersonOption[]
  isAdmin?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState(initialData)
  const [media, setMedia] = useState<MediaItem[]>(initialData.media)
  const [error, setError] = useState<string | null>(null)

  const isEdit = Boolean(contentId)
  const backHref = `/${familySlug}/person/${personId}`

  function update<K extends keyof ContentEditorData>(key: K, value: ContentEditorData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function lines(value: string) {
    return value.split('\n').map(line => line.trim()).filter(Boolean)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      let result

      if (form.type === 'STORY') {
        result = isEdit
          ? await updateContent(contentId!, {
              title: form.title,
              body: form.body,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
              approximateDate: form.approximateDate || undefined,
              authorName: form.authorName || undefined,
            })
          : await createStory({
              personId,
              title: form.title,
              body: form.body,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
              approximateDate: form.approximateDate || undefined,
              authorName: form.authorName || undefined,
            })
      } else if (form.type === 'RECIPE') {
        result = isEdit
          ? await updateContent(contentId!, {
              title: form.title,
              body: form.body || undefined,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
              ingredients: lines(form.ingredientsText),
              steps: lines(form.stepsText),
              notes: form.notes || undefined,
            })
          : await createRecipe({
              personId,
              title: form.title,
              body: form.body || undefined,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
              ingredients: lines(form.ingredientsText),
              steps: lines(form.stepsText),
              notes: form.notes || undefined,
            })
      } else if (form.type === 'OBJECT') {
        result = isEdit
          ? await updateContent(contentId!, {
              title: form.title,
              body: form.body || undefined,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
              notes: form.notes || undefined,
            })
          : await createObject({
              personId,
              title: form.title,
              body: form.body || undefined,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
              notes: form.notes || undefined,
            })
      } else if (form.type === 'DIARY') {
        result = isEdit
          ? await updateContent(contentId!, {
              title: form.title,
              body: form.body,
              visibility: form.visibility,
              entryDate: form.entryDate || undefined,
            })
          : await createDiaryEntry({
              personId,
              title: form.title,
              body: form.body,
              visibility: form.visibility,
              entryDate: form.entryDate || undefined,
            })
      } else if (form.type === 'INTERVIEW') {
        result = isEdit
          ? await updateContent(contentId!, {
              title: form.title,
              body: form.body,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
              approximateDate: form.approximateDate || undefined,
              authorName: form.authorName || undefined,
              question: form.question,
            })
          : await createInterview({
              personId,
              title: form.title,
              body: form.body,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
              approximateDate: form.approximateDate || undefined,
              authorName: form.authorName || undefined,
              question: form.question,
            })
      } else if (form.type === 'SOURCE') {
        result = isEdit
          ? await updateContent(contentId!, {
              title: form.title,
              body: form.body || undefined,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
            })
          : await createSource({
              personId,
              title: form.title,
              body: form.body || undefined,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
            })
      } else {
        result = isEdit
          ? await updateImportantLink(contentId!, {
              label: form.label,
              notes: form.notes || undefined,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
              relatedPersonId: form.relatedPersonId || '',
              externalName: form.externalName || '',
            })
          : await createImportantLink({
              personId,
              label: form.label,
              notes: form.notes || undefined,
              source: form.source || undefined,
              confidence: form.confidence || undefined,
              visibility: form.visibility,
              relatedPersonId: form.relatedPersonId || undefined,
              externalName: form.externalName || undefined,
            })
      }

      if (!result.ok) {
        setError(result.error)
        return
      }

      router.push(backHref)
    })
  }

  function handleDelete() {
    if (!contentId) return
    setError(null)
    startTransition(async () => {
      const result = form.type === 'IMPORTANT_LINK'
        ? await deleteImportantLink(contentId)
        : await deleteContent(contentId)

      if (!result.ok) {
        setError(result.error)
        return
      }

      router.push(backHref)
    })
  }

  function handleUpload(files: FileList | null) {
    if (!files || !contentId || (form.type !== 'RECIPE' && form.type !== 'OBJECT')) return
    setError(null)

    startTransition(async () => {
      for (const file of Array.from(files)) {
        const data = new FormData()
        data.append('file', file)
        data.append('personId', personId)
        data.append('contentId', contentId)

        const result = await uploadContentMedia(data)
        if (!result.ok) {
          setError(result.error)
          break
        }

        setMedia(prev => [
          ...prev,
          {
            id: result.data.id,
            url: result.data.url,
            alt: null,
            caption: null,
            featured: false,
            order: prev.length,
            mimeType: file.type,
          },
        ])
      }

      router.refresh()
    })
  }

  function handleDeleteMedia(mediaId: string) {
    setError(null)

    startTransition(async () => {
      const result = await deleteMedia(mediaId)
      if (!result.ok) {
        setError(result.error)
        return
      }

      setMedia(prev => prev.filter(item => item.id !== mediaId))
      router.refresh()
    })
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 24px 64px' }}>
      <Link href={backHref} style={{ color: '#2D4A3E', textDecoration: 'none', fontSize: 12, letterSpacing: '0.05em' }}>
        ← Volver al perfil
      </Link>

      <div style={{ marginTop: 10, marginBottom: 22 }}>
        <h1 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 30, color: '#2D4A3E' }}>
          {isEdit ? `Editar ${typeLabel(form.type).toLowerCase()}` : `Nueva ${typeLabel(form.type).toLowerCase()}`}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>{typeLabel(form.type)}</p>
      </div>

      <div style={cardStyle}>
        {renderFields(form, update, people, isAdmin)}

        {isEdit && (form.type === 'RECIPE' || form.type === 'OBJECT') && (
          <div style={{ marginTop: 24, borderTop: '1px solid #EAE5DB', paddingTop: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div>
                <p style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: 20, color: '#2D4A3E' }}>Imagenes del contenido</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B6B6B' }}>
                  Puedes subir hasta 3 imagenes para esta {form.type === 'RECIPE' ? 'receta' : 'pieza'}.
                </p>
              </div>
              <label style={secondaryButtonStyle}>
                Subir imagenes
                <input type="file" accept="image/*" multiple hidden onChange={e => handleUpload(e.target.files)} />
              </label>
            </div>

            {media.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
                {media.map(item => (
                  <div key={item.id} style={{ border: '1px solid #E0DAD0', borderRadius: 3, overflow: 'hidden', background: '#FFFCF8' }}>
                    <img src={item.url} alt={item.alt ?? ''} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                    <div style={{ padding: 10 }}>
                      <ConfirmButton
                        label="Eliminar imagen"
                        confirmLabel="¿Seguro?"
                        onConfirm={() => handleDeleteMedia(item.id)}
                        disabled={isPending}
                        style={{ padding: '8px 12px', fontSize: 13, borderRadius: 2, width: '100%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: '#8B9E94', fontSize: 13 }}>Aun no hay imagenes vinculadas a este contenido.</p>
            )}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 16, padding: '10px 12px', background: '#FFF1F1', border: '1px solid #D8AAAA', color: '#8B4444', borderRadius: 3, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={handleSave} disabled={isPending} style={primaryButtonStyle}>
            {isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear'}
          </button>
          {isEdit && (
            <ConfirmButton
              label="Eliminar"
              confirmLabel="¿Seguro? No se puede deshacer"
              onConfirm={handleDelete}
              disabled={isPending}
              style={{ padding: '12px 20px', fontSize: 15, borderRadius: 2 }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function renderFields(
  form: ContentEditorData,
  update: <K extends keyof ContentEditorData>(key: K, value: ContentEditorData[K]) => void,
  people: PersonOption[],
  isAdmin: boolean
) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {form.type !== 'IMPORTANT_LINK' ? (
        <>
          <Field label="Titulo">
            <input value={form.title} onChange={e => update('title', e.target.value)} style={inputStyle} />
          </Field>
          {form.type === 'INTERVIEW' && (
            <Field label="Pregunta">
              <textarea value={form.question} onChange={e => update('question', e.target.value)} style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} />
            </Field>
          )}
          <Field label={form.type === 'INTERVIEW' ? 'Respuesta' : 'Escribe aquí'}>
            <textarea value={form.body} onChange={e => update('body', e.target.value)} style={{ ...inputStyle, minHeight: 150, resize: 'vertical' }} />
          </Field>
        </>
      ) : (
        <Field label="Etiqueta">
          <input value={form.label} onChange={e => update('label', e.target.value)} style={inputStyle} />
        </Field>
      )}

      {form.type === 'RECIPE' && (
        <>
          <Field label="Ingredientes (uno por linea)">
            <textarea value={form.ingredientsText} onChange={e => update('ingredientsText', e.target.value)} style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} />
          </Field>
          <Field label="Pasos (uno por linea)">
            <textarea value={form.stepsText} onChange={e => update('stepsText', e.target.value)} style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} />
          </Field>
        </>
      )}

      {form.type === 'DIARY' && (
        <Field label="Fecha de entrada">
          <input type="date" value={form.entryDate} onChange={e => update('entryDate', e.target.value)} style={inputStyle} />
        </Field>
      )}

      {(form.type === 'STORY' || form.type === 'INTERVIEW') && (
        <>
          <Field label="Fecha aproximada">
            <input value={form.approximateDate} onChange={e => update('approximateDate', e.target.value)} style={inputStyle} />
          </Field>
          <Field label={form.type === 'INTERVIEW' ? 'Entrevistador' : 'Autor'}>
            <input value={form.authorName} onChange={e => update('authorName', e.target.value)} style={inputStyle} />
          </Field>
        </>
      )}

      {(form.type === 'RECIPE' || form.type === 'OBJECT' || form.type === 'IMPORTANT_LINK') && (
        <Field label="Notas">
          <textarea value={form.notes} onChange={e => update('notes', e.target.value)} style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} />
        </Field>
      )}

      {form.type === 'IMPORTANT_LINK' && (
        <>
          <Field label="Persona del arbol">
            <select value={form.relatedPersonId} onChange={e => update('relatedPersonId', e.target.value)} style={inputStyle}>
              <option value="">Sin relacion interna</option>
              {people.map(person => (
                <option key={person.id} value={person.id}>{getPersonDisplayName(person)}</option>
              ))}
            </select>
          </Field>
          <Field label="Nombre externo">
            <input value={form.externalName} onChange={e => update('externalName', e.target.value)} style={inputStyle} />
          </Field>
        </>
      )}

      {form.type !== 'DIARY' && (
        <>
          <Field label="Referencia (opcional)">
            <input
              value={form.source}
              onChange={e => update('source', e.target.value)}
              placeholder="Ej: foto familiar, carta de 1953, recuerdo propio, entrevista con abuela..."
              style={inputStyle}
            />
          </Field>
          <Field label="¿Qué tan seguro es esto?">
            <select value={form.confidence} onChange={e => update('confidence', e.target.value as ContentEditorData['confidence'])} style={inputStyle}>
              <option value="">No sé / Prefiero no indicar</option>
              <option value="HIGH">Seguro — lo sé con certeza</option>
              <option value="MEDIUM">Probable — creo que es correcto</option>
              <option value="LOW">Incierto — podría estar equivocado</option>
            </select>
          </Field>
        </>
      )}

      {isAdmin && (
        <Field label="Visibilidad">
          <select value={form.visibility} onChange={e => update('visibility', e.target.value as ContentVisibility)} style={inputStyle}>
            {visibilityOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </Field>
      )}
    </div>
  )
}

function typeLabel(type: ContentEditorData['type']) {
  switch (type) {
    case 'STORY': return 'Historia'
    case 'RECIPE': return 'Receta'
    case 'OBJECT': return 'Objeto con historia'
    case 'DIARY': return 'Entrada de diario'
    case 'INTERVIEW': return 'Entrevista'
    case 'SOURCE': return 'Fuente documental'
    case 'IMPORTANT_LINK': return 'Relacion importante'
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <div style={{ fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B7B70', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #D8D3CA',
  borderRadius: 3,
  padding: '11px 12px',
  fontSize: 14,
  color: '#2C2C2C',
  background: '#FFFCF8',
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E0DAD0',
  borderRadius: 3,
  padding: '24px 28px',
}

const primaryButtonStyle: React.CSSProperties = {
  border: 'none',
  background: '#2D4A3E',
  color: '#fff',
  borderRadius: 2,
  padding: '12px 20px',
  cursor: 'pointer',
  fontSize: 15,
}

const dangerButtonStyle: React.CSSProperties = {
  border: '1px solid #E6C1C1',
  background: '#FFF5F5',
  color: '#8B4444',
  borderRadius: 2,
  padding: '12px 20px',
  cursor: 'pointer',
  fontSize: 15,
}

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid #C8D4CE',
  background: '#F8F5EE',
  color: '#2D4A3E',
  borderRadius: 2,
  padding: '12px 16px',
  cursor: 'pointer',
  fontSize: 14,
}
