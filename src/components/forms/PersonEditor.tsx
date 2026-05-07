'use client'

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createPerson, createRelationship, deleteRelationship, deletePerson, setParentChild, setPersonCoverPhoto, setRelationshipEndDate, setRelationshipStartDate, updatePerson } from '@/app/actions/people'
import { proposePeopleUpdate, proposeNewPerson } from '@/app/actions/proposals'
import { uploadMedia, deleteMedia } from '@/app/actions/media'
import { CLAIMED_RELATION_LABELS, CLAIMED_RELATION_REQUIRES_REF, pickMediaUrl } from '@/lib/content-types'
import type { ClaimedRelation, MediaItem, PersonEditorPayload, PersonFormData, RelationshipItem } from '@/lib/content-types'
import { getPersonDisplayName } from '@/lib/person-name'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import { ConfirmButton } from '@/components/ui/ConfirmButton'

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
  fontSize: 13,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#6B7B70',
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
    fatherKind: '',
    motherKind: '',
    coverPhoto: '',
    isCore: false,
    unitAffiliationId: '',
    claimedRelation: '',
    claimedRelationOfId: '',
  }
}

export interface PersonEditorPrefill {
  /** El nuevo se crea como hijo/a de este target (target = padre/madre) */
  childOf?:   string
  /** El nuevo se crea como padre/madre de este target (target = hijo/a) */
  parentOf?:  string
  /** El nuevo se crea como hermano/a de este target (mismos padres) */
  siblingOf?: string
  /** El nuevo se crea como pareja de este target */
  partnerOf?: string
  /** Cuando viene parentOf: rol del nuevo respecto al hijo */
  asParent?:  'father' | 'mother'
}

