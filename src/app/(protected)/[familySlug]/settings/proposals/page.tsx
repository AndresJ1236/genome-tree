'use client'

import { useEffect, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getOwnCreationProposals,
  getOwnProposals,
  getPendingProposals,
  getCreationProposals,
  approveProposal,
  rejectProposal,
  approveCreationProposal,
  rejectCreationProposal,
} from '@/app/actions/proposals'
import type { PersonProposalItem, ProposalStatus } from '@/lib/content-types'

type CreationProposal = {
  id: string
  proposedByName: string
  status: ProposalStatus
  createdAt: string
  reviewedAt: string | null
  rejectionReason: string | null
  firstName: string
  lastName: string | null
  nodeKind: 'PERSON' | 'PET'
  fatherName: string | null
  motherName: string | null
}

const STATUS_LABEL: Record<ProposalStatus, string> = {
  PENDING:  'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
}

const STATUS_COLOR: Record<ProposalStatus, { bg: string; color: string; border: string }> = {
  PENDING:  { bg: '#FFF9EC', color: '#7A5C1A', border: '#E8D59A' },
  APPROVED: { bg: '#F0F5F2', color: '#2D4A3E', border: '#B5C4BC' },
  REJECTED: { bg: '#FFF1F1', color: '#8B4444', border: '#D8AAAA' },
}

