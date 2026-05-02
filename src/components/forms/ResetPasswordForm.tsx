'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { applyPasswordReset } from '@/app/actions/reset'

export function ResetPasswordForm({ token, username }: { token: string; username: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    setError(null)
    if (password !== confirm) {
      setError('Las contrasenas no coinciden.')
      return
    }
    startTransition(async () => {
      const result = await applyPasswordReset({ token, newPassword: password })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push(`/${result.data.familySlug}/tree`)
      router.refresh()
    })
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#F5F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', border: '1px solid #E0DAD0', borderRadius: 3, padding: '28px 30px' }}>
        <h1 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 26, color: '#2D4A3E' }}>
          Nueva contrasena
        </h1>
        <p style={{ margin: '0 0 22px', color: '#6B6B6B', fontSize: 13 }}>
          Cuenta: <strong>{username}</strong>
        </p>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={labelStyle}>Nueva contrasena</div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
            autoFocus
          />
        </label>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={labelStyle}>Confirmar contrasena</div>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            style={inputStyle}
          />
        </label>

        {error && (
          <div style={{ marginTop: 8, padding: '10px 12px', background: '#FFF1F1', border: '1px solid #D8AAAA', color: '#8B4444', borderRadius: 3, fontSize: 13 }}>
            {error}
          </div>
        )}

        <button type="button" onClick={handleSubmit} disabled={isPending} style={{ ...buttonStyle, marginTop: 18 }}>
          {isPending ? 'Guardando...' : 'Guardar y entrar'}
        </button>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
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