export function PersonEditor({
  payload,
  mode,
  defaultNodeKind = 'PERSON',
  prefill,
}: {
  payload: PersonEditorPayload
  mode: 'create' | 'edit'
  defaultNodeKind?: 'PERSON' | 'PET'
  prefill?: PersonEditorPrefill
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<PersonFormData>(() => {
    if (payload.person) return payload.person
    const base = { ...emptyForm(), nodeKind: defaultNodeKind }
    // Prefill desde URL params del menú radial del árbol:
    // childOf → el nuevo es hijo del target (target = padre o madre)
    if (prefill?.childOf) {
      const parent = payload.candidates.find(c => c.id === prefill.childOf)
      if (parent) {
        if (parent.gender === 'FEMALE') { base.motherId = parent.id; base.motherKind = 'BIOLOGICAL' }
        else                            { base.fatherId = parent.id; base.fatherKind = 'BIOLOGICAL' }
      }
    }
    return base
  })
  const [media, setMedia] = useState<MediaItem[]>(payload.media)
  const [relationships, setRelationships] = useState<RelationshipItem[]>(payload.relationships)
  const [newPartnerType, setNewPartnerType] = useState<'SPOUSE' | 'PARTNER' | 'SIBLING'>('SPOUSE')
  const [newPartnerId, setNewPartnerId] = useState('')
  const [newPartnerStartDate, setNewPartnerStartDate] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadCount, setUploadCount] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)

  const initialFormRef = useRef<string>(JSON.stringify(payload.person ?? { ...emptyForm(), nodeKind: defaultNodeKind }))
  const isDirty = JSON.stringify(form) !== initialFormRef.current

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirty) return
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  // Si vinimos por "sibling-of" desde el menú radial, copiar los padres del
  // hermano al form en cuanto montamos. Esto replica la lógica del auto-fill
  // en el onChange del select.
  useEffect(() => {
    if (mode !== 'create' || !prefill?.siblingOf) return
    const sib = payload.candidates.find(c => c.id === prefill.siblingOf)
    if (!sib) return
    setForm(prev => ({
      ...prev,
      fatherId: sib.fatherId ?? '',
      motherId: sib.motherId ?? '',
      fatherKind: sib.fatherId ? 'BIOLOGICAL' : '',
      motherKind: sib.motherId ? 'BIOLOGICAL' : '',
    }))
    // Reseteamos al monte; no corre de nuevo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Quick connection (create mode only)
  const [quickRelType, setQuickRelType] = useState<'' | 'child-of' | 'sibling-of' | 'parent-of' | 'partner-of'>(() => {
    if (prefill?.parentOf)  return 'parent-of'
    if (prefill?.siblingOf) return 'sibling-of'
    if (prefill?.partnerOf) return 'partner-of'
    return ''
  })
  const [quickTargetId, setQuickTargetId] = useState<string>(() => prefill?.parentOf ?? prefill?.siblingOf ?? prefill?.partnerOf ?? '')
  const [quickParentRole, setQuickParentRole] = useState<'father' | 'mother'>(prefill?.asParent ?? 'father')
  const [quickPartnerType, setQuickPartnerType] = useState<'SPOUSE' | 'PARTNER'>('SPOUSE')
  // Track whether surname fields were manually touched
  const [birthSurname1Touched, setBirthSurname1Touched] = useState(mode === 'edit' && !!form.birthSurname1)
  const [birthSurname2Touched, setBirthSurname2Touched] = useState(mode === 'edit' && !!form.birthSurname2)
  const [lastNameTouched, setLastNameTouched] = useState(mode === 'edit' && !!form.lastName)

  const isMember = payload.viewerMode === 'MEMBER'
  const isAdmin = payload.viewerMode === 'ADMIN'
  const canChangeRel = payload.canChangeRelationships

  const isFloating = !form.fatherId && !form.motherId
  const showAffiliation = canChangeRel && payload.managedUnits.length > 0 && isFloating

  const isPet = form.nodeKind === 'PET'
  const title = mode === 'create'
    ? (isPet ? 'Nueva mascota' : 'Nueva persona')
    : (isPet ? 'Editar mascota' : 'Editar persona')
  const personPath = form.id ? `/${payload.familySlug}/person/${form.id}` : `/${payload.familySlug}/tree`

  const parentOptions = useMemo(
    () => [...payload.candidates]
      .filter(person => person.nodeKind !== 'PET')
      .map(person => ({ ...person, label: getPersonDisplayName(person) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [payload.candidates]
  )

  // Auto-derive individual surnames from parents
  const autoSurname1 = useMemo(() => {
    const father = parentOptions.find(p => p.id === form.fatherId)
    return father?.lastName?.split(' ')[0] ?? ''
  }, [form.fatherId, parentOptions])

  const autoSurname2 = useMemo(() => {
    const mother = parentOptions.find(p => p.id === form.motherId)
    return mother?.lastName?.split(' ')[0] ?? ''
  }, [form.motherId, parentOptions])

  // In CREATE mode: apply auto surnames to birthSurname1/2 when parents change
  useEffect(() => {
    if (mode !== 'create') return
    if (!birthSurname1Touched && autoSurname1) {
      setForm(prev => ({ ...prev, birthSurname1: autoSurname1 }))
    }
  }, [autoSurname1, birthSurname1Touched, mode])

  useEffect(() => {
    if (mode !== 'create') return
    if (!birthSurname2Touched && autoSurname2) {
      setForm(prev => ({ ...prev, birthSurname2: autoSurname2 }))
    }
  }, [autoSurname2, birthSurname2Touched, mode])

  // Combined auto last name (used in EDIT mode)
  const autoLastName = useMemo(() => {
    const father = parentOptions.find(p => p.id === form.fatherId)
    const mother = parentOptions.find(p => p.id === form.motherId)
    if (!father && !mother) return ''
    const parts = [father?.lastName?.split(' ')[0], mother?.lastName?.split(' ')[0]].filter(Boolean)
    return parts.join(' ')
  }, [form.fatherId, form.motherId, parentOptions])

  // In EDIT mode: apply auto lastName when parents change
  useEffect(() => {
    if (mode === 'edit' && !lastNameTouched && autoLastName) {
      setForm(prev => ({ ...prev, lastName: autoLastName }))
    }
  }, [autoLastName, lastNameTouched, mode])

  // Couple inference: build map personId → known partner from children's parent data
  const coupleMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of payload.candidates) {
      if (p.fatherId && p.motherId) {
        if (!map.has(p.fatherId)) map.set(p.fatherId, p.motherId)
        if (!map.has(p.motherId)) map.set(p.motherId, p.fatherId)
      }
    }
    return map
  }, [payload.candidates])

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
        // Pre-fill parent fields from quick connections
        const formToSend = { ...form }
        // In create mode, lastName is derived from the two biological surnames
        if (!formToSend.lastName) {
          formToSend.lastName = [formToSend.birthSurname1, formToSend.birthSurname2].filter(Boolean).join(' ')
        }
        if (quickRelType === 'child-of' && quickTargetId) {
          const target = parentOptions.find(p => p.id === quickTargetId)
          const role = target?.gender === 'MALE' ? 'fatherId' : target?.gender === 'FEMALE' ? 'motherId' : quickParentRole === 'father' ? 'fatherId' : 'motherId'
          formToSend[role] = quickTargetId
        }
        // sibling-of: parents are already pre-filled in form state by the UI

        // MEMBER users submit as proposal, not direct creation
        if (isMember) {
          const result = await proposeNewPerson({
            firstName: formToSend.firstName,
            lastName:  formToSend.lastName || undefined,
            middleName: formToSend.middleName || undefined,
            gender:    formToSend.gender !== 'UNKNOWN' ? formToSend.gender as import('@prisma/client').Gender : undefined,
            birthDate: formToSend.birthDate || undefined,
            deathDate: formToSend.deathDate || undefined,
            birthPlace: formToSend.birthPlace || undefined,
            nodeKind:  formToSend.nodeKind,
            notes:     formToSend.bio || undefined,
            fatherId:  formToSend.fatherId || undefined,
            motherId:  formToSend.motherId || undefined,
          })
          if (!result.ok) { setError(result.error); return }
          setMessage('Propuesta enviada. Un administrador la revisará y añadirá la persona al árbol.')
          return
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
            id:        result.data.id,
            url:       result.data.url,
            thumbUrl:  null,
            mediumUrl: null,
            largeUrl:  null,
            alt:       null,
            caption:   null,
            featured:  false,
            order:     prev.length,
            mimeType:  file.type,
            width:     null,
            height:    null,
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
      const startDate = newPartnerType !== 'SIBLING' && newPartnerStartDate ? newPartnerStartDate : null
      const result = await createRelationship({ personId: form.id, partnerId: newPartnerId, type: newPartnerType, startDate })
      if (!result.ok) { setError(result.error); return }
      const partner = payload.candidates.find(c => c.id === newPartnerId)
      if (partner) {
        setRelationships(prev => [...prev, {
          id: result.data.id,
          type: newPartnerType,
          partnerId: newPartnerId,
          partnerName: getPersonDisplayName(partner),
          startDate,
          endDate: null,
        }])
      }
      setNewPartnerId('')
      setNewPartnerStartDate('')
      setMessage('Relación de pareja añadida.')
    })
  }

  function handleRemoveRelationship(relId: string) {
    if (!form.id) return
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

  const isProposalMode = isMember && (mode === 'edit' || mode === 'create')
  const submitLabel = isPending
    ? (isProposalMode ? 'Enviando...' : 'Guardando...')
    : mode === 'create'
      ? (isMember ? (isPet ? 'Sugerir mascota' : 'Sugerir persona') : (isPet ? 'Crear mascota' : 'Crear persona'))
      : isMember ? 'Enviar propuesta' : 'Guardar cambios'

  const submitHint = isMember && mode === 'edit'
    ? 'Los cambios serán revisados antes de aplicarse.'
    : isMember && mode === 'create'
      ? `Tu sugerencia será revisada por un administrador antes de añadirse al árbol.`
      : mode === 'create'
        ? `Completa los datos y ${isPet ? 'crea la mascota' : 'crea la persona'}.`
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
              ? `Crea ${isPet ? 'una mascota nueva' : 'una persona nueva'} y luego podrás subir sus fotos y elegir la portada.`
              : isMember
                ? 'Propone cambios en los datos biográficos. Un administrador los revisará antes de aplicarlos.'
                : `Actualiza los datos ${isPet ? 'de la mascota' : 'centrales, parentesco'} y foto principal.`}
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
            + Nuevo
          </Link>
        )}
      </div>

      <div style={{ display: 'grid', gap: 22 }}>

        {mode === 'create' && form.nodeKind !== 'PET' && (
          <section style={cardStyle}>
            <p style={{ margin: '0 0 16px', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B9E94', fontFamily: 'Georgia, serif' }}>
              Conexión inicial
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: quickRelType ? 16 : 0 }}>
              {(['', 'child-of', 'sibling-of', 'parent-of', 'partner-of'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setQuickRelType(type)
                    setQuickTargetId('')
                    // Clear parent pre-fills when switching away from sibling-of
                    if (type !== 'sibling-of') {
                      setForm(prev => ({ ...prev, fatherId: '', motherId: '' }))
                      setLastNameTouched(false)
                      setBirthSurname1Touched(false)
                      setBirthSurname2Touched(false)
                    }
                  }}
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
                  {type === '' ? 'Sin conexión'
                    : type === 'child-of' ? 'Hijo/a de…'
                    : type === 'sibling-of' ? 'Hermano/a de…'
                    : type === 'parent-of' ? 'Padre/Madre de…'
                    : 'Pareja de…'}
                </button>
              ))}
            </div>

            {quickRelType === 'child-of' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                <Field label="Esta persona es hijo/a de">
                  <SearchablePersonSelect
                    value={quickTargetId}
                    onChange={setQuickTargetId}
                    options={parentOptions}
                    placeholder="Seleccionar padre o madre..."
                  />
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

            {quickRelType === 'sibling-of' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label="Esta persona es hermano/a de">
                  <SearchablePersonSelect
                    value={quickTargetId}
                    onChange={id => {
                      setQuickTargetId(id)
                      // Auto-fill parents from selected sibling
                      const sib = parentOptions.find(p => p.id === id)
                      if (sib) {
                        setForm(prev => ({
                          ...prev,
                          fatherId: sib.fatherId ?? '',
                          motherId: sib.motherId ?? '',
                          // El hermano comparte padres biológicos por default;
                          // si la persona tiene una relación distinta puede
                          // cambiarla luego en la UI.
                          fatherKind: sib.fatherId ? 'BIOLOGICAL' : '',
                          motherKind: sib.motherId ? 'BIOLOGICAL' : '',
                        }))
                        setLastNameTouched(false)
                        setBirthSurname1Touched(false)
                        setBirthSurname2Touched(false)
                      }
                    }}
                    options={parentOptions}
                    placeholder="Seleccionar hermano/a..."
                  />
                </Field>
                {quickTargetId && (
                  <p style={{ margin: 0, fontSize: 12, color: '#6B6B6B' }}>
                    Se usarán los mismos padres que {parentOptions.find(p => p.id === quickTargetId)?.label}.
                    Puedes ajustarlos en la sección de parentesco abajo.
                  </p>
                )}
              </div>
            )}

            {quickRelType === 'parent-of' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                <Field label="Esta persona es padre/madre de">
                  <SearchablePersonSelect
                    value={quickTargetId}
                    onChange={setQuickTargetId}
                    options={parentOptions}
                    placeholder="Seleccionar hijo/a..."
                  />
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
                  <SearchablePersonSelect
                    value={quickTargetId}
                    onChange={setQuickTargetId}
                    options={parentOptions}
                    placeholder="Seleccionar pareja..."
                  />
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
            {/* CREATE mode: show individual biological surnames, not combined lastName */}
            {form.nodeKind !== 'PET' && mode === 'create' && (
              <Field
                label="Apellido paterno"
                help={autoSurname1 && !birthSurname1Touched ? 'Auto-derivado del padre. Edita para cambiar.' : 'Primer apellido (paternal).'}
              >
                <input
                  value={form.birthSurname1}
                  onChange={e => { setBirthSurname1Touched(true); updateField('birthSurname1', e.target.value) }}
                  style={{ ...inputStyle, background: autoSurname1 && !birthSurname1Touched ? '#F3F7F4' : '#FFFCF8' }}
                  placeholder={autoSurname1 || 'Ej: Apellido1'}
                />
              </Field>
            )}
            {form.nodeKind !== 'PET' && mode === 'create' && (
              <Field
                label="Apellido materno"
                help={autoSurname2 && !birthSurname2Touched ? 'Auto-derivado de la madre. Edita para cambiar.' : 'Segundo apellido (maternal).'}
              >
                <input
                  value={form.birthSurname2}
                  onChange={e => { setBirthSurname2Touched(true); updateField('birthSurname2', e.target.value) }}
                  style={{ ...inputStyle, background: autoSurname2 && !birthSurname2Touched ? '#F3F7F4' : '#FFFCF8' }}
                  placeholder={autoSurname2 || 'Ej: Apellido2'}
                />
              </Field>
            )}
            {/* EDIT mode: show combined lastName + individual birth surnames */}
            {form.nodeKind !== 'PET' && mode === 'edit' && (
              <Field
                label="Apellidos"
                required
                help={autoLastName && !lastNameTouched ? 'Auto-derivado de los padres. Edita para personalizar.' : 'Apellido(s) de la persona tal como aparecen en el árbol.'}
              >
                <input
                  value={form.lastName}
                  onChange={e => { setLastNameTouched(true); updateField('lastName', e.target.value) }}
                  style={{ ...inputStyle, background: autoLastName && !lastNameTouched ? '#F3F7F4' : '#FFFCF8' }}
                  placeholder={autoLastName || 'Ej: Apellido1 Apellido2'}
                />
              </Field>
            )}
            {form.nodeKind !== 'PET' && mode === 'edit' && (
              <Field label="Apellido de nacimiento 1">
                <input value={form.birthSurname1} onChange={e => updateField('birthSurname1', e.target.value)} style={inputStyle} />
              </Field>
            )}
            {form.nodeKind !== 'PET' && mode === 'edit' && (
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
            <Field label={form.nodeKind === 'PET' ? 'Dueño/a' : 'Padre'} help={form.nodeKind === 'PET' ? 'Persona responsable de la mascota. La mascota orbitará su nodo en el árbol.' : 'Padre biológico o adoptivo registrado en el árbol.'}>
              <SearchablePersonSelect
                value={form.fatherId}
                onChange={id => {
                  updateField('fatherId', id)
                  if (!id) updateField('fatherKind', '')
                  else if (!form.fatherKind) updateField('fatherKind', 'BIOLOGICAL')
                  if (id && !form.motherId) {
                    const inferred = coupleMap.get(id)
                    if (inferred) {
                      updateField('motherId', inferred)
                      if (!form.motherKind) updateField('motherKind', 'BIOLOGICAL')
                    }
                  }
                  setBirthSurname1Touched(false)
                  setLastNameTouched(false)
                }}
                options={parentOptions}
                placeholder="Sin asignar"
                disabled={!canChangeRel}
              />
            </Field>
            {form.nodeKind !== 'PET' && form.fatherId && (
              <Field label="Tipo de vínculo (padre)" help="Biológico = sangre. Adoptivo = adopción legal. Padrastro = pareja del padre/madre biológico, sin adopción.">
                <select
                  value={form.fatherKind || 'BIOLOGICAL'}
                  onChange={e => updateField('fatherKind', e.target.value as PersonFormData['fatherKind'])}
                  style={inputStyle}
                  disabled={!canChangeRel}
                >
                  <option value="BIOLOGICAL">Biológico</option>
                  <option value="ADOPTIVE">Adoptivo</option>
                  <option value="STEP">Padrastro</option>
                </select>
              </Field>
            )}
            {form.nodeKind !== 'PET' && (
              <Field label="Madre" help="Madre biológica o adoptiva registrada en el árbol.">
                <SearchablePersonSelect
                  value={form.motherId}
                  onChange={id => {
                    updateField('motherId', id)
                    if (!id) updateField('motherKind', '')
                    else if (!form.motherKind) updateField('motherKind', 'BIOLOGICAL')
                    if (id && !form.fatherId) {
                      const inferred = coupleMap.get(id)
                      if (inferred) {
                        updateField('fatherId', inferred)
                        if (!form.fatherKind) updateField('fatherKind', 'BIOLOGICAL')
                      }
                    }
                    setBirthSurname2Touched(false)
                    setLastNameTouched(false)
                  }}
                  options={parentOptions}
                  placeholder="Sin asignar"
                  disabled={!canChangeRel}
                />
              </Field>
            )}
            {form.nodeKind !== 'PET' && form.motherId && (
              <Field label="Tipo de vínculo (madre)" help="Biológico = sangre. Adoptivo = adopción legal. Madrastra = pareja del padre/madre biológico, sin adopción.">
                <select
                  value={form.motherKind || 'BIOLOGICAL'}
                  onChange={e => updateField('motherKind', e.target.value as PersonFormData['motherKind'])}
                  style={inputStyle}
                  disabled={!canChangeRel}
                >
                  <option value="BIOLOGICAL">Biológico</option>
                  <option value="ADOPTIVE">Adoptivo</option>
                  <option value="STEP">Madrastra</option>
                </select>
              </Field>
            )}
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
                    <SearchablePersonSelect
                      value={form.claimedRelationOfId}
                      onChange={id => updateField('claimedRelationOfId', id)}
                      options={parentOptions}
                      placeholder="Seleccionar..."
                    />
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
                padding: '12px 20px',
                cursor: 'pointer',
                fontSize: 15,
              }}
            >
              {submitLabel}
            </button>
            <span style={{ fontSize: 13, color: '#7A847E' }}>{submitHint}</span>
            {mode === 'edit' && !isMember && (
              <ConfirmButton
                label="Eliminar persona"
                confirmLabel="¿Seguro? No se puede deshacer"
                onConfirm={handleDeletePerson}
                disabled={isPending}
                style={{ padding: '12px 20px', fontSize: 15, borderRadius: 2 }}
              />
            )}
          </div>
        </section>

        {mode === 'edit' && isAdmin && form.nodeKind !== 'PET' && (
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: rel.type !== 'SIBLING' ? 8 : 0 }}>
                      <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B9E94', minWidth: 60 }}>
                        {rel.type === 'SPOUSE' ? 'Cónyuge' : rel.type === 'SIBLING' ? 'Hermano/a' : 'Pareja'}
                      </span>
                      <span style={{ fontSize: 14, color: '#2C2C2C', flex: 1 }}>{rel.partnerName}</span>
                      <ConfirmButton
                        label="Eliminar"
                        confirmLabel="¿Seguro?"
                        onConfirm={() => handleRemoveRelationship(rel.id)}
                        disabled={isPending}
                        style={{ padding: '4px 10px', fontSize: 13, borderRadius: 2 }}
                      />
                    </div>
                    {rel.type !== 'SIBLING' && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 11, color: '#8B9E94', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', minWidth: 150 }}>
                          {rel.type === 'SPOUSE' ? 'Fecha de matrimonio' : 'Fecha de unión'}
                        </label>
                        <input
                          type="date"
                          defaultValue={rel.startDate ?? ''}
                          onChange={e => {
                            const val = e.target.value || null
                            startTransition(async () => {
                              const result = await setRelationshipStartDate({ relationshipId: rel.id, personId: form.id, startDate: val })
                              if (!result.ok) setError(result.error)
                              else setRelationships(prev => prev.map(r => r.id === rel.id ? { ...r, startDate: val } : r))
                            })
                          }}
                          style={{ ...inputStyle, width: 160, padding: '6px 10px', fontSize: 13 }}
                        />
                        {rel.startDate && (
                          <button
                            type="button"
                            onClick={() => {
                              startTransition(async () => {
                                const result = await setRelationshipStartDate({ relationshipId: rel.id, personId: form.id, startDate: null })
                                if (!result.ok) setError(result.error)
                                else setRelationships(prev => prev.map(r => r.id === rel.id ? { ...r, startDate: null } : r))
                              })
                            }}
                            disabled={isPending}
                            style={{ border: '1px solid #E0DAD0', background: '#fff', borderRadius: 2, color: '#6B6B6B', padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}
                          >
                            Quitar fecha
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 11, color: '#8B9E94', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', minWidth: 150 }}>
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
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 170px auto', gap: 10, alignItems: 'end' }}>
              <Field label="Tipo">
                <select value={newPartnerType} onChange={e => setNewPartnerType(e.target.value as 'SPOUSE' | 'PARTNER' | 'SIBLING')} style={inputStyle}>
                  <option value="SPOUSE">Cónyuge</option>
                  <option value="PARTNER">Pareja</option>
                  <option value="SIBLING">Hermano/a</option>
                </select>
              </Field>
              <Field label="Persona">
                <SearchablePersonSelect
                  value={newPartnerId}
                  onChange={setNewPartnerId}
                  options={parentOptions.filter(c => !relationships.some(r => r.partnerId === c.id))}
                  placeholder="Seleccionar..."
                />
              </Field>
              {newPartnerType !== 'SIBLING' ? (
                <Field label={newPartnerType === 'SPOUSE' ? 'Fecha matrimonio' : 'Fecha unión'}>
                  <input
                    type="date"
                    value={newPartnerStartDate}
                    onChange={e => setNewPartnerStartDate(e.target.value)}
                    style={inputStyle}
                  />
                </Field>
              ) : <div />}
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
                  <img src={pickMediaUrl(item, 'medium')} alt={item.alt ?? ''} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
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
                    <ConfirmButton
                      label="Eliminar foto"
                      confirmLabel="¿Seguro?"
                      onConfirm={() => handleDeleteMedia(item.id)}
                      style={{ padding: '8px 10px', fontSize: 13, borderRadius: 2 }}
                    />
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

// ── Searchable person selector ──────────────────────────────────────────────
function SearchablePersonSelect({
  value,
  onChange,
  options,
  placeholder = 'Sin asignar',
  disabled = false,
}: {
  value: string
  onChange: (id: string) => void
  options: { id: string; label: string }[]
  placeholder?: string
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const lq = query.toLowerCase()
    return lq ? options.filter(o => o.label.toLowerCase().includes(lq)) : options
  }, [options, query])

  const selected = options.find(o => o.id === value)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const base = disabled ? disabledInputStyle : inputStyle

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        style={{ ...base, display: 'flex', alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none' }}
        onClick={() => {
          if (disabled) return
          const next = !open
          setOpen(next)
          if (next) setTimeout(() => inputRef.current?.focus(), 10)
        }}
      >
        <span style={{ flex: 1, color: selected ? '#2C2C2C' : '#9B9490', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? placeholder}
        </span>
        <span style={{ fontSize: 10, color: '#8B9E94', flexShrink: 0 }}>▾</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          background: '#fff', border: '1px solid #D8D3CA',
          borderRadius: '0 0 3px 3px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column', maxHeight: 240,
        }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ padding: '8px 10px', border: 'none', borderBottom: '1px solid #E0DAD0', fontSize: 13, outline: 'none', flexShrink: 0 }}
            placeholder="Buscar…"
            onClick={e => e.stopPropagation()}
          />
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div
              style={{ padding: '8px 12px', fontSize: 13, color: '#9B9490', cursor: 'pointer' }}
              onMouseDown={e => { e.preventDefault(); onChange(''); setOpen(false); setQuery('') }}
            >
              — Sin asignar
            </div>
            {filtered.map(o => (
              <div
                key={o.id}
                style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', background: o.id === value ? '#F3F7F4' : 'transparent', color: '#2C2C2C' }}
                onMouseDown={e => { e.preventDefault(); onChange(o.id); setOpen(false); setQuery('') }}
              >
                {o.label}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: 12, color: '#9B9490' }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
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
