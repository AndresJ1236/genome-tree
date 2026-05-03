'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  bulkCreatePeopleJson,
  createAccessRule,
  createInviteLink,
  createManagedFamilyUnit,
  createPasswordResetLink,
  deleteAccessRule,
  importRelationsJson,
  previewManagedFamilyUnit,
  previewRelationsImport,
  updateFamilyConfig,
  updateManagedFamilyUnit,
  updateUserAccess,
} from '@/app/actions/admin'
import { approveProposal, rejectProposal } from '@/app/actions/proposals'
import type {
  AccessEffect,
  AccessPermission,
  AdminDashboardData,
  FamilyConfigData,
  ManagedFamilyUnitPreviewPerson,
  PersonProposalItem,
  RelationsImportPreview,
  UserScope,
  UserRole,
} from '@/lib/content-types'
import { getPersonDisplayName } from '@/lib/person-name'

type AdminTab =
  | 'usuarios'
  | 'nucleos'
  | 'propuestas'
  | 'permisos'
  | 'modulos'
  | 'importar'
  | 'invitaciones'
  | 'auditoria'

type ManagedUnitFormPayload = {
  label: string
  parentAId: string
  parentBId: string
  representativeUserId: string
  primarySurname: string
  secondarySurname: string
  canInviteUsers: boolean
  canEditPeople: boolean
  canManageContent: boolean
  canViewAudit: boolean
}