export default function MyProposalsPage() {
  const params = useParams<{ familySlug: string }>()
  const familySlug = params.familySlug
  const router = useRouter()

  const [proposals, setProposals] = useState<PersonProposalItem[] | null>(null)
  const [creationProposals, setCreationProposals] = useState<CreationProposal[] | null>(null)
  const [pendingReview, setPendingReview] = useState<PersonProposalItem[]>([])
  const [pendingCreationReview, setPendingCreationReview] = useState<CreationProposal[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isAction, startActionTransition] = useTransition()

  // Carga inicial — además de las propias, intentamos traer las pendientes
  // por revisar. Si el viewer no es admin/representante, getPendingProposals
  // devuelve []; getCreationProposals devuelve error y lo ignoramos.
  useEffect(() => {
    startTransition(async () => {
      const [own, ownC, pending, pendingC] = await Promise.all([
        getOwnProposals(),
        getOwnCreationProposals(),
        getPendingProposals(),
        getCreationProposals(),
      ])
      if (own.ok) setProposals(own.data); else setError(own.error)
      if (ownC.ok) setCreationProposals(ownC.data as CreationProposal[])
      if (pending.ok) setPendingReview(pending.data)
      if (pendingC.ok) setPendingCreationReview(pendingC.data as CreationProposal[])
    })
  }, [])

  function refresh() {
    startTransition(async () => {
      const [own, ownC, pending, pendingC] = await Promise.all([
        getOwnProposals(),
        getOwnCreationProposals(),
        getPendingProposals(),
        getCreationProposals(),
      ])
      if (own.ok) setProposals(own.data)
      if (ownC.ok) setCreationProposals(ownC.data as CreationProposal[])
      if (pending.ok) setPendingReview(pending.data)
      if (pendingC.ok) setPendingCreationReview(pendingC.data as CreationProposal[])
    })
  }

  function handleApprove(id: string) {
    startActionTransition(async () => {
      const r = await approveProposal(id)
      if (!r.ok) { setError(r.error); return }
      refresh()
      router.refresh()
    })
  }

  function handleReject(id: string) {
    const reason = prompt('Motivo del rechazo (opcional):') ?? ''
    startActionTransition(async () => {
      const r = await rejectProposal({ proposalId: id, reason })
      if (!r.ok) { setError(r.error); return }
      refresh()
      router.refresh()
    })
  }

  function handleApproveCreation(id: string) {
    startActionTransition(async () => {
      const r = await approveCreationProposal(id)
      if (!r.ok) { setError(r.error); return }
      refresh()
      router.refresh()
    })
  }

  function handleRejectCreation(id: string) {
    const reason = prompt('Motivo del rechazo (opcional):') ?? ''
    startActionTransition(async () => {
      const r = await rejectCreationProposal({ proposalId: id, reason })
      if (!r.ok) { setError(r.error); return }
      refresh()
      router.refresh()
    })
  }

  const hasOwn = (proposals?.length ?? 0) > 0 || (creationProposals?.length ?? 0) > 0
  const hasReview = pendingReview.length > 0 || pendingCreationReview.length > 0

  return (
    <div className="h-full overflow-y-auto">
    <div style={{ maxWidth: 720, margin: '48px auto', padding: '0 24px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 28, color: '#2D4A3E' }}>
            Propuestas
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>
            Revisa cambios pendientes y consulta los que has enviado.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <Link
            href={`/${familySlug}/person/new`}
            style={{
              display: 'block', textAlign: 'center', padding: '9px 16px',
              background: '#2D4A3E', color: '#fff', borderRadius: 3,
              fontSize: 12, fontFamily: 'Georgia, serif', textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            + Sugerir persona
          </Link>
          <Link
            href={`/${familySlug}/person/new?kind=PET`}
            style={{
              display: 'block', textAlign: 'center', padding: '9px 16px',
              background: '#F5F0E8', color: '#2D4A3E', border: '1px solid #C5B99A',
              borderRadius: 3, fontSize: 12, fontFamily: 'Georgia, serif',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            + Sugerir mascota
          </Link>
        </div>
      </div>

      {isPending && (
        <div style={{ color: '#8B9E94', fontSize: 13 }}>Cargando...</div>
      )}
      {error && (
        <div style={{ padding: '12px 16px', background: '#FFF1F1', border: '1px solid #D8AAAA', color: '#8B4444', borderRadius: 3, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* SECCIÓN 1: PENDIENTES POR REVISAR (admin/representante) */}
      {hasReview && (
        <section style={{ marginBottom: 36 }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A5C1A', fontWeight: 600 }}>
            Por revisar — {pendingReview.length + pendingCreationReview.length}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pendingCreationReview.map(p => (
              <ReviewCreationCard
                key={p.id}
                proposal={p}
                onApprove={() => handleApproveCreation(p.id)}
                onReject={() => handleRejectCreation(p.id)}
                disabled={isAction}
              />
            ))}
            {pendingReview.map(p => (
              <ReviewProposalCard
                key={p.id}
                proposal={p}
                onApprove={() => handleApprove(p.id)}
                onReject={() => handleReject(p.id)}
                disabled={isAction}
              />
            ))}
          </div>
        </section>
      )}

      {/* SECCIÓN 2: MIS PROPUESTAS */}
      {!isPending && !hasOwn && !hasReview && (
        <div style={{ padding: '24px', background: '#fff', border: '1px solid #E0DAD0', borderRadius: 3, fontSize: 13, color: '#6B6B6B', textAlign: 'center' }}>
          No has enviado ninguna propuesta y no hay nada por revisar.
        </div>
      )}

      {(creationProposals?.length ?? 0) > 0 && (
        <section style={{ marginBottom: 28 }}>
          <p style={{ margin: '0 0 12px', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B9E94' }}>
            Personas que has sugerido
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {creationProposals!.map(p => <CreationCard key={p.id} proposal={p} />)}
          </div>
        </section>
      )}

      {(proposals?.length ?? 0) > 0 && (
        <section>
          <p style={{ margin: '0 0 12px', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8B9E94' }}>
            Mis cambios propuestos
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {proposals!.map(p => <ProposalCard key={p.id} proposal={p} />)}
          </div>
        </section>
      )}
    </div>
    </div>
  )
}

// ── Review cards (con Approve/Reject) ───────────────────────────────────

function ReviewProposalCard({ proposal: p, onApprove, onReject, disabled }: {
  proposal: PersonProposalItem
  onApprove: () => void
  onReject: () => void
  disabled: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const date = new Date(p.createdAt).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ background: '#FFFCEF', border: '1px solid #E8D59A', borderRadius: 3, padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ margin: '0 0 2px', fontFamily: 'Georgia, serif', fontSize: 15, color: '#2C2C2C' }}>
            {p.personName}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: '#8B7B5A' }}>
            propuesto por {p.proposedByName} · {date}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onApprove}
            disabled={disabled}
            style={{
              border: '1px solid #2D4A3E', background: '#2D4A3E', color: '#fff',
              padding: '6px 12px', borderRadius: 2, fontSize: 11,
              letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Aprobar
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={disabled}
            style={{
              border: '1px solid #D8AAAA', background: '#fff', color: '#8B4444',
              padding: '6px 12px', borderRadius: 2, fontSize: 11,
              letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Rechazar
          </button>
        </div>
      </div>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#2D4A3E', padding: 0, letterSpacing: '0.04em' }}
      >
        {expanded ? 'Ocultar campos ↑' : `Ver ${p.fields.length} campo${p.fields.length !== 1 ? 's' : ''} ↓`}
      </button>
      {expanded && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {p.fields.map(f => (
            <div key={f.key} style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 8, borderBottom: '1px solid #F0EBE2', paddingBottom: 6 }}>
              <span style={{ color: '#8B7B5A', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, paddingTop: 2 }}>{f.label}</span>
              <span style={{ color: '#9B9B9B' }}>{f.currentValue ?? '—'}</span>
              <span style={{ color: '#2D4A3E', fontWeight: 500 }}>{f.proposedValue ?? '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReviewCreationCard({ proposal: p, onApprove, onReject, disabled }: {
  proposal: CreationProposal
  onApprove: () => void
  onReject: () => void
  disabled: boolean
}) {
  const date = new Date(p.createdAt).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ')

  return (
    <div style={{ background: '#FFFCEF', border: '1px solid #E8D59A', borderRadius: 3, padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ margin: '0 0 2px', fontFamily: 'Georgia, serif', fontSize: 15, color: '#2C2C2C' }}>
            Persona nueva: {name}
            {p.nodeKind === 'PET' && <span style={{ fontSize: 11, color: '#8B9E94', marginLeft: 6 }}>mascota</span>}
          </p>
          {(p.fatherName || p.motherName) && (
            <p style={{ margin: '0 0 2px', fontSize: 12, color: '#6B6B6B' }}>
              {p.fatherName && `Padre: ${p.fatherName}`}{p.fatherName && p.motherName && ' · '}{p.motherName && `Madre: ${p.motherName}`}
            </p>
          )}
          <p style={{ margin: 0, fontSize: 11, color: '#8B7B5A' }}>
            propuesto por {p.proposedByName} · {date}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onApprove}
            disabled={disabled}
            style={{
              border: '1px solid #2D4A3E', background: '#2D4A3E', color: '#fff',
              padding: '6px 12px', borderRadius: 2, fontSize: 11,
              letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Aprobar
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={disabled}
            style={{
              border: '1px solid #D8AAAA', background: '#fff', color: '#8B4444',
              padding: '6px 12px', borderRadius: 2, fontSize: 11,
              letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Rechazar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cards de las propias (read-only) ─────────────────────────────────────

function CreationCard({ proposal: p }: { proposal: CreationProposal }) {
  const colors = STATUS_COLOR[p.status]
  const date = new Date(p.createdAt).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ')

  return (
    <div style={{ background: '#fff', border: '1px solid #E0DAD0', borderRadius: 3, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ margin: '0 0 2px', fontFamily: 'Georgia, serif', fontSize: 15, color: '#2C2C2C' }}>
            {name} {p.nodeKind === 'PET' && <span style={{ fontSize: 11, color: '#8B9E94', marginLeft: 4 }}>mascota</span>}
          </p>
          {(p.fatherName || p.motherName) && (
            <p style={{ margin: '0 0 2px', fontSize: 12, color: '#6B6B6B' }}>
              {p.fatherName && `Padre: ${p.fatherName}`}{p.fatherName && p.motherName && ' · '}{p.motherName && `Madre: ${p.motherName}`}
            </p>
          )}
          <p style={{ margin: 0, fontSize: 11, color: '#8B9E94' }}>{date}</p>
        </div>
        <span style={{
          flexShrink: 0, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '3px 9px', borderRadius: 2,
          background: colors.bg, color: colors.color, border: `1px solid ${colors.border}`,
        }}>
          {STATUS_LABEL[p.status]}
        </span>
      </div>
      {p.status === 'REJECTED' && p.rejectionReason && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#8B4444', background: '#FFF1F1', padding: '8px 12px', borderRadius: 2 }}>
          Motivo: {p.rejectionReason}
        </p>
      )}
    </div>
  )
}

function ProposalCard({ proposal: p }: { proposal: PersonProposalItem }) {
  const [expanded, setExpanded] = useState(false)
  const colors = STATUS_COLOR[p.status]
  const date = new Date(p.createdAt).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ background: '#fff', border: '1px solid #E0DAD0', borderRadius: 3, padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ margin: '0 0 4px', fontFamily: 'Georgia, serif', fontSize: 15, color: '#2C2C2C' }}>
            {p.personName}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: '#8B9E94' }}>{date}</p>
        </div>
        <span style={{
          flexShrink: 0,
          fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '3px 9px', borderRadius: 2,
          background: colors.bg, color: colors.color, border: `1px solid ${colors.border}`,
        }}>
          {STATUS_LABEL[p.status]}
        </span>
      </div>

      {p.status === 'REJECTED' && p.rejectionReason && (
        <p style={{ margin: '12px 0 0', fontSize: 12, color: '#8B4444', background: '#FFF1F1', padding: '8px 12px', borderRadius: 2 }}>
          Motivo: {p.rejectionReason}
        </p>
      )}

      <button
        onClick={() => setExpanded(v => !v)}
        style={{ marginTop: 12, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#2D4A3E', padding: 0, letterSpacing: '0.04em' }}
      >
        {expanded ? 'Ocultar campos ↑' : `Ver ${p.fields.length} campo${p.fields.length !== 1 ? 's' : ''} propuesto${p.fields.length !== 1 ? 's' : ''} ↓`}
      </button>

      {expanded && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.fields.map(f => (
            <div key={f.key} style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 8, borderBottom: '1px solid #F0EBE2', paddingBottom: 6 }}>
              <span style={{ color: '#8B9E94', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10, paddingTop: 2 }}>{f.label}</span>
              <span style={{ color: '#9B9B9B' }}>{f.currentValue ?? '—'}</span>
              <span style={{ color: '#2D4A3E', fontWeight: 500 }}>{f.proposedValue ?? '—'}</span>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 8, fontSize: 10, color: '#B0BAB4' }}>
            <span />
            <span>Actual</span>
            <span>Propuesto</span>
          </div>
        </div>
      )}
    </div>
  )
}
