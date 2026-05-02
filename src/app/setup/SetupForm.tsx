'use client'

import { useActionState } from 'react'
import { setupFamily } from '@/app/actions/setup'

const field: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
}
const label: React.CSSProperties = {
  fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B6B6B',
}
const input: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #D8D3CA', borderRadius: 4,
  fontSize: 14, background: '#fff', color: '#2D2D2D', outline: 'none',
  fontFamily: 'inherit',
}

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupFamily, null)

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const slugInput = e.currentTarget.form?.elements.namedItem('familySlug') as HTMLInputElement | null
    if (slugInput && !slugInput.dataset.edited) {
      slugInput.value = slugify(e.target.value)
    }
  }

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 12, color: '#6B6B6B', margin: 0, borderBottom: '1px solid #EDE9E0', paddingBottom: 12 }}>
          Familia
        </p>
        <div style={field}>
          <label style={label}>Nombre de la familia</label>
          <input name="familyName" style={input} placeholder="Ej: Familia Martínez" required onChange={handleNameChange} />
        </div>
        <div style={field}>
          <label style={label}>Slug (URL)</label>
          <input
            name="familySlug" style={input} placeholder="familia-martinez" required
            pattern="[a-z0-9-]+"
            onInput={e => { (e.currentTarget as HTMLInputElement).dataset.edited = '1' }}
          />
          <span style={{ fontSize: 11, color: '#9B9B9B' }}>Solo letras minúsculas, números y guiones. Aparece en la URL.</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontSize: 12, color: '#6B6B6B', margin: 0, borderBottom: '1px solid #EDE9E0', paddingBottom: 12 }}>
          Administrador
        </p>
        <div style={field}>
          <label style={label}>Nombre</label>
          <input name="adminName" style={input} placeholder="Tu nombre completo" required />
        </div>
        <div style={field}>
          <label style={label}>Correo electrónico</label>
          <input name="adminEmail" type="email" style={input} placeholder="admin@ejemplo.com" required />
        </div>
        <div style={field}>
          <label style={label}>Contraseña</label>
          <input name="password" type="password" style={input} placeholder="Mínimo 8 caracteres" required minLength={8} />
        </div>
        <div style={field}>
          <label style={label}>Confirmar contraseña</label>
          <input name="confirm" type="password" style={input} required />
        </div>
      </div>

      {state?.error && (
        <p style={{ margin: 0, padding: '8px 12px', background: '#FDF0F0', border: '1px solid #F5C6C6', borderRadius: 4, fontSize: 13, color: '#C0392B' }}>
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: '10px 0', background: '#2D4A3E', color: '#fff', border: 'none',
          borderRadius: 4, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase',
          cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
          fontFamily: 'inherit',
        }}
      >
        {pending ? 'Creando…' : 'Crear familia'}
      </button>
    </form>
  )
}