function formDataToManagedUnitPayload(formData: FormData): ManagedUnitFormPayload {
  return {
    label: String(formData.get('label') ?? ''),
    parentAId: String(formData.get('parentAId') ?? ''),
    parentBId: String(formData.get('parentBId') ?? ''),
    representativeUserId: String(formData.get('representativeUserId') ?? ''),
    primarySurname: String(formData.get('primarySurname') ?? ''),
    secondarySurname: String(formData.get('secondarySurname') ?? ''),
    canInviteUsers: formData.get('canInviteUsers') === 'on',
    canEditPeople: formData.get('canEditPeople') === 'on',
    canManageContent: formData.get('canManageContent') === 'on',
    canViewAudit: formData.get('canViewAudit') === 'on',
  }
}

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [config, setConfig] = useState<FamilyConfigData>(data.config)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState<string>('MEMBER')
  const [inviteScope, setInviteScope] = useState<string>('FAMILY')
  const [inviteBranchRootId, setInviteBranchRootId] = useState<string>('')
  const [invitePersonId, setInvitePersonId] = useState<string>('')
  const [relationsJsonText, setRelationsJsonText] = useState('')
  const [importPreview, setImportPreview] = useState<RelationsImportPreview | null>(null)
  const [bulkJsonText, setBulkJsonText] = useState('')
  const [bulkResult, setBulkResult] = useState<{ created: number; updated: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ label: string; managedPeople: ManagedFamilyUnitPreviewPerson[] } | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [resetLinks, setResetLinks] = useState<Record<string, string>>({})
  const [copiedResetId, setCopiedResetId] = useState<string | null>(null)
  const isAdminView = data.viewerMode === 'ADMIN'

  const pendingProposals = data.proposals.length

  const allTabs: { id: AdminTab; label: string; badge?: number; adminOnly?: boolean }[] = [
    { id: 'usuarios',    label: 'Usuarios',       adminOnly: true },
    { id: 'nucleos',     label: 'Núcleos familiares' },
    { id: 'propuestas',  label: 'Propuestas',     badge: pendingProposals > 0 ? pendingProposals : undefined },
    { id: 'permisos',    label: 'Permisos',       adminOnly: true },
    { id: 'modulos',     label: 'Módulos',        adminOnly: true },
    { id: 'importar',    label: 'Importar',       adminOnly: true },
    { id: 'invitaciones',label: 'Invitaciones',   adminOnly: true },
    { id: 'auditoria',   label: 'Auditoría' },
  ]

  const visibleTabs = allTabs.filter(t => !t.adminOnly || isAdminView)
  const [activeTab, setActiveTab] = useState<AdminTab>(visibleTabs[0]?.id ?? 'nucleos')

  const representativeOptions = data.users.filter(user => user.personId)

  function clear() { setError(null); setMessage(null) }

  function saveConfig() {
    clear()
    startTransition(async () => {
      const result = await updateFamilyConfig(config)
      if (!result.ok) { setError(result.error); return }
      setMessage('Configuración guardada.')
    })
  }

  function handleInvite() {
    clear()
    startTransition(async () => {
      const result = await createInviteLink({
        role: inviteRole as UserRole,
        scope: inviteScope as UserScope,
        branchRootId: inviteBranchRootId,
        personId: invitePersonId || undefined,
      })
      if (!result.ok) { setError(result.error); return }
      setInviteUrl(result.data.url)
      setMessage('Invitación creada.')
    })
  }

  function saveUser(formData: FormData) {
    clear()
    startTransition(async () => {
      const result = await updateUserAccess({
        userId: String(formData.get('userId')),
        role: formData.get('role') as UserRole,
        scope: formData.get('scope') as UserScope,
        branchRootId: String(formData.get('branchRootId') ?? ''),
        personId: String(formData.get('personId') ?? ''),
      })
      if (!result.ok) { setError(result.error); return }
      setMessage('Usuario actualizado.')
    })
  }

  function handleGenerateResetLink(userId: string) {
    clear()
    startTransition(async () => {
      const result = await createPasswordResetLink(userId)
      if (!result.ok) { setError(result.error); return }
      setResetLinks(prev => ({ ...prev, [userId]: result.data.url }))
    })
  }

  function handleCopyResetLink(userId: string, url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedResetId(userId)
      setTimeout(() => setCopiedResetId(null), 2000)
    })
  }

  function handlePreviewManagedUnit(formData: FormData) {
    clear()
    startTransition(async () => {
      const result = await previewManagedFamilyUnit(formDataToManagedUnitPayload(formData))
      if (!result.ok) { setError(result.error); return }
      setPreview(result.data)
    })
  }

  function handleCreateManagedUnit(formData: FormData) {
    clear()
    startTransition(async () => {
      const result = await createManagedFamilyUnit(formDataToManagedUnitPayload(formData))
      if (!result.ok) { setError(result.error); return }
      setPreview(null)
      setMessage('Núcleo familiar creado.')
    })
  }

  function handleUpdateManagedUnit(formData: FormData) {
    clear()
    startTransition(async () => {
      const result = await updateManagedFamilyUnit({
        unitId: String(formData.get('unitId')),
        label: String(formData.get('label') ?? ''),
        representativeUserId: String(formData.get('representativeUserId') ?? ''),
        primarySurname: String(formData.get('primarySurname') ?? ''),
        secondarySurname: String(formData.get('secondarySurname') ?? ''),
        canInviteUsers: formData.get('canInviteUsers') === 'on',
        canEditPeople: formData.get('canEditPeople') === 'on',
        canManageContent: formData.get('canManageContent') === 'on',
        canViewAudit: formData.get('canViewAudit') === 'on',
      })
      if (!result.ok) { setError(result.error); return }
      setMessage('Núcleo familiar actualizado.')
    })
  }

  function handleCreateAccessRule(formData: FormData) {
    clear()
    startTransition(async () => {
      const result = await createAccessRule({
        userId: String(formData.get('userId') ?? ''),
        targetPersonId: String(formData.get('targetPersonId') ?? ''),
        effect: formData.get('effect') as AccessEffect,
        permission: formData.get('permission') as AccessPermission,
        reason: String(formData.get('reason') ?? ''),
      })
      if (!result.ok) { setError(result.error); return }
      setMessage('Regla de acceso creada.')
    })
  }

  function handleDeleteAccessRule(formData: FormData) {
    clear()
    startTransition(async () => {
      const result = await deleteAccessRule(String(formData.get('ruleId')))
      if (!result.ok) { setError(result.error); return }
      setMessage('Regla eliminada.')
    })
  }

  function handleApproveProposal(proposalId: string) {
    clear()
    startTransition(async () => {
      const result = await approveProposal(proposalId)
      if (!result.ok) { setError(result.error); return }
      setMessage('Propuesta aprobada.')
      router.refresh()
    })
  }

  function handleRejectProposal(proposalId: string) {
    clear()
    startTransition(async () => {
      const result = await rejectProposal({ proposalId, reason: rejectReason })
      if (!result.ok) { setError(result.error); return }
      setRejectingId(null)
      setRejectReason('')
      setMessage('Propuesta rechazada.')
      router.refresh()
    })
  }

  function handlePreviewRelations() {
    clear()
    setImportPreview(null)
    startTransition(async () => {
      const result = await previewRelationsImport({ jsonText: relationsJsonText })
      if (!result.ok) { setError(result.error); return }
      setImportPreview(result.data)
      setMessage(
        result.data.changesCount > 0
          ? `Vista previa lista: ${result.data.changesCount} cambio(s) sobre ${result.data.totalInFile} persona(s).`
          : `Sin cambios: el archivo ya coincide con el estado actual (${result.data.totalInFile} persona(s) revisadas).`
      )
    })
  }

  function handleImportRelations() {
    clear()
    startTransition(async () => {
      const result = await importRelationsJson({ jsonText: relationsJsonText })
      if (!result.ok) { setError(result.error); return }
      setImportPreview(null)
      setMessage(
        result.data.updatedPeople > 0
          ? `Importación completada. Personas actualizadas: ${result.data.updatedPeople}.`
          : 'Importación completada. Sin cambios de relaciones.'
      )
    })
  }

  async function handleRelationsFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setRelationsJsonText(text)
    setImportPreview(null)
    clear()
    setMessage(`Archivo cargado: ${file.name}`)
  }

  async function handleBulkFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setBulkJsonText(text)
    setBulkResult(null)
    clear()
    setMessage(`Archivo cargado: ${file.name}`)
  }

  function handleBulkImport() {
    clear()
    setBulkResult(null)
    startTransition(async () => {
      const result = await bulkCreatePeopleJson({ jsonText: bulkJsonText })
      if (!result.ok) { setError(result.error); return }
      setBulkResult(result.data)
      setBulkJsonText('')
      router.refresh()
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F0E8' }}>
      {/* Header */}
      <div style={{ background: '#2D4A3E', padding: '28px 32px 0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h1 style={{ margin: '0 0 4px', fontFamily: 'Georgia, serif', fontSize: 26, color: '#F5F0E8', fontWeight: 400 }}>
            Administración de familia
          </h1>
          <p style={{ margin: '0 0 24px', color: '#8BB8A8', fontSize: 13 }}>
            {isAdminView
              ? 'Gestiona usuarios, permisos, núcleos familiares, módulos e invitaciones.'
              : 'Gestiona tus núcleos familiares y revisa la auditoría.'}
          </p>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); clear() }}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid #A8C5B5' : '2px solid transparent',
                  color: activeTab === tab.id ? '#F5F0E8' : '#8BB8A8',
                  padding: '10px 18px',
                  fontSize: 13,
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  transition: 'color 0.15s',
                }}
              >
                {tab.label}
                {tab.badge !== undefined && (
                  <span style={{
                    background: '#C47B5A',
                    color: '#fff',
                    borderRadius: 999,
                    fontSize: 11,
                    padding: '1px 7px',
                    fontWeight: 600,
                    minWidth: 20,
                    textAlign: 'center',
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px 64px' }}>

        {/* Toast */}
        {(error || message) && (
          <div style={{
            marginBottom: 20,
            padding: '12px 16px',
            borderRadius: 4,
            border: `1px solid ${error ? '#D8AAAA' : '#BFD0C7'}`,
            background: error ? '#FFF1F1' : '#F3F7F4',
            color: error ? '#8B4444' : '#2D4A3E',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>{error ?? message}</span>
            <button
              onClick={clear}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16, padding: '0 0 0 12px', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        )}

        {/* ── USUARIOS ── */}
        {activeTab === 'usuarios' && isAdminView && (
          <TabSection title="Usuarios" description="Gestiona los roles y accesos de cada miembro.">
            <div style={{ display: 'grid', gap: 12 }}>
              {data.users.map(user => (
                <div key={user.id} style={rowCardStyle}>
                  <form action={saveUser}>
                    <input type="hidden" name="userId" value={user.id} />
                    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr 2fr 2fr auto', gap: 14, alignItems: 'end' }}>
                      <Field label="Usuario">
                        <div style={{ padding: '10px 0', fontSize: 13, color: '#2C2C2C' }}>
                          <div style={{ fontWeight: 500 }}>{user.name}</div>
                          <div style={{ color: '#8B9E94', fontSize: 12, marginTop: 2 }}>{user.username}</div>
                        </div>
                      </Field>
                      <Field label="Rol">
                        <select name="role" defaultValue={user.role} style={inputStyle}>
                          <option value="ADMIN">Admin</option>
                          <option value="MEMBER">Miembro</option>
                        </select>
                      </Field>
                      <Field label="Alcance">
                        <select name="scope" defaultValue={user.scope} style={inputStyle}>
                          <option value="ADMIN">Admin</option>
                          <option value="FAMILY">Familia</option>
                          <option value="BRANCH">Rama</option>
                        </select>
                      </Field>
                      <Field label="Raíz de rama">
                        <select name="branchRootId" defaultValue={user.branchRootId ?? ''} style={inputStyle}>
                          <option value="">No aplica</option>
                          {data.people.map(person => (
                            <option key={person.id} value={person.id}>{getPersonDisplayName(person)}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Persona vinculada">
                        <select name="personId" defaultValue={user.personId ?? ''} style={inputStyle}>
                          <option value="">Sin vincular</option>
                          {data.people.map(person => (
                            <option key={person.id} value={person.id}>{getPersonDisplayName(person)}</option>
                          ))}
                        </select>
                      </Field>
                      <button type="submit" disabled={isPending} style={primaryBtn}>Guardar</button>
                    </div>
                  </form>
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F0EBE2', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleGenerateResetLink(user.id)}
                      style={secondaryBtn}
                    >
                      Generar link de recuperación
                    </button>
                    {resetLinks[user.id] && (
                      <>
                        <code style={{ flex: 1, fontSize: 11, color: '#2D4A3E', background: '#F0F5F2', padding: '6px 10px', borderRadius: 3, wordBreak: 'break-all' }}>
                          {resetLinks[user.id]}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyResetLink(user.id, resetLinks[user.id])}
                          style={{ ...secondaryBtn, minWidth: 80 }}
                        >
                          {copiedResetId === user.id ? '¡Copiado!' : 'Copiar'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabSection>
        )}

        {/* ── NÚCLEOS ── */}
        {activeTab === 'nucleos' && (
          <TabSection
            title="Núcleos familiares"
            description="Cada núcleo define el ámbito de gestión para su representante: padres, hijos compartidos y descendencia."
          >
            {isAdminView && (
              <>
                <SectionLabel>Crear nuevo núcleo</SectionLabel>
                <form action={handlePreviewManagedUnit} style={{ ...rowCardStyle, marginBottom: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <Field label="Nombre del núcleo">
                      <input name="label" placeholder="Familia Martínez Santos" style={inputStyle} />
                    </Field>
                    <Field label="Padre / Madre A">
                      <select name="parentAId" defaultValue="" style={inputStyle}>
                        <option value="">Selecciona una persona</option>
                        {data.people.map(person => (
                          <option key={person.id} value={person.id}>{getPersonDisplayName(person)}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Padre / Madre B">
                      <select name="parentBId" defaultValue="" style={inputStyle}>
                        <option value="">Sin segundo padre/madre</option>
                        {data.people.map(person => (
                          <option key={person.id} value={person.id}>{getPersonDisplayName(person)}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Representante">
                      <select name="representativeUserId" defaultValue="" style={inputStyle}>
                        <option value="">Sin asignar</option>
                        {representativeOptions.map(user => (
                          <option key={user.id} value={user.id}>{user.name} ({user.username})</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Apellido principal">
                      <input name="primarySurname" placeholder="Martínez" style={inputStyle} />
                    </Field>
                    <Field label="Apellido secundario">
                      <input name="secondarySurname" placeholder="Santos" style={inputStyle} />
                    </Field>
                    <FlagField name="canInviteUsers"    label="Puede invitar"            defaultChecked />
                    <FlagField name="canEditPeople"     label="Puede editar personas"    defaultChecked />
                    <FlagField name="canManageContent"  label="Puede gestionar contenido" defaultChecked />
                    <FlagField name="canViewAudit"      label="Puede ver auditoría"      defaultChecked />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="submit" disabled={isPending} style={secondaryBtn}>Vista previa</button>
                    <button formAction={handleCreateManagedUnit} type="submit" disabled={isPending} style={primaryBtn}>
                      Crear núcleo
                    </button>
                  </div>
                </form>

                {preview && (
                  <div style={{ marginBottom: 20, padding: '14px 16px', background: '#F3F7F4', border: '1px solid #BFD0C7', borderRadius: 4 }}>
                    <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 4 }}>Vista previa</div>
                    <div style={{ fontSize: 15, color: '#2D4A3E', fontFamily: 'Georgia, serif', marginBottom: 10 }}>{preview.label}</div>
                    <ManagedPeopleList people={preview.managedPeople} />
                  </div>
                )}
              </>
            )}

            <SectionLabel>Núcleos existentes</SectionLabel>
            {data.managedUnits.length === 0 ? (
              <EmptyState>No hay núcleos familiares configurados aún.</EmptyState>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {data.managedUnits.map(unit => (
                  <form key={unit.id} action={handleUpdateManagedUnit} style={rowCardStyle}>
                    <input type="hidden" name="unitId" value={unit.id} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
                      <Field label="Nombre del núcleo">
                        <input name="label" defaultValue={unit.label} style={inputStyle} readOnly={!isAdminView} />
                      </Field>
                      <Field label="Padre / Madre A">
                        <div style={readOnlyFieldStyle}>{getPersonDisplayName(unit.parentA)}</div>
                      </Field>
                      <Field label="Padre / Madre B">
                        <div style={readOnlyFieldStyle}>{unit.parentB ? getPersonDisplayName(unit.parentB) : '—'}</div>
                      </Field>
                      <Field label="Representante">
                        <select name="representativeUserId" defaultValue={unit.representativeUserId ?? ''} style={inputStyle}>
                          <option value="">Sin asignar</option>
                          {representativeOptions.map(user => (
                            <option key={user.id} value={user.id}>{user.name} ({user.username})</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Apellido principal">
                        <input name="primarySurname" defaultValue={unit.primarySurname ?? ''} style={inputStyle} readOnly={!isAdminView} />
                      </Field>
                      <Field label="Apellido secundario">
                        <input name="secondarySurname" defaultValue={unit.secondarySurname ?? ''} style={inputStyle} readOnly={!isAdminView} />
                      </Field>
                      <FlagField name="canInviteUsers"   label="Puede invitar"             defaultChecked={unit.canInviteUsers}    disabled={!isAdminView} />
                      <FlagField name="canEditPeople"    label="Puede editar personas"     defaultChecked={unit.canEditPeople}     disabled={!isAdminView} />
                      <FlagField name="canManageContent" label="Puede gestionar contenido" defaultChecked={unit.canManageContent}  disabled={!isAdminView} />
                      <FlagField name="canViewAudit"     label="Puede ver auditoría"       defaultChecked={unit.canViewAudit}      disabled={!isAdminView} />
                    </div>

                    <div style={{ padding: '12px 14px', background: '#F8F5EE', border: '1px solid #EFE8DD', borderRadius: 3, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, color: '#8B9E94', marginBottom: 8 }}>
                        Representante:{' '}
                        <strong style={{ color: '#2C2C2C' }}>
                          {unit.representativeUserName
                            ? `${unit.representativeUserName} · ${unit.representativeUserUsername}`
                            : 'Sin asignar'}
                        </strong>
                      </div>
                      <ManagedPeopleList people={unit.managedPeople} />
                    </div>

                    <button type="submit" disabled={isPending} style={primaryBtn}>
                      {isAdminView ? 'Guardar cambios' : 'Transferir representación'}
                    </button>
                  </form>
                ))}
              </div>
            )}
          </TabSection>
        )}

        {/* ── PROPUESTAS ── */}
        {activeTab === 'propuestas' && (
          <TabSection
            title="Propuestas pendientes"
            description="Cambios biográficos enviados por miembros. Revísalos y aprueba o rechaza cada uno."
          >
            {data.proposals.length === 0 ? (
              <EmptyState>No hay propuestas pendientes.</EmptyState>
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {data.proposals.map(proposal => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    isPending={isPending}
                    familySlug={data.familySlug}
                    rejectingId={rejectingId}
                    rejectReason={rejectReason}
                    onSetRejectingId={id => { setRejectingId(id); setRejectReason('') }}
                    onSetRejectReason={setRejectReason}
                    onApprove={handleApproveProposal}
                    onReject={handleRejectProposal}
                  />
                ))}
              </div>
            )}
          </TabSection>
        )}

        {/* ── PERMISOS ── */}
        {activeTab === 'permisos' && isAdminView && (
          <TabSection
            title="Reglas de acceso"
            description="Excepciones manuales para vista y edición por persona. Denegar tiene prioridad sobre permitir."
          >
            <SectionLabel>Nueva regla</SectionLabel>
            <form action={handleCreateAccessRule} style={{ ...rowCardStyle, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 2fr auto', gap: 14, alignItems: 'end' }}>
                <Field label="Usuario">
                  <select name="userId" defaultValue="" style={inputStyle}>
                    <option value="">Regla global de familia</option>
                    {data.users.map(user => (
                      <option key={user.id} value={user.id}>{user.name} ({user.username})</option>
                    ))}
                  </select>
                </Field>
                <Field label="Persona objetivo">
                  <select name="targetPersonId" defaultValue="" style={inputStyle}>
                    <option value="">Selecciona una persona</option>
                    {data.people.map(person => (
                      <option key={person.id} value={person.id}>{getPersonDisplayName(person)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Efecto">
                  <select name="effect" defaultValue="ALLOW" style={inputStyle}>
                    <option value="ALLOW">Permitir</option>
                    <option value="DENY">Denegar</option>
                  </select>
                </Field>
                <Field label="Permiso">
                  <select name="permission" defaultValue="VIEW_PERSON" style={inputStyle}>
                    <option value="VIEW_PERSON">Ver persona</option>
                    <option value="EDIT_PERSON">Editar persona</option>
                    <option value="VIEW_CONTENT">Ver contenido</option>
                    <option value="VIEW_MEDIA">Ver fotos</option>
                    <option value="VIEW_PRIVATE">Ver privado</option>
                  </select>
                </Field>
                <Field label="Motivo">
                  <input name="reason" placeholder="Motivo opcional" style={inputStyle} />
                </Field>
                <button type="submit" disabled={isPending} style={primaryBtn}>Crear</button>
              </div>
            </form>

            <SectionLabel>Reglas activas</SectionLabel>
            {data.accessRules.length === 0 ? (
              <EmptyState>No hay reglas de acceso configuradas.</EmptyState>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {data.accessRules.map(rule => (
                  <form key={rule.id} action={handleDeleteAccessRule} style={rowCardStyle}>
                    <input type="hidden" name="ruleId" value={rule.id} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto 2fr auto', gap: 14, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{rule.userName ?? 'Global de familia'}</div>
                        <div style={{ fontSize: 12, color: '#8B9E94' }}>{rule.userId ?? 'Aplica a todos'}</div>
                      </div>
                      <div style={{ fontSize: 13 }}>{rule.targetPersonName}</div>
                      <span style={rule.effect === 'DENY' ? denyBadgeStyle : allowBadgeStyle}>
                        {rule.effect === 'DENY' ? 'Denegar' : 'Permitir'}
                      </span>
                      <span style={permissionBadgeStyle}>{permissionLabel(rule.permission)}</span>
                      <div>
                        <div style={{ fontSize: 13 }}>{rule.reason || <span style={{ color: '#8B9E94' }}>Sin motivo</span>}</div>
                        <div style={{ fontSize: 12, color: '#8B9E94' }}>{new Date(rule.createdAt).toLocaleDateString('es')}</div>
                      </div>
                      <button type="submit" disabled={isPending} style={dangerBtn}>Eliminar</button>
                    </div>
                  </form>
                ))}
              </div>
            )}
          </TabSection>
        )}

        {/* ── MÓDULOS ── */}
        {activeTab === 'modulos' && isAdminView && (
          <TabSection title="Módulos activos" description="Activa o desactiva las secciones disponibles para los miembros de la familia.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              {Object.entries(config).map(([key, value]) => (
                <label key={key} style={flagFieldStyle}>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={e => setConfig(prev => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <span style={{ fontSize: 13 }}>{moduleLabel(key)}</span>
                </label>
              ))}
            </div>
            <button type="button" disabled={isPending} onClick={saveConfig} style={primaryBtn}>
              Guardar módulos
            </button>
          </TabSection>
        )}

        {/* ── IMPORTAR ── */}
        {activeTab === 'importar' && isAdminView && (
          <TabSection title="Importar datos" description="Importa personas o relaciones desde archivos JSON.">
            <SectionLabel>Importar personas desde JSON</SectionLabel>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6B6B6B', lineHeight: 1.5 }}>
              Crea personas nuevas y conecta sus relaciones en un solo paso. Los IDs pueden ser cuids reales o
              identificadores temporales como <code style={{ background: '#F3F0EA', padding: '1px 5px', borderRadius: 3 }}>ID_CIRO_PAZMINO</code>.
            </p>
            <div style={{ ...rowCardStyle, marginBottom: 28 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <label style={secondaryBtn as React.CSSProperties}>
                  Cargar archivo JSON
                  <input type="file" accept="application/json,.json" hidden onChange={handleBulkFileChange} />
                </label>
              </div>
              <Field label="JSON de personas">
                <textarea
                  value={bulkJsonText}
                  onChange={e => { setBulkJsonText(e.target.value); setBulkResult(null) }}
                  placeholder={'{\n  "familySlug": "mi-familia",\n  "people": [\n    { "id": "ID_JUAN", "firstName": "Juan", "lastName": "Pérez", "fatherId": null, "motherId": null }\n  ]\n}'}
                  style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'Consolas, monospace', fontSize: 12, lineHeight: 1.5 }}
                />
              </Field>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
                <button
                  type="button"
                  disabled={isPending || bulkJsonText.trim().length === 0}
                  onClick={handleBulkImport}
                  style={primaryBtn}
                >
                  {isPending ? 'Importando...' : 'Importar personas'}
                </button>
              </div>
              {bulkResult && (
                <div style={{ marginTop: 14, padding: '10px 14px', background: '#F3F7F4', border: '1px solid #BFD0C7', borderRadius: 3, fontSize: 13, color: '#2D4A3E' }}>
                  ✓ {bulkResult.created} persona(s) creada(s), {bulkResult.updated} relación(es) actualizada(s).
                </div>
              )}
            </div>

            <SectionLabel>Importar relaciones desde JSON</SectionLabel>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6B6B6B', lineHeight: 1.5 }}>
              Actualiza únicamente <code style={{ background: '#F3F0EA', padding: '1px 5px', borderRadius: 3 }}>fatherId</code> y{' '}
              <code style={{ background: '#F3F0EA', padding: '1px 5px', borderRadius: 3 }}>motherId</code> entre personas existentes.
              No crea personas ni modifica contenidos.
            </p>
            <div style={rowCardStyle}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <a href="/api/relations/export" style={{ ...secondaryBtn, textDecoration: 'none' } as React.CSSProperties}>
                  Exportar relaciones actuales
                </a>
                <label style={secondaryBtn as React.CSSProperties}>
                  Cargar archivo JSON
                  <input type="file" accept="application/json,.json" hidden onChange={handleRelationsFileChange} />
                </label>
              </div>
              <Field label="JSON de relaciones">
                <textarea
                  value={relationsJsonText}
                  onChange={e => setRelationsJsonText(e.target.value)}
                  placeholder='{"familySlug":"mi-familia","people":[...]}'
                  style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'Consolas, monospace', fontSize: 12, lineHeight: 1.5 }}
                />
              </Field>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={isPending || relationsJsonText.trim().length === 0}
                  onClick={handlePreviewRelations}
                  style={secondaryBtn}
                >
                  Ver cambios antes de importar
                </button>
              </div>

              {importPreview && importPreview.changesCount > 0 && (
                <div style={{ marginTop: 14, border: '1px solid #E0DAD0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', background: '#F8F5EE', borderBottom: '1px solid #E0DAD0', fontSize: 12, color: '#6B6B6B' }}>
                    {importPreview.changesCount} cambio(s) sobre {importPreview.totalInFile} persona(s)
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F3F0EA' }}>
                        <th style={thStyle}>Persona</th>
                        <th style={thStyle}>Padre actual</th>
                        <th style={thStyle}>Padre nuevo</th>
                        <th style={thStyle}>Madre actual</th>
                        <th style={thStyle}>Madre nueva</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.changes.map(row => (
                        <tr key={row.personId} style={{ borderTop: '1px solid #EFE8DD' }}>
                          <td style={tdStyle}>{row.personName}</td>
                          <td style={tdStyle}>{row.currentFatherName ?? <span style={{ color: '#8B9E94' }}>sin padre</span>}</td>
                          <td style={{ ...tdStyle, color: row.currentFatherId !== row.newFatherId ? '#2D4A3E' : undefined, fontWeight: row.currentFatherId !== row.newFatherId ? 600 : undefined }}>
                            {row.newFatherName ?? <span style={{ color: '#8B4444' }}>sin padre</span>}
                          </td>
                          <td style={tdStyle}>{row.currentMotherName ?? <span style={{ color: '#8B9E94' }}>sin madre</span>}</td>
                          <td style={{ ...tdStyle, color: row.currentMotherId !== row.newMotherId ? '#2D4A3E' : undefined, fontWeight: row.currentMotherId !== row.newMotherId ? 600 : undefined }}>
                            {row.newMotherName ?? <span style={{ color: '#8B4444' }}>sin madre</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: '12px 14px', borderTop: '1px solid #E0DAD0', background: '#FFFCF8' }}>
                    <button type="button" disabled={isPending} onClick={handleImportRelations} style={primaryBtn}>
                      Confirmar importación
                    </button>
                  </div>
                </div>
              )}
            </div>
          </TabSection>
        )}

        {/* ── INVITACIONES ── */}
        {activeTab === 'invitaciones' && isAdminView && (
          <TabSection title="Invitaciones" description="Genera enlaces de invitación para que nuevos miembros se unan a la familia.">
            <div style={rowCardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 14, alignItems: 'end' }}>
                <Field label="Rol">
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={inputStyle}>
                    <option value="MEMBER">Miembro</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </Field>
                <Field label="Alcance">
                  <select value={inviteScope} onChange={e => { setInviteScope(e.target.value); if (e.target.value !== 'BRANCH') setInviteBranchRootId('') }} style={inputStyle}>
                    <option value="FAMILY">Familia</option>
                    <option value="BRANCH">Rama</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </Field>
                <Field label="Persona vinculada">
                  <select value={invitePersonId} onChange={e => setInvitePersonId(e.target.value)} style={inputStyle}>
                    <option value="">Sin vincular</option>
                    {data.people.map(person => (
                      <option key={person.id} value={person.id}>{getPersonDisplayName(person)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Raíz de rama">
                  <select value={inviteBranchRootId} onChange={e => setInviteBranchRootId(e.target.value)} disabled={inviteScope !== 'BRANCH'} style={{ ...inputStyle, opacity: inviteScope !== 'BRANCH' ? 0.5 : 1 }}>
                    <option value="">Sin raíz específica</option>
                    {data.people.map(person => (
                      <option key={person.id} value={person.id}>{getPersonDisplayName(person)}</option>
                    ))}
                  </select>
                </Field>
                <button type="button" onClick={handleInvite} disabled={isPending} style={primaryBtn}>Generar enlace</button>
              </div>

              {inviteUrl && (
                <div style={{ marginTop: 18, padding: '14px 16px', background: '#F3F7F4', border: '1px solid #BFD0C7', borderRadius: 4 }}>
                  <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 8 }}>
                    Comparte este enlace{invitePersonId ? ` (vinculado a ${getPersonDisplayName(data.people.find(p => p.id === invitePersonId)!)})` : ''}:
                  </div>
                  <code style={{ fontSize: 13, color: '#2D4A3E', wordBreak: 'break-all', display: 'block' }}>{inviteUrl}</code>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(inviteUrl); setMessage('Enlace copiado.') }}
                    style={{ marginTop: 10, border: '1px solid #C8D4CE', background: '#fff', borderRadius: 2, color: '#2D4A3E', padding: '7px 14px', cursor: 'pointer', fontSize: 12 }}
                  >
                    Copiar enlace
                  </button>
                </div>
              )}
            </div>
          </TabSection>
        )}

        {/* ── AUDITORÍA ── */}
        {activeTab === 'auditoria' && (
          <TabSection title="Auditoría reciente" description="Registro de las últimas acciones realizadas en la familia.">
            {data.auditLogs.length === 0 ? (
              <EmptyState>Sin registros de auditoría.</EmptyState>
            ) : (
              <div style={{ border: '1px solid #E0DAD0', borderRadius: 4, overflow: 'hidden' }}>
                {data.auditLogs.map((log, i) => (
                  <div
                    key={log.id}
                    style={{
                      padding: '12px 16px',
                      borderTop: i > 0 ? '1px solid #EFE8DD' : undefined,
                      background: i % 2 === 0 ? '#fff' : '#FFFCF8',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: '#2C2C2C', marginBottom: 3 }}>{log.action}</div>
                      <div style={{ fontSize: 12, color: '#8B9E94' }}>
                        <strong>{log.userName}</strong> · {log.entityType}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#8B9E94', whiteSpace: 'nowrap' }}>
                      {new Date(log.createdAt).toLocaleString('es')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabSection>
        )}

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TabSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ margin: '0 0 4px', fontFamily: 'Georgia, serif', fontSize: 24, color: '#2D4A3E', fontWeight: 400 }}>{title}</h2>
        {description && <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>{description}</p>}
      </div>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8B9E94', marginBottom: 10, marginTop: 4 }}>
      {children}
    </div>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '24px 0', fontSize: 13, color: '#8B9E94' }}>{children}</div>
  )
}

function ProposalCard({
  proposal, isPending, familySlug, rejectingId, rejectReason,
  onSetRejectingId, onSetRejectReason, onApprove, onReject,
}: {
  proposal: PersonProposalItem
  isPending: boolean
  familySlug: string
  rejectingId: string | null
  rejectReason: string
  onSetRejectingId: (id: string | null) => void
  onSetRejectReason: (reason: string) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const isRejecting = rejectingId === proposal.id

  return (
    <div style={rowCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div>
          <a href={`/${familySlug}/person/${proposal.personId}`} style={{ fontSize: 16, color: '#2D4A3E', fontFamily: 'Georgia, serif', textDecoration: 'none' }}>
            {proposal.personName}
          </a>
          <div style={{ fontSize: 12, color: '#8B9E94', marginTop: 4 }}>
            Propuesto por <strong>{proposal.proposedByName}</strong> · {new Date(proposal.createdAt).toLocaleDateString('es')}
          </div>
        </div>
        {!isRejecting && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" disabled={isPending} onClick={() => onApprove(proposal.id)} style={primaryBtn}>Aprobar</button>
            <button type="button" disabled={isPending} onClick={() => onSetRejectingId(proposal.id)} style={dangerBtn}>Rechazar</button>
          </div>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F3F0EA' }}>
            <th style={thStyle}>Campo</th>
            <th style={thStyle}>Valor actual</th>
            <th style={thStyle}>Valor propuesto</th>
          </tr>
        </thead>
        <tbody>
          {proposal.fields.map(field => (
            <tr key={field.key} style={{ borderTop: '1px solid #EFE8DD' }}>
              <td style={tdStyle}>{field.label}</td>
              <td style={{ ...tdStyle, color: '#8B9E94' }}>{field.currentValue ?? <em>vacío</em>}</td>
              <td style={{ ...tdStyle, fontWeight: 600, color: '#2D4A3E' }}>{field.proposedValue ?? <em>vacío</em>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {isRejecting && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={rejectReason}
            onChange={e => onSetRejectReason(e.target.value)}
            placeholder="Motivo del rechazo (opcional)"
            style={{ ...inputStyle, flex: 1, minWidth: 200 }}
          />
          <button type="button" disabled={isPending} onClick={() => onReject(proposal.id)} style={dangerBtn}>Confirmar rechazo</button>
          <button type="button" disabled={isPending} onClick={() => onSetRejectingId(null)} style={secondaryBtn}>Cancelar</button>
        </div>
      )}
    </div>
  )
}

function ManagedPeopleList({ people }: { people: ManagedFamilyUnitPreviewPerson[] }) {
  if (people.length === 0) {
    return <div style={{ fontSize: 13, color: '#8B4444' }}>La unidad no incluye personas con la configuración actual.</div>
  }
  return (
    <>
      <div style={{ fontSize: 12, color: '#8B9E94', marginBottom: 8 }}>Personas administradas: {people.length}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {people.map(person => (
          <span key={person.id} style={chipStyle}>{getPersonDisplayName(person)}</span>
        ))}
      </div>
    </>
  )
}

function moduleLabel(key: string) {
  const labels: Record<string, string> = {
    moduleStories:      'Historias',
    moduleDiary:        'Diario y entrevistas',
    moduleRecipes:      'Recetas',
    moduleMedia:        'Imágenes y fotos',
    moduleObjects:      'Objetos',
    moduleLinks:        'Relaciones importantes',
    moduleAudioVideo:   'Audio y video',
    moduleExportImport: 'Exportar / importar',
    moduleSearch:       'Búsqueda',
  }
  return labels[key] ?? key
}

function permissionLabel(p: string) {
  const map: Record<string, string> = {
    VIEW_PERSON:   'Ver persona',
    EDIT_PERSON:   'Editar persona',
    VIEW_CONTENT:  'Ver contenido',
    VIEW_MEDIA:    'Ver fotos',
    VIEW_PRIVATE:  'Ver privado',
  }
  return map[p] ?? p
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8B9E94', marginBottom: 7 }}>{label}</div>
      {children}
    </label>
  )
}

function FlagField({ name, label, defaultChecked, disabled = false }: { name: string; label: string; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label style={flagFieldStyle}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} />
      <span style={{ fontSize: 13 }}>{label}</span>
    </label>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #D8D3CA',
  borderRadius: 3,
  padding: '10px 12px',
  fontSize: 13,
  color: '#2C2C2C',
  background: '#FFFCF8',
  boxSizing: 'border-box',
}

const readOnlyFieldStyle: React.CSSProperties = {
  ...inputStyle,
  background: '#F7F2EA',
  color: '#6B6B6B',
}

const rowCardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E0DAD0',
  borderRadius: 4,
  padding: '20px 22px',
}

const primaryBtn: React.CSSProperties = {
  border: 'none',
  background: '#2D4A3E',
  color: '#fff',
  borderRadius: 3,
  padding: '11px 18px',
  cursor: 'pointer',
  fontSize: 12,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
}

const secondaryBtn: React.CSSProperties = {
  ...primaryBtn,
  background: 'transparent',
  border: '1px solid #C8D4CE',
  color: '#2D4A3E',
}

const dangerBtn: React.CSSProperties = {
  ...primaryBtn,
  background: '#8B4444',
}

const flagFieldStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  padding: '10px 12px',
  background: '#F8F5EE',
  border: '1px solid #E6E0D5',
  borderRadius: 3,
  cursor: 'pointer',
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 999,
  background: '#EFF4F1',
  border: '1px solid #D7E2DB',
  color: '#2D4A3E',
  fontSize: 12,
}

const allowBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 999,
  background: '#EFF4F1',
  color: '#2D4A3E',
  fontSize: 11,
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
}

const denyBadgeStyle: React.CSSProperties = {
  ...allowBadgeStyle,
  background: '#FFF1F1',
  color: '#8B4444',
}

const permissionBadgeStyle: React.CSSProperties = {
  ...allowBadgeStyle,
  background: '#F3F0EA',
  color: '#6B6B6B',
}

const thStyle: React.CSSProperties = {
  padding: '9px 14px',
  textAlign: 'left',
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#6B6B6B',
  fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  color: '#2C2C2C',
  verticalAlign: 'top',
  fontSize: 13,
}
