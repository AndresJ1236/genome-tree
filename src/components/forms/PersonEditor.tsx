'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createPerson, createRelationship, deleteRelationship, deletePerson, setParentChild, setPersonCoverPhoto, setRelationshipEndDate, updatePerson } from '@/app/actions/people'
import { proposePeopleUpdate } from '@/app/actions/proposals'
import { uploadMedia, deleteMedia } from '@/app/actions/media'
import { CLAIMED_RELATION_LABELS, CLAIMED_RELATION_REQUIRES_REF } from '@/lib/content-types'
import type { ClaimedRelation, MediaItem, PersonEditorPayload, PersonFormData, RelationshipItem } from '@/lib/content-types'
import { getPersonDisplayName } from '@/lib/person-name'
import { HelpTooltip } from '@/components/ui/HelpTooltip'

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

const disabledInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: '#F4F1EC',
  color: '#8B9490',
  cursor: 'not-allowed',
  opacity: 0.8,
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
    nodeKind: 'PERSON',
    bio: '',
    fatherId: '',
    motherId: '',
    coverPhoto: '',
    isCore: false,
    unitAffiliationId: '',
    claimedRelation: '',
    claimedRelationOfId: '',
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
  const [relationships, setRelationships] = useState<RelationshipItem[]>(payload.relationships)
  const [newPartnerType, setNewPartnerType] = useState<'SPOUSE' | 'PARTNER'>('SPOUSE')
  const [newPartnerId, setNewPartnerId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadCount, setUploadCount] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)

  const initialFormRef = useRef<string>(JSON.stringify(payload.person ?? emptyForm()))
  const isDirty = JSON.stringify(form) !== initialFormRef.current

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty) return
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // Quick connection (create mode only)
  const [quickRelType, setQuickRelType] = useState<'' | 'child-of' | 'parent-of' | 'partner-of'>('')
  const [quickTargetId, setQuickTargetId] = useState('')
  const [quickParentRole, setQuickParentRole] = useState<'father' | 'mother'>('father')
  const [quickPartnerType, setQuickPartnerType] = useState<'SPOUSE' | 'PARTNER'>('SPOUSE')

  const isMember = payload.viewerMode === 'MEMBER'
  const isAdmin = payload.viewerMode === 'ADMIN'
  const canChangeRel = payload.canChangeRelationships

  const isFloating = !form.fatherId && !form.motherId
  const showAffiliation = canChangeRel && payload.managedUnits.length > 0 && isFloating

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
      if (mode === 'edit' && isMember && form.id) {
        const original = payload.person!
        type ProposableFields = {
          firstName?: string
          middleName?: string | null
          lastName?: string
          gender?: PersonFormData['gender']
          birthDate?: string | null
          deathDate?: string | null
          birthPlace?: string | null
          bio?: string | null
        }
        const fields: ProposableFields = {}
        if (form.firstName !== original.firstName) fields.firstName = form.firstName
        if (form.middleName !== original.middleName) fields.middleName = form.middleName || null
        if (form.lastName !== original.lastName) fields.lastName = form.lastName
        if (form.gender !== original.gender) fields.gender = form.gender
        if (form.birthDate !== original.birthDate) fields.birthDate = form.birthDate || null
        if (form.deathDate !== original.deathDate) fields.deathDate = form.deathDate || null
        if (form.birthPlace !== original.birthPlace) fields.birthPlace = form.birthPlace || null
        if (form.bio !== original.bio) fields.bio = form.bio || null

        const result = await proposePeopleUpdate({ personId: form.id, fields })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setMessage('Propuesta enviada. Un administrador la revisará antes de aplicar los cambios.')
        return
      }

      if (mode === 'create') {
        // If "child-of", pre-fill parent fields from quick connection
        const formToSend = { ...form }
        if (quickRelType === 'child-of' && quickTargetId) {
          const target = parentOptions.find(p => p.id === quickTargetId)
          const role = target?.gender === 'MALE' ? 'fatherId' : target?.gender === 'FEMALE' ? 'motherId' : quickParentRole === 'father' ? 'fatherId' : 'motherId'
          formToSend[role] = quickTargetId
        }

        const result = await createPerson(formToSend)
        if (!result.ok) {
          setError(result.error)
          return
        }
        const newId = result.data.id

        // Apply post-create quick connections
        if (quickRelType === 'parent-of' && quickTargetId) {
          await setParentChild({ childId: quickTargetId, parentId: newId, role: quickParentRole })
        } else if (quickRelType === 'partner-of' && quickTargetId) {
          await createRelationship({ personId: newId, partnerId: quickTargetId, type: quickPartnerType })
        }

        router.push(`/${payload.familySlug}/person/${newId}/edit`)
        router.refresh()
        return
      }

      const result = await updatePerson(form)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage('Cambios guardados.')
      initialFormRef.current = JSON.stringify(form)
      router.refresh()
    })
  }

  function handleUpload(files: FileList | null) {
    if (!files || !form.id) return
    setError(null)
    setMessage(null)

    const fileList = Array.from(files)
    setUploadTotal(fileList.length)
    setUploadCount(0)

    startTransition(async () => {
      let done = 0
      for (const file of fileList) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('personId', form.id)
        const result = await uploadMedia(fd)
        if (!result.ok) {
          setError(result.error)
          break
        }
        done++
        setUploadCount(done)
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
      setUploadTotal(0)
      setUploadCount(0)
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

  function handleAddRelationship() {
    if (!form.id || !newPartnerId) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await createRelationship({ personId: form.id, partnerId: newPartnerId, type: newPartnerType })
      if (!result.ok) { setError(result.error); return }
      const partner = payload.candidates.find(c => c.id === newPartnerId)
      if (partner) {
        setRelationships(prev => [...prev, {
          id: result.data.id,
          type: newPartnerType,
          partnerId: newPartnerId,
          partnerName: getPersonDisplayName(partner),
          endDate: null,
        }])
      }
      setNewPartnerId('')
      setMessage('Relación de pareja añadida.')
    })
  }

  function handleRemoveRelationship(relId: string) {
    if (!form.id) return
    if (!confirm('Eliminar esta relación de pareja?')) return
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await deleteRelationship({ relationshipId: relId, personId: form.id })
      if (!result.ok) { setError(result.error); return }
      setRelationships(prev => prev.filter(r => r.id !== relId))
      setMessage('Relación eliminada.')
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

  const submitLabel = isPending
    ? (mode === 'edit' && isMember ? 'Enviando...' : 'Guardando...')
    : mode === 'create'
      ? 'Crear persona'
      : isMember ? 'Enviar propuesta' : 'Guardar cambios'

  const submitHint = isMember && mode === 'edit'
    ? 'Los cambios serán revisados antes de aplicarse.'
    : mode === 'create'
      ? 'Completa los datos y crea la persona.'
      : 'Guarda para confirmar los cambios.'

  return (
    <div style={shellStyle}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <button
            type="button"
            onClick={() => {
              if (isDirty && !window.confirm('Tienes cambios sin guardar. ¿Salir de todas formas?')) return
              router.push(personPath)
            }}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#2D4A3E', fontSize: 12, letterSpacing: '0.05em' }}
          >
            ← Volver
          </button>
          <h1 style={{ margin: '10px 0 4px', fontFamily: 'Georgia, serif', fontSize: 30, color: '#2D4A3E' }}>{title}</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>
            {mode === 'create'
              ? 'Crea una persona nueva y luego podras subir sus fotos y elegir la portada.'
              : isMember
                ? 'Propone cambios en los datos biográficos. Un administrador los revisará antes de aplicarlos.'
                : 'Actualiza los datos centrales, parentesco y foto principal.'}
          </p>
        </div>
        {mode === 'edit' && !isMember && (
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

        {mode === 'create' && (
          <section style={cardStyle}>
            <p style={{ margin: '0 0 16px', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B9E94', fontFamily: 'Georgia, serif' }}>
              Conexión inicial
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: quickRelType ? 16 : 0 }}>
              {(['', 'child-of', 'parent-of', 'partner-of'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setQuickRelType(type); setQuickTargetId(''); }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 2,
                    border: `1px solid ${quickRelType === type ? '#2D4A3E' : '#D8D3CA'}`,
                    background: quickRelType === type ? '#2D4A3E' : '#FFFCF8',
                    color: quickRelType === type ? '#fff' : '#5A615C',
                    fontSize: 12,
                    cursor: 'pointer',
                    letterSpacing: '0.04em',
                  }}
                >
                  {type === '' ? 'Sin conexión' : type === 'child-of' ? 'Hijo/a de...' : type === 'parent-of' ? 'Padre/Madre de...' : 'Pareja de...'}
                </button>
              ))}
            </div>

            {quickRelType === 'child-of' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                <Field label="Esta persona es hijo/a de">
                  <select value={quickTargetId} onChange={e => setQuickTargetId(e.target.value)} style={inputStyle}>
                    <option value="">Seleccionar padre o madre...</option>
                    {parentOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
                {quickTargetId && parentOptions.find(p => p.id === quickTargetId)?.gender === 'UNKNOWN' && (
                  <Field label="Rol">
                    <select value={quickParentRole} onChange={e => setQuickParentRole(e.target.value as 'father' | 'mother')} style={{ ...inputStyle, width: 'auto' }}>
                      <option value="father">Es el padre</option>
                      <option value="mother">Es la madre</option>
                    </select>
                  </Field>
                )}
              </div>
            )}

            {quickRelType === 'parent-of' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                <Field label="Esta persona es padre/madre de">
                  <select value={quickTargetId} onChange={e => setQuickTargetId(e.target.value)} style={inputStyle}>
                    <option value="">Seleccionar hijo/a...</option>
                    {parentOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
                <Field label="Como">
                  <select value={quickParentRole} onChange={e => setQuickParentRole(e.target.value as 'father' | 'mother')} style={{ ...inputStyle, width: 'auto' }}>
                    <option value="father">Como padre</option>
                    <option value="mother">Como madre</option>
                  </select>
                </Field>
              </div>
            )}

            {quickRelType === 'partner-of' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                <Field label="Esta persona es pareja de">
                  <select value={quickTargetId} onChange={e => setQuickTargetId(e.target.value)} style={inputStyle}>
                    <option value="">Seleccionar pareja...</option>
                    {parentOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
                <Field label="Tipo">
                  <select value={quickPartnerType} onChange={e => setQuickPartnerType(e.target.value as 'SPOUSE' | 'PARTNER')} style={{ ...inputStyle, width: 'auto' }}>
                    <option value="SPOUSE">Cónyuge</option>
                    <option value="PARTNER">Pareja</option>
                  </select>
                </Field>
              </div>
            )}
          </section>
        )}

        <section style={cardStyle}>
          {/* Selector de tipo siempre visible primero */}
          <div style={{ marginBottom: 18 }}>
            <Field label="Tipo" help="Persona: aparece como nodo normal en el árbol. Mascota: aparece como nodo pequeño y discreto.">
              <select value={form.nodeKind} onChange={e => updateField('nodeKind', e.target.value as PersonFormData['nodeKind'])} style={{ ...inputStyle, width: 'auto' }}>
                <option value="PERSON">Persona</option>
                <option value="PET">Mascota</option>
              </select>
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18 }}>
            <Field label="Nombre" required>
              <input value={form.firstName} onChange={e => updateField('firstName', e.target.value)} style={inputStyle} />
            </Field>
            {form.nodeKind !== 'PET' && (
              <Field label="Segundo nombre">
                <input value={form.middleName} onChange={e => updateField('middleName', e.target.value)} style={inputStyle} />
              </Field>
            )}
            {form.nodeKind !== 'PET' && (
              <Field label="Apellido" required>
                <input value={form.lastName} onChange={e => updateField('lastName', e.target.value)} style={inputStyle} />
              </Field>
            )}
            {form.nodeKind !== 'PET' && (
              <Field label="Apellido de nacimiento 1">
                <input value={form.birthSurname1} onChange={e => updateField('birthSurname1', e.target.value)} style={inputStyle} />
              </Field>
            )}
            {form.nodeKind !== 'PET' && (
              <Field label="Apellido de nacimiento 2">
                <input value={form.birthSurname2} onChange={e => updateField('birthSurname2', e.target.value)} style={inputStyle} />
              </Field>
            )}
            <Field label="Fecha de nacimiento">
              <input type="date" value={form.birthDate} onChange={e => updateField('birthDate', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Fecha de fallecimiento">
              <input type="date" value={form.deathDate} onChange={e => updateField('deathDate', e.target.value)} style={inputStyle} />
            </Field>
            <Field label={form.nodeKind === 'PET' ? 'Lugar de origen' : 'Lugar de nacimiento'}>
              <input value={form.birthPlace} onChange={e => updateField('birthPlace', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Género">
              <select value={form.gender} onChange={e => updateField('gender', e.target.value as PersonFormData['gender'])} style={inputStyle}>
                <option value="UNKNOWN">No especificado</option>
                <option value="MALE">{form.nodeKind === 'PET' ? 'Macho' : 'Masculino'}</option>
                <option value="FEMALE">{form.nodeKind === 'PET' ? 'Hembra' : 'Femenino'}</option>
                {form.nodeKind !== 'PET' && <option value="OTHER">Otro</option>}
              </select>
            </Field>
            <Field label={form.nodeKind === 'PET' ? 'Dueño 1' : 'Padre'} help={form.nodeKind === 'PET' ? 'Primera persona responsable de la mascota.' : 'Padre biológico o adoptivo registrado en el árbol.'}>
              <select
                value={form.fatherId}
                onChange={e => updateField('fatherId', e.target.value)}
                style={canChangeRel ? inputStyle : disabledInputStyle}
                disabled={!canChangeRel}
              >
                <option value="">Sin asignar</option>
                {parentOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label={form.nodeKind === 'PET' ? 'Dueño 2' : 'Madre'} help={form.nodeKind === 'PET' ? 'Segunda persona responsable de la mascota.' : 'Madre biológica o adoptiva registrada en el árbol.'}>
              <select
                value={form.motherId}
                onChange={e => updateField('motherId', e.target.value)}
                style={canChangeRel ? inputStyle : disabledInputStyle}
                disabled={!canChangeRel}
              >
                <option value="">Sin asignar</option>
                {parentOptions.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ marginTop: 18 }}>
            <Field label="Bio" help={form.nodeKind === 'PET' ? 'Historia o descripción de la mascota. Máximo 5000 caracteres.' : 'Texto libre sobre la persona. Aparece en el panel lateral (resumido) y en su perfil completo. Máximo 5000 caracteres.'}>
              <textarea
                value={form.bio}
                onChange={e => updateField('bio', e.target.value)}
                style={{ ...inputStyle, minHeight: 140, resize: 'vertical' }}
              />
            </Field>
          </div>

          {isAdmin && mode === 'edit' && (
            <div style={{ marginTop: 18 }}>
              <label style={{ display: 'inline-flex', gap: 10, alignItems: 'center', color: '#5A615C', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={form.isCore}
                  onChange={e => updateField('isCore', e.target.checked)}
                />
                Proteger como tronco central del arbol
                <HelpTooltip
                  text="Las personas marcadas como tronco central no pueden ser eliminadas accidentalmente. Útil para los fundadores del árbol."
                  position="top"
                  maxWidth={260}
                />
              </label>
            </div>
          )}

          {showAffiliation && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #E7E1D8' }}>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6B6B6B' }}>
                Esta persona no tiene padre ni madre conocidos. Puedes afiliarla a una unidad familiar para mantener la conexión.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18 }}>
                <Field label="Unidad familiar" help="Agrupa esta persona con una familia cuando no tiene padre/madre directo conocido en el árbol.">
                  <select
                    value={form.unitAffiliationId}
                    onChange={e => {
                      updateField('unitAffiliationId', e.target.value)
                      if (!e.target.value) {
                        updateField('claimedRelation', '')
                        updateField('claimedRelationOfId', '')
                      }
                    }}
                    style={inputStyle}
                  >
                    <option value="">Sin afiliar</option>
                    {payload.managedUnits.map(u => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                </Field>
                {form.unitAffiliationId && (
                  <Field label="Tipo de relación con la unidad">
                    <select
                      value={form.claimedRelation}
                      onChange={e => {
                        updateField('claimedRelation', e.target.value)
                        updateField('claimedRelationOfId', '')
                      }}
                      style={inputStyle}
                    >
                      <option value="">Sin especificar</option>
                      {(Object.entries(CLAIMED_RELATION_LABELS) as [ClaimedRelation, string][]).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {form.unitAffiliationId &&
                  form.claimedRelation &&
                  CLAIMED_RELATION_REQUIRES_REF.has(form.claimedRelation as ClaimedRelation) && (
                  <Field label="Relación con persona de la unidad">
                    <select
                      value={form.claimedRelationOfId}
                      onChange={e => updateField('claimedRelationOfId', e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Seleccionar...</option>
                      {parentOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
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
              {submitLabel}
            </button>
            <span style={{ fontSize: 12, color: '#7A847E' }}>{submitHint}</span>
            {mode === 'edit' && !isMember && (
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

        {mode === 'edit' && isAdmin && (
          <section style={cardStyle}>
            <div style={{ marginBottom: 18 }}>
              <h2 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 22, color: '#2D4A3E' }}>Pareja / Cónyuge</h2>
              <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>
                Registra relaciones de pareja explícitas (matrimonio o convivencia).
              </p>
            </div>

            {relationships.length > 0 && (
              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                {relationships.map(rel => (
                  <div key={rel.id} style={{ padding: '10px 14px', background: '#F8F5EE', borderRadius: 3, border: '1px solid #E0DAD0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: rel.endDate !== undefined ? 8 : 0 }}>
                      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B9E94', minWidth: 60 }}>
                        {rel.type === 'SPOUSE' ? 'Cónyuge' : 'Pareja'}
                      </span>
                      <span style={{ fontSize: 14, color: '#2C2C2C', flex: 1 }}>{rel.partnerName}</span>
                      {rel.endDate && (
                        <span style={{ fontSize: 11, color: '#8B9E94' }}>Fin: {rel.endDate}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveRelationship(rel.id)}
                        disabled={isPending}
                        style={{ border: '1px solid #E6C1C1', background: '#FFF5F5', color: '#8B4444', borderRadius: 2, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
                      >
                        Eliminar
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ fontSize: 11, color: '#8B9E94', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                        Fecha de separación
                      </label>
                      <input
                        type="date"
                        defaultValue={rel.endDate ?? ''}
                        onChange={e => {
                          const val = e.target.value || null
                          startTransition(async () => {
                            const result = await setRelationshipEndDate({ relationshipId: rel.id, personId: form.id, endDate: val })
                            if (!result.ok) setError(result.error)
                            else setRelationships(prev => prev.map(r => r.id === rel.id ? { ...r, endDate: val } : r))
                          })
                        }}
                        style={{ ...inputStyle, width: 160, padding: '6px 10px', fontSize: 13 }}
                      />
                      {rel.endDate && (
                        <button
                          type="button"
                          onClick={() => {
                            startTransition(async () => {
                              const result = await setRelationshipEndDate({ relationshipId: rel.id, personId: form.id, endDate: null })
                              if (!result.ok) setError(result.error)
                              else setRelationships(prev => prev.map(r => r.id === rel.id ? { ...r, endDate: null } : r))
                            })
                          }}
                          disabled={isPending}
                          style={{ border: '1px solid #E0DAD0', background: '#fff', borderRadius: 2, color: '#6B6B6B', padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}
                        >
                          Quitar fecha
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 10, alignItems: 'end' }}>
              <Field label="Tipo">
                <select value={newPartnerType} onChange={e => setNewPartnerType(e.target.value as 'SPOUSE' | 'PARTNER')} style={inputStyle}>
                  <option value="SPOUSE">Cónyuge</option>
                  <option value="PARTNER">Pareja</option>
                </select>
              </Field>
              <Field label="Persona">
                <select
                  value={newPartnerId}
                  onChange={e => setNewPartnerId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Seleccionar...</option>
                  {payload.candidates
                    .filter(c => !relationships.some(r => r.partnerId === c.id))
                    .map(c => (
                      <option key={c.id} value={c.id}>{getPersonDisplayName(c)}</option>
                    ))}
                </select>
              </Field>
              <button
                type="button"
                onClick={handleAddRelationship}
                disabled={isPending || !newPartnerId}
                style={{ border: '1px solid #C8D4CE', background: '#F8F5EE', color: '#2D4A3E', borderRadius: 2, padding: '11px 14px', cursor: 'pointer', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}
              >
                Añadir
              </button>
            </div>
          </section>
        )}

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
                  cursor: uploadTotal > 0 ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: uploadTotal > 0 ? '#8B9E94' : '#2D4A3E',
                  background: uploadTotal > 0 ? '#F4F1EC' : '#F8F5EE',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {uploadTotal > 0 ? `Subiendo ${uploadCount}/${uploadTotal}...` : 'Subir fotos'}
                <input type="file" accept="image/*" multiple hidden disabled={uploadTotal > 0} onChange={e => handleUpload(e.target.files)} />
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

function Field({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <label>
      <span style={{ ...labelStyle, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {label}
        {required && <span style={{ color: '#9B4444' }}>*</span>}
        {help && <HelpTooltip text={help} position="top" maxWidth={240} />}
      </span>
      {children}
    </label>
  )
}
