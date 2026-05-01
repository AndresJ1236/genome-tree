'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createPerson, deletePerson, setPersonCoverPhoto, updatePerson } from '@/app/actions/people'
import { uploadMedia, deleteMedia } from '@/app/actions/media'
import type { MediaItem, PersonEditorPayload, PersonFormData } from '@/lib/content-types'
import { getPersonDisplayName } from '@/lib/person-name'

const shellStyle: React.CSSProperties = {
  maxWidth: 880,
  margin: '0 auto',
  padding: '32px 24px 112px',
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E0DAD0',
  borderRadius: 3,
  padding: '24px 28px',
}

const stickyActionsStyle: React.CSSProperties = {
  position: 'sticky',
  bottom: 0,
  marginTop: 22,
  marginInline: -28,
  marginBottom: -24,
  padding: '14px 28px 18px',
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'center',
  borderTop: '1px solid #E7E1D8',
  background: 'rgba(255, 252, 248, 0.96)',
  backdropFilter: 'blur(10px)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#8B9E94',
  fontFamily: 'Georgia, serif',
  marginBottom: 8,
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

function emptyForm(): PersonFormData {
  return {
    id: '',
    firstName: '',
    middleName: '',
    lastName: '',
    birthSurname1: '',
    birthSurname2: '',
    birthDate: '',
    deathDate: '',
    birthPlace: '',
    gender: 'UNKNOWN',
    bio: '',
    fatherId: '',
    motherId: '',
    coverPhoto: '',
    isCore: false,
  }
}

export function PersonEditor({
  payload,
  mode,
}: {
  payload: PersonEditorPayload
  mode: 'create' | 'edit'
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<PersonFormData>(payload.person ?? emptyForm())
  const [media, setMedia] = useState<MediaItem[]>(payload.media)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const title = mode === 'create' ? 'Nueva persona' : 'Editar persona'
  const personPath = form.id ? `/${payload.familySlug}/person/${form.id}` : `/${payload.familySlug}/tree`

  const parentOptions = useMemo(
    () => payload.candidates.map(person => ({
      ...person,
      label: getPersonDisplayName(person),
    })),
    [payload.candidates]
  )

  function updateField<K extends keyof PersonFormData>(key: K, value: PersonFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    setError(null)
    setMessage(null)

    startTransition(async () => {
      if (mode === 'create') {
        const result = await createPerson(form)
        if (!result.ok) {
          setError(result.error)
          return
        }
        router.push(`/${payload.familySlug}/person/${result.data.id}/edit`)
        router.refresh()
        return
      }

      const result = await updatePerson(form)
      if (!result.ok) {
        setError(result.error)
        return
      }

      setMessage('Cambios guardados.')
      router.refresh()
    })
  }

  function handleUpload(files: FileList | null) {
    if (!files || !form.id) return
    setError(null)
    setMessage(null)

    startTransition(async () => {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('personId', form.id)
        const result = await uploadMedia(fd)
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

  function handleSetCover(mediaId: string | null, url = '') {
    if (!form.id) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await setPersonCoverPhoto(form.id, mediaId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      updateField('coverPhoto', url)
      setMessage(mediaId ? 'Foto de perfil actualizada.' : 'Foto de perfil eliminada.')
      router.refresh()
    })
  }

  function handleDeleteMedia(mediaId: string) {
    if (!confirm('Eliminar esta foto de la galeria?')) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await deleteMedia(mediaId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMedia(prev => prev.filter(item => item.id !== mediaId))
      if (form.coverPhoto && media.find(item => item.id === mediaId)?.url === form.coverPhoto) {
        updateField('coverPhoto', '')
      }
      setMessage('Foto eliminada.')
      router.refresh()
    })
  }

  function handleDeletePerson() {
    if (!form.id) return
    if (!confirm('Eliminar esta persona? Esta accion no se puede deshacer.')) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await deletePerson(form.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/${payload.familySlug}/tree`)
      router.refresh()
    })
  }

  return (
    <div style={shellStyle}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <Link href={personPath} style={{ color: '#2D4A3E', textDecoration: 'none', fontSize: 12, letterSpacing: '0.05em' }}>
            ← Volver
          </Link>
          <h1 style={{ margin: '10px 0 4px', fontFamily: 'Georgia, serif', fontSize: 30, color: '#2D4A3E' }}>{title}</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>
            {mode === 'create'
              ? 'Crea una persona nueva y luego podras subir sus fotos y elegir la portada.'
              : 'Actualiza los datos centrales, parentesco y foto principal.'}
          </p>
        </div>
        {mode === 'edit' && (
          <Link
            href={`/${payload.familySlug}/person/new`}
            style={{
              textDecoration: 'none',
              border: '1px solid #C8D4CE',
              color: '#2D4A3E',
              padding: '9px 12px',
              borderRadius: 2,
              fontSize: 12,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: '#F8F5EE',
            }}
          >
            Nueva persona
          </Link>
        )}
      </div>

      <div style={{ display: 'grid', gap: 22 }}>
        <section style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18 }}>
            <Field label="Nombre">
              <input value={form.firstName} onChange={e => updateField('firstName', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Segundo nombre">
              <input value={form.middleName} onChange={e => updateField('middleName', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Apellido">
              <input value={form.lastName} onChange={e => updateField('lastName', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Apellido de nacimiento 1">
              <input value={form.birthSurname1} onChange={e => updateField('birthSurname1', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Apellido de nacimiento 2">
              <input value={form.birthSurname2} onChange={e => updateField('birthSurname2', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Fecha de nacimiento">
              <input type="date" value={form.birthDate} onChange={e => updateField('birthDate', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Fecha de fallecimiento">
              <input type="date" value={form.deathDate} onChange={e => updateField('deathDate', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Lugar de nacimiento">
              <input value={form.birthPlace} onChange={e => updateField('birthPlace', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Genero">
              <select value={form.gender} onChange={e => updateField('gender', e.target.value as PersonFormData['gender'])} style={inputStyle}>
                <option value="UNKNOWN">No especificado</option>
                <option value="MALE">Masculino</option>
                <option value="FEMALE">Femenino</option>
                <option value="OTHER">Otro</option>
              </select>
            </Field>
            <Field label="Padre">
              <select value={form.fatherId} onChange={e => updateField('fatherId', e.target.value)} style={inputStyle}>
                <option value="">Sin asignar</option>
                {parentOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Madre">
              <select value={form.motherId} onChange={e => updateField('motherId', e.target.value)} style={inputStyle}>
                <option value="">Sin asignar</option>
                {parentOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ marginTop: 18 }}>
            <Field label="Bio">
              <textarea
                value={form.bio}
                onChange={e => updateField('bio', e.target.value)}
                style={{ ...inputStyle, minHeight: 140, resize: 'vertical' }}
              />
            </Field>
          </div>

          {mode === 'edit' && (
            <div style={{ marginTop: 18 }}>
              <label style={{ display: 'inline-flex', gap: 10, alignItems: 'center', color: '#5A615C', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={form.isCore}
                  onChange={e => updateField('isCore', e.target.checked)}
                />
                Proteger como tronco central del arbol
              </label>
            </div>
          )}

          {(error || message) && (
            <div
              style={{
                marginTop: 18,
                padding: '10px 12px',
                borderRadius: 3,
                border: `1px solid ${error ? '#D8AAAA' : '#BFD0C7'}`,
                background: error ? '#FFF1F1' : '#F3F7F4',
                color: error ? '#8B4444' : '#2D4A3E',
                fontSize: 13,
              }}
            >
              {error ?? message}
            </div>
          )}

          <div style={stickyActionsStyle}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              style={{
                background: '#2D4A3E',
                color: '#fff',
                border: 'none',
                borderRadius: 2,
                padding: '11px 16px',
                cursor: 'pointer',
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {isPending ? 'Guardando...' : mode === 'create' ? 'Crear persona' : 'Guardar cambios'}
            </button>
            <span style={{ fontSize: 12, color: '#7A847E' }}>
              {mode === 'create' ? 'Completa los datos y crea la persona.' : 'Guarda para confirmar los cambios.'}
            </span>
            {mode === 'edit' && (
              <button
                type="button"
                onClick={handleDeletePerson}
                disabled={isPending}
                style={{
                  background: '#FFF5F5',
                  color: '#8B4444',
                  border: '1px solid #E6C1C1',
                  borderRadius: 2,
                  padding: '11px 16px',
                  cursor: 'pointer',
                  fontSize: 12,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                Eliminar persona
              </button>
            )}
          </div>
        </section>

        {mode === 'edit' && (
          <section style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h2 style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: 22, color: '#2D4A3E' }}>Fotos y portada</h2>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6B6B6B' }}>
                  Sube imagenes a la galeria y elige cual aparece como foto principal.
                </p>
              </div>
              <label
                style={{
                  border: '1px solid #C8D4CE',
                  borderRadius: 2,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  fontSize: 12,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#2D4A3E',
                  background: '#F8F5EE',
                }}
              >
                Subir fotos
                <input type="file" accept="image/*" multiple hidden onChange={e => handleUpload(e.target.files)} />
              </label>
            </div>

            {form.coverPhoto && (
              <div style={{ marginBottom: 18 }}>
                <p style={labelStyle}>Portada actual</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <img src={form.coverPhoto} alt="" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: '50%', border: '2px solid #B5C4BC' }} />
                  <button
                    type="button"
                    onClick={() => handleSetCover(null)}
                    style={{
                      border: '1px solid #E0DAD0',
                      background: '#fff',
                      borderRadius: 2,
                      color: '#6B4E37',
                      padding: '9px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    Quitar portada
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 14 }}>
              {media.length > 0 ? media.map(item => (
                <div key={item.id} style={{ border: '1px solid #E0DAD0', borderRadius: 3, overflow: 'hidden', background: '#fff' }}>
                  <img src={item.url} alt={item.alt ?? ''} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: 10, display: 'grid', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleSetCover(item.id, item.url)}
                      style={{
                        border: '1px solid #C8D4CE',
                        background: form.coverPhoto === item.url ? '#2D4A3E' : '#F8F5EE',
                        color: form.coverPhoto === item.url ? '#fff' : '#2D4A3E',
                        borderRadius: 2,
                        padding: '8px 10px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {form.coverPhoto === item.url ? 'Portada actual' : 'Usar como portada'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMedia(item.id)}
                      style={{
                        border: '1px solid #E6C1C1',
                        background: '#FFF5F5',
                        color: '#8B4444',
                        borderRadius: 2,
                        padding: '8px 10px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Eliminar foto
                    </button>
                  </div>
                </div>
              )) : (
                <p style={{ margin: 0, color: '#8B9E94', fontSize: 13 }}>Aun no hay fotos en la galeria.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  )
}
