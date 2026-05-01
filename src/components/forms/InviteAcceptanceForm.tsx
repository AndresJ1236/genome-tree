'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptInvite } from '@/app/actions/invite'

export function InviteAcceptanceForm({
  token,
  familySlug,
}: {
  token: string
  familySlug: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await acceptInvite({ token, name, email, password })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/${familySlug}/tree`)
      router.refresh()
    })
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', border: '1px solid #E0DAD0', borderRadius: 3, padding: '28px 30px' }}>
        <h1 style={{ margin: '0 0 8px', fontFamily: 'Georgia, serif', fontSize: 28, color: '#2D4A3E' }}>Aceptar invitacion</h1>
        <p style={{ margin: '0 0 20px', color: '#6B6B6B', fontSize: 13 }}>
          Crea tu acceso para entrar a la familia y comenzar a colaborar.
        </p>

        <Field label="Nombre completo">
          <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Correo">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Contrasena">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
        </Field>

        {error && (
          <div style={{ marginTop: 14, padding: '10px 12px', background: '#FFF1F1', border: '1px solid #D8AAAA', color: '#8B4444', borderRadius: 3, fontSize: 13 }}>
            {error}
          </div>
        )}

        <button type="button" onClick={handleSubmit} disabled={isPending} style={{ ...buttonStyle, marginTop: 18 }}>
          {isPending ? 'Creando acceso...' : 'Entrar a la familia'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8B9E94', fontFamily: 'Georgia, serif', marginBottom: 8 }}>
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

const buttonStyle: React.CSSProperties = {
  width: '100%',
  border: 'none',
  background: '#2D4A3E',
  color: '#fff',
  borderRadius: 2,
  padding: '12px 16px',
  cursor: 'pointer',
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}
