'use client'

import { useState, useTransition } from 'react'
import {
  createAccessRule,
  createInviteLink,
  createManagedFamilyUnit,
  deleteAccessRule,
  importRelationsJson,
  previewManagedFamilyUnit,
  updateFamilyConfig,
  updateManagedFamilyUnit,
  updateUserAccess,
} from '@/app/actions/admin'
import type {
  AccessEffect,
  AccessPermission,
  AdminDashboardData,
  FamilyConfigData,
  ManagedFamilyUnitPreviewPerson,
  UserScope,
  UserRole,
} from '@/lib/content-types'
import { getPersonDisplayName } from '@/lib/person-name'

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
  const [isPending, startTransition] = useTransition()
  const [config, setConfig] = useState<FamilyConfigData>(data.config)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [relationsJsonText, setRelationsJsonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ label: string; managedPeople: ManagedFamilyUnitPreviewPerson[] } | null>(null)
  const isAdminView = data.viewerMode === 'ADMIN'

  const representativeOptions = data.users.filter(user => user.personId)

  function saveConfig() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await updateFamilyConfig(config)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage('Configuracion guardada.')
    })
  }

  function handleInvite(formData: FormData) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await createInviteLink({
        role: formData.get('role') as UserRole,
        scope: formData.get('scope') as UserScope,
        branchRootId: String(formData.get('branchRootId') ?? ''),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setInviteUrl(result.data.url)
      setMessage('Invitacion creada.')
    })
  }

  function saveUser(formData: FormData) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await updateUserAccess({
        userId: String(formData.get('userId')),
        role: formData.get('role') as UserRole,
        scope: formData.get('scope') as UserScope,
        branchRootId: String(formData.get('branchRootId') ?? ''),
        personId: String(formData.get('personId') ?? ''),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage('Usuario actualizado.')
    })
  }

  function handlePreviewManagedUnit(formData: FormData) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await previewManagedFamilyUnit(formDataToManagedUnitPayload(formData))
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPreview(result.data)
      setMessage('Preview actualizado.')
    })
  }

  function handleCreateManagedUnit(formData: FormData) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await createManagedFamilyUnit(formDataToManagedUnitPayload(formData))
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPreview(null)
      setMessage('Unidad familiar creada.')
    })
  }

  function handleUpdateManagedUnit(formData: FormData) {
    setError(null)
    setMessage(null)
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
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage('Unidad familiar actualizada.')
    })
  }

  function handleCreateAccessRule(formData: FormData) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await createAccessRule({
        userId: String(formData.get('userId') ?? ''),
        targetPersonId: String(formData.get('targetPersonId') ?? ''),
        effect: formData.get('effect') as AccessEffect,
        permission: formData.get('permission') as AccessPermission,
        reason: String(formData.get('reason') ?? ''),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage('Regla de acceso creada.')
    })
  }

  function handleDeleteAccessRule(formData: FormData) {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await deleteAccessRule(String(formData.get('ruleId')))
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage('Regla de acceso eliminada.')
    })
  }

  function handleImportRelations() {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await importRelationsJson({ jsonText: relationsJsonText })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage(
        result.data.updatedPeople > 0
          ? `Importacion completada. Personas actualizadas: ${result.data.updatedPeople}.`
          : 'Importacion completada. No hubo cambios de relaciones.'
      )
    })
  }

  async function handleRelationsFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const text = await file.text()
    setRelationsJsonText(text)
    setError(null)
    setMessage(`Archivo cargado: ${file.name}`)
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 30, color: '#2D4A3E' }}>Administracion de familia</h1>
        <p style={{ margin: 0, color: '#6B6B6B', fontSize: 13 }}>
          {isAdminView
            ? 'Gestiona usuarios, permisos de rama, nucleos familiares, modulos activos e invitaciones.'
            : 'Revisa tus nucleos familiares, la auditoria limitada y transfiere la representacion cuando corresponda.'}
        </p>
      </div>

      {(error || message) && (
        <div
          style={{
            marginBottom: 18,
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

      <div style={{ display: 'grid', gap: 22 }}>
        {isAdminView && <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Usuarios</h2>
          <div style={{ display: 'grid', gap: 14 }}>
            {data.users.map(user => (
              <form
                key={user.id}
                action={saveUser}
                style={{ border: '1px solid #E6E0D5', borderRadius: 3, padding: '16px 18px', background: '#FFFCF8' }}
              >
                <input type="hidden" name="userId" value={user.id} />
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr 2fr auto', gap: 12, alignItems: 'end' }}>
                  <Field label="Usuario">
                    <div style={{ fontSize: 13, color: '#2C2C2C', padding: '10px 0' }}>
                      <div>{user.name}</div>
                      <div style={{ color: '#8B9E94', fontSize: 12 }}>{user.email}</div>
                    </div>
                  </Field>
                  <Field label="Rol">
                    <select name="role" defaultValue={user.role} style={inputStyle}>
                      <option value="ADMIN">Admin</option>
                      <option value="MEMBER">Member</option>
                    </select>
                  </Field>
                  <Field label="Scope">
                    <select name="scope" defaultValue={user.scope} style={inputStyle}>
                      <option value="ADMIN">Admin</option>
                      <option value="FAMILY">Family</option>
                      <option value="BRANCH">Branch</option>
                    </select>
                  </Field>
                  <Field label="Raiz de rama">
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
                  <button type="submit" disabled={isPending} style={actionButtonStyle}>
                    Guardar
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>}

        <section style={cardStyle}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={sectionTitleStyle}>Nucleos familiares administrados</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>
              Cada unidad amplia vista y gestion solo para parentA, parentB, hijos compartidos y descendencia de esos hijos.
            </p>
          </div>

          {isAdminView && <form action={handlePreviewManagedUnit} style={{ border: '1px solid #E6E0D5', borderRadius: 3, padding: '18px', background: '#FFFCF8', marginBottom: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 2fr', gap: 12, alignItems: 'end' }}>
              <Field label="Label">
                <input name="label" placeholder="Familia Martinez Santos" style={inputStyle} />
              </Field>
              <Field label="Parent A">
                <select name="parentAId" defaultValue="" style={inputStyle}>
                  <option value="">Selecciona una persona</option>
                  {data.people.map(person => (
                    <option key={person.id} value={person.id}>{getPersonDisplayName(person)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Parent B">
                <select name="parentBId" defaultValue="" style={inputStyle}>
                  <option value="">Sin parentB</option>
                  {data.people.map(person => (
                    <option key={person.id} value={person.id}>{getPersonDisplayName(person)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Representante">
                <select name="representativeUserId" defaultValue="" style={inputStyle}>
                  <option value="">Sin asignar</option>
                  {representativeOptions.map(user => (
                    <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                  ))}
                </select>
              </Field>
              <Field label="Apellido principal">
                <input name="primarySurname" placeholder="Martinez" style={inputStyle} />
              </Field>
              <Field label="Apellido secundario">
                <input name="secondarySurname" placeholder="Santos" style={inputStyle} />
              </Field>
              <FlagField name="canInviteUsers" label="Puede invitar" defaultChecked />
              <FlagField name="canEditPeople" label="Puede editar personas" defaultChecked />
              <FlagField name="canManageContent" label="Puede gestionar contenido" defaultChecked />
              <FlagField name="canViewAudit" label="Puede ver auditoria" defaultChecked />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="submit" disabled={isPending} style={secondaryButtonStyle}>
                Ver preview
              </button>
              <button formAction={handleCreateManagedUnit} type="submit" disabled={isPending} style={actionButtonStyle}>
                Crear unidad
              </button>
            </div>
          </form>}

          {preview && (
            <div style={previewCardStyle}>
              <div style={{ fontSize: 12, color: '#8B9E94', marginBottom: 6 }}>Preview actual</div>
              <div style={{ fontSize: 15, color: '#2D4A3E', fontFamily: 'Georgia, serif', marginBottom: 10 }}>{preview.label}</div>
              <ManagedPeopleList people={preview.managedPeople} />
            </div>
          )}

          <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
            {data.managedUnits.map(unit => (
              <form
                key={unit.id}
                action={handleUpdateManagedUnit}
                style={{ border: '1px solid #E6E0D5', borderRadius: 3, padding: '18px', background: '#FFFCF8' }}
              >
                <input type="hidden" name="unitId" value={unit.id} />
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 2fr', gap: 12, alignItems: 'end' }}>
                  <Field label="Label">
                    <input name="label" defaultValue={unit.label} style={inputStyle} readOnly={!isAdminView} />
                  </Field>
                  <Field label="Parent A">
                    <div style={readOnlyFieldStyle}>{getPersonDisplayName(unit.parentA)}</div>
                  </Field>
                  <Field label="Parent B">
                    <div style={readOnlyFieldStyle}>{unit.parentB ? getPersonDisplayName(unit.parentB) : 'Sin parentB'}</div>
                  </Field>
                  <Field label="Representante">
                    <select name="representativeUserId" defaultValue={unit.representativeUserId ?? ''} style={inputStyle}>
                      <option value="">Sin asignar</option>
                      {representativeOptions.map(user => (
                        <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Apellido principal">
                    <input name="primarySurname" defaultValue={unit.primarySurname ?? ''} style={inputStyle} readOnly={!isAdminView} />
                  </Field>
                  <Field label="Apellido secundario">
                    <input name="secondarySurname" defaultValue={unit.secondarySurname ?? ''} style={inputStyle} readOnly={!isAdminView} />
                  </Field>
                  <FlagField name="canInviteUsers" label="Puede invitar" defaultChecked={unit.canInviteUsers} disabled={!isAdminView} />
                  <FlagField name="canEditPeople" label="Puede editar personas" defaultChecked={unit.canEditPeople} disabled={!isAdminView} />
                  <FlagField name="canManageContent" label="Puede gestionar contenido" defaultChecked={unit.canManageContent} disabled={!isAdminView} />
                  <FlagField name="canViewAudit" label="Puede ver auditoria" defaultChecked={unit.canViewAudit} disabled={!isAdminView} />
                </div>

                <div style={{ marginTop: 14, padding: '12px 14px', border: '1px solid #EFE8DD', borderRadius: 3, background: '#FFFDF9' }}>
                  <div style={{ fontSize: 12, color: '#8B9E94', marginBottom: 6 }}>
                    Representante actual: {unit.representativeUserName ? `${unit.representativeUserName} | ${unit.representativeUserEmail}` : 'Sin asignar'}
                  </div>
                  <ManagedPeopleList people={unit.managedPeople} />
                </div>

                <div style={{ marginTop: 14 }}>
                  <button type="submit" disabled={isPending} style={actionButtonStyle}>
                    {isAdminView ? 'Guardar unidad' : 'Transferir representacion'}
                  </button>
                </div>
              </form>
            ))}
          </div>
        </section>

        {isAdminView && <section style={cardStyle}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={sectionTitleStyle}>Access rules</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>
              Excepciones manuales para vista y edicion. `DENY` tiene prioridad sobre `ALLOW`.
            </p>
          </div>

          <form action={handleCreateAccessRule} style={{ border: '1px solid #E6E0D5', borderRadius: 3, padding: '18px', background: '#FFFCF8', marginBottom: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 2fr auto', gap: 12, alignItems: 'end' }}>
              <Field label="Usuario">
                <select name="userId" defaultValue="" style={inputStyle}>
                  <option value="">Regla global de familia</option>
                  {data.users.map(user => (
                    <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
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
              <Field label="Effect">
                <select name="effect" defaultValue="ALLOW" style={inputStyle}>
                  <option value="ALLOW">Allow</option>
                  <option value="DENY">Deny</option>
                </select>
              </Field>
              <Field label="Permission">
                <select name="permission" defaultValue="VIEW_PERSON" style={inputStyle}>
                  <option value="VIEW_PERSON">View person</option>
                  <option value="EDIT_PERSON">Edit person</option>
                  <option value="VIEW_CONTENT">View content</option>
                  <option value="VIEW_MEDIA">View media</option>
                  <option value="VIEW_PRIVATE">View private</option>
                </select>
              </Field>
              <Field label="Reason">
                <input name="reason" placeholder="Motivo opcional" style={inputStyle} />
              </Field>
              <button type="submit" disabled={isPending} style={actionButtonStyle}>
                Crear regla
              </button>
            </div>
          </form>

          <div style={{ display: 'grid', gap: 12 }}>
            {data.accessRules.map(rule => (
              <form
                key={rule.id}
                action={handleDeleteAccessRule}
                style={{ border: '1px solid #E6E0D5', borderRadius: 3, padding: '14px 16px', background: '#FFFCF8' }}
              >
                <input type="hidden" name="ruleId" value={rule.id} />
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 2fr auto', gap: 12, alignItems: 'center' }}>
                  <div style={ruleInfoStyle}>
                    <div>{rule.userName ?? 'Global de familia'}</div>
                    <div style={ruleSubtleStyle}>{rule.userId ?? 'Sin usuario especifico'}</div>
                  </div>
                  <div style={ruleInfoStyle}>
                    <div>{rule.targetPersonName}</div>
                    <div style={ruleSubtleStyle}>{rule.targetPersonId}</div>
                  </div>
                  <div style={ruleInfoStyle}>
                    <span style={rule.effect === 'DENY' ? denyBadgeStyle : allowBadgeStyle}>{rule.effect}</span>
                  </div>
                  <div style={ruleInfoStyle}>{rule.permission}</div>
                  <div style={ruleInfoStyle}>
                    <div>{rule.reason || 'Sin motivo'}</div>
                    <div style={ruleSubtleStyle}>{new Date(rule.createdAt).toLocaleString('es')}</div>
                  </div>
                  <button type="submit" disabled={isPending} style={dangerButtonStyle}>
                    Eliminar
                  </button>
                </div>
              </form>
            ))}
            {data.accessRules.length === 0 && (
              <div style={{ fontSize: 13, color: '#6B6B6B' }}>Todavia no hay reglas manuales de acceso.</div>
            )}
          </div>
        </section>}

        {isAdminView && <section style={cardStyle}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={sectionTitleStyle}>Importar relaciones JSON</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>
              Solo administracion global puede importar. Este bloque actualiza unicamente `fatherId` y `motherId` entre personas que ya existen.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <a href="/api/relations/export" style={secondaryButtonLinkStyle}>
                Exportar relaciones actuales
              </a>
              <label style={secondaryButtonLabelStyle}>
                Cargar archivo JSON
                <input type="file" accept="application/json,.json" hidden onChange={handleRelationsFileChange} />
              </label>
            </div>

            <Field label="JSON de relaciones">
              <textarea
                value={relationsJsonText}
                onChange={e => setRelationsJsonText(e.target.value)}
                placeholder='{"familySlug":"familia-demo","people":[...]}'
                style={{ ...inputStyle, minHeight: 220, resize: 'vertical', fontFamily: 'Consolas, monospace', fontSize: 12, lineHeight: 1.5 }}
              />
            </Field>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" disabled={isPending || relationsJsonText.trim().length === 0} onClick={handleImportRelations} style={actionButtonStyle}>
                Importar relaciones
              </button>
              <span style={{ fontSize: 12, color: '#8B9E94' }}>
                No crea personas nuevas ni importa historias, fotos, recetas u otros contenidos.
              </span>
            </div>
          </div>
        </section>}

        {isAdminView && <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Invitaciones</h2>
          <form action={handleInvite} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 12, alignItems: 'end' }}>
            <Field label="Rol">
              <select name="role" defaultValue="MEMBER" style={inputStyle}>
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            </Field>
            <Field label="Scope">
              <select name="scope" defaultValue="FAMILY" style={inputStyle}>
                <option value="FAMILY">Family</option>
                <option value="BRANCH">Branch</option>
                <option value="ADMIN">Admin</option>
              </select>
            </Field>
            <Field label="Raiz para branch">
              <select name="branchRootId" defaultValue="" style={inputStyle}>
                <option value="">Sin raiz especifica</option>
                {data.people.map(person => (
                  <option key={person.id} value={person.id}>{getPersonDisplayName(person)}</option>
                ))}
              </select>
            </Field>
            <button type="submit" disabled={isPending} style={actionButtonStyle}>
              Generar link
            </button>
          </form>
          {inviteUrl && (
            <div style={{ marginTop: 16, padding: '12px 14px', background: '#F8F5EE', border: '1px solid #E0DAD0', borderRadius: 3 }}>
              <div style={{ fontSize: 12, color: '#6B6B6B', marginBottom: 6 }}>Comparte este enlace:</div>
              <code style={{ fontSize: 13, color: '#2D4A3E', wordBreak: 'break-all' }}>{inviteUrl}</code>
            </div>
          )}
        </section>}

        {isAdminView && <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Modulos activos</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            {Object.entries(config).map(([key, value]) => (
              <label key={key} style={moduleItemStyle}>
                <input
                  type="checkbox"
                  checked={value}
                  onChange={e => setConfig(prev => ({ ...prev, [key]: e.target.checked }))}
                />
                <span>{moduleLabel(key)}</span>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 18 }}>
            <button type="button" disabled={isPending} onClick={saveConfig} style={actionButtonStyle}>
              Guardar modulos
            </button>
          </div>
        </section>}

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Auditoria reciente</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {data.auditLogs.map(log => (
              <div key={log.id} style={{ borderBottom: '1px solid #EFE8DD', paddingBottom: 10 }}>
                <div style={{ fontSize: 13, color: '#2C2C2C' }}>{log.action}</div>
                <div style={{ fontSize: 12, color: '#8B9E94' }}>
                  {log.userName} | {log.entityType} | {new Date(log.createdAt).toLocaleString('es')}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function ManagedPeopleList({ people }: { people: ManagedFamilyUnitPreviewPerson[] }) {
  if (people.length === 0) {
    return <div style={{ fontSize: 13, color: '#8B4444' }}>La unidad no incluye personas con la configuracion actual.</div>
  }

  return (
    <>
      <div style={{ fontSize: 12, color: '#8B9E94', marginBottom: 8 }}>
        Personas administradas: {people.length}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {people.map(person => (
          <span key={person.id} style={chipStyle}>
            {getPersonDisplayName(person)}
          </span>
        ))}
      </div>
    </>
  )
}

function moduleLabel(key: string) {
  const labels: Record<string, string> = {
    moduleStories: 'Historias',
    moduleDiary: 'Diario e entrevistas',
    moduleRecipes: 'Recetas',
    moduleMedia: 'Imagenes',
    moduleObjects: 'Objetos',
    moduleLinks: 'Relaciones importantes',
    moduleAudioVideo: 'Audio y video',
    moduleExportImport: 'Export / import',
    moduleSearch: 'Busqueda',
  }
  return labels[key] ?? key
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8B9E94', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </label>
  )
}

function FlagField({ name, label, defaultChecked, disabled = false }: { name: string; label: string; defaultChecked: boolean; disabled?: boolean }) {
  return (
    <label style={flagFieldStyle}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} />
      <span>{label}</span>
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #D8D3CA',
  borderRadius: 3,
  padding: '10px 12px',
  fontSize: 13,
  color: '#2C2C2C',
  background: '#FFFCF8',
}

const readOnlyFieldStyle: React.CSSProperties = {
  ...inputStyle,
  background: '#F7F2EA',
}

const actionButtonStyle: React.CSSProperties = {
  border: 'none',
  background: '#2D4A3E',
  color: '#fff',
  borderRadius: 2,
  padding: '11px 14px',
  cursor: 'pointer',
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const secondaryButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: '#8B9E94',
}

const secondaryButtonLinkStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textDecoration: 'none',
}

const secondaryButtonLabelStyle: React.CSSProperties = {
  ...secondaryButtonLinkStyle,
}

const dangerButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  background: '#8B4444',
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E0DAD0',
  borderRadius: 3,
  padding: '24px 28px',
}

const previewCardStyle: React.CSSProperties = {
  marginTop: 12,
  padding: '14px 16px',
  background: '#F8F5EE',
  border: '1px solid #E0DAD0',
  borderRadius: 3,
}

const sectionTitleStyle: React.CSSProperties = {
  margin: '0 0 16px',
  fontFamily: 'Georgia, serif',
  fontSize: 22,
  color: '#2D4A3E',
}

const moduleItemStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  padding: '10px 12px',
  background: '#F8F5EE',
  border: '1px solid #E6E0D5',
  borderRadius: 3,
  fontSize: 13,
  color: '#2C2C2C',
}

const flagFieldStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  padding: '10px 12px',
  background: '#F8F5EE',
  border: '1px solid #E6E0D5',
  borderRadius: 3,
  fontSize: 13,
  color: '#2C2C2C',
}

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 999,
  background: '#EFF4F1',
  border: '1px solid #D7E2DB',
  color: '#2D4A3E',
  fontSize: 12,
}

const ruleInfoStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#2C2C2C',
}

const ruleSubtleStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#8B9E94',
  marginTop: 4,
}

const allowBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: 999,
  background: '#EFF4F1',
  color: '#2D4A3E',
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const denyBadgeStyle: React.CSSProperties = {
  ...allowBadgeStyle,
  background: '#FFF1F1',
  color: '#8B4444',
}
