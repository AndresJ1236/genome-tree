'use client'

import { useState, useTransition } from 'react'
import { changeOwnPassword } from '@/app/actions/auth'

export default function SettingsPage() {
  const [isPending, startTransition] = useTransition()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleSubmit() {
    setError(null)
    setSuccess(false)
    if (newPassword !== confirm) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }
    startTransition(async () => {
      const result = await changeOwnPassword({ currentPassword, newPassword })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
    })
  }

  return (
    <div style={{ maxWidth: 480, margin: '48px auto', padding: '0 24px' }}>
      <h1 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 28, color: '#2D4A3E' }}>
        Ajustes de cuenta
      </h1>
      <p style={{ margin: '0 0 32px', fontSize: 13, color: '#6B6B6B' }}>
        Cambia tu contraseña de acceso.
      </p>

      <div style={{ background: '#fff', border: '1px solid #E0DAD0', borderRadius: 3, padding: '24px 28px' }}>
        <h2 style={{ margin: '0 0 18px', fontFamily: 'Georgia, serif', fontSize: 16, color: '#2D4A3E' }}>
          Cambiar contraseña
        </h2>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={labelStyle}>Contraseña actual</div>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            style={inputStyle}
            autoComplete="current-password"
          />
        </label>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <div style={labelStyle}>Nueva contraseña</div>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            style={inputStyle}
            autoComplete="new-password"
          />
        </label>

        <label style={{ display: 'block', marginBottom: 18 }}>
          <div style={labelStyle}>Confirmar nueva contraseña</div>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            style={inputStyle}
            autoComplete="new-password"
          />
        </label>

        {error && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: '#FFF1F1', border: '1px solid #D8AAAA', color: '#8B4444', borderRadius: 3, fontSize: 13 }}>
            {error}
          </div>
        )}

        {success && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: '#F0F5F2', border: '1px solid #B5C4BC', color: '#2D4A3E', borderRadius: 3, fontSize: 13 }}>
            Contraseña actualizada correctamente.
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !currentPassword || !newPassword || !confirm}
          style={{
            border: 'none',
            background: '#2D4A3E',
            color: '#fff',
            borderRadius: 2,
            padding: '11px 20px',
            cursor: 'pointer',
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? 'Guardando...' : 'Guardar contraseña'}
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
