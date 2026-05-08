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

/** Remove diacritics (for slug generation). */
function deaccent(s: string) {
  // eslint-disable-next-line no-control-regex
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function slugify(s: string) {
  return deaccent(s).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

/**
 * Derive the default family name from the administrator's full name.
 * Spanish names end with two last names, so we take the last 2 words.
 * "Carlos Martínez Santos" → "Familia Martínez Santos"
 * "Juan García"            → "Familia García"
 */
function deriveFamilyName(adminName: string): string {
  const words = adminName.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 3) return `Familia ${words[words.length - 2]} ${words[words.length - 1]}`
  if (words.length === 2) return `Familia ${words[1]}`
  if (words.length === 1) return `Familia ${words[0]}`
  return ''
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupFamily, null)

  function handleAdminNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const form = e.currentTarget.form
    const familyNameInput = form?.elements.namedItem('familyName') as HTMLInputElement | null
    const slugInput       = form?.elements.namedItem('familySlug') as HTMLInputElement | null
    const name = e.target.value

    if (familyNameInput && !familyNameInput.dataset.edited) {
      familyNameInput.value = deriveFamilyName(name)
    }
    if (slugInput && !slugInput.dataset.edited) {
      slugInput.value = slugify(deriveFamilyName(name))
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
          <input
            name="familyName" style={input} placeholder="Ej: Familia Martínez Santos" required
            onInput={e => { (e.currentTarget as HTMLInputElement).dataset.edited = '1' }}
          />
        </div>
        <div style={field}>
          <label style={label}>Slug (URL)</label>
          <input
            name="familySlug" style={input} placeholder="familia-martinez-santos" required
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
          <label style={label}>Nombre completo</label>
          <input
            name="adminName" style={input} placeholder="Ej: Carlos Martínez Santos" required
            onChange={handleAdminNameChange}
          />
          <span style={{ fontSize: 11, color: '#9B9B9B' }}>Nombre y apellidos — se usarán para generar el nombre de la familia.</span>
        </div>
        <div style={field}>
          <label style={label}>Usuario</label>
          <input name="adminUsername" type="text" style={input} placeholder="admin" required autoComplete="username" />
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
