'use client'

import { useEffect, useState, useTransition } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getOwnProposals } from '@/app/actions/proposals'
import type { PersonProposalItem, ProposalStatus } from '@/lib/content-types'

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
  const [proposals, setProposals] = useState<PersonProposalItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const res = await getOwnProposals()
      if (res.ok) setProposals(res.data)
      else setError(res.error)
    })
  }, [])

  return (
    <div style={{ maxWidth: 640, margin: '48px auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 28, color: '#2D4A3E' }}>
            Mis propuestas
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6B6B6B' }}>
            Cambios que has sugerido sobre personas del árbol.
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
            + Nueva persona
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
            + Nueva mascota
          </Link>
        </div>
      </div>

      {isPending && (
        <div style={{ color: '#8B9E94', fontSize: 13 }}>Cargando...</div>
      )}
      {error && (
        <div style={{ padding: '12px 16px', background: '#FFF1F1', border: '1px solid #D8AAAA', color: '#8B4444', borderRadius: 3, fontSize: 13 }}>
          {error}
        </div>
      )}
      {proposals !== null && proposals.length === 0 && (
        <div style={{ padding: '24px', background: '#fff', border: '1px solid #E0DAD0', borderRadius: 3, fontSize: 13, color: '#6B6B6B', textAlign: 'center' }}>
          No has enviado ninguna propuesta todavía.
        </div>
      )}
      {proposals !== null && proposals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {proposals.map(p => (
            <ProposalCard key={p.id} proposal={p} />
          ))}
        </div>
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
