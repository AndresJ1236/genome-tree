'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'gtree-onboarded-v1'

const STEPS = [
  { icon: '↔', title: 'Navega', desc: 'Arrastra el fondo para moverte por el árbol. Usa la rueda para hacer zoom.' },
  { icon: '○', title: 'Selecciona', desc: 'Haz clic en cualquier persona para ver su perfil, fotos e historial.' },
  { icon: '◎', title: 'Busca', desc: 'Usa la barra de búsqueda (arriba a la izquierda) para encontrar personas por nombre.' },
  { icon: '◈', title: 'Agrega', desc: 'Desde el panel lateral puedes editar datos y agregar contenido directamente.' },
]

export function OnboardingOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
    } catch {
      // localStorage not available
    }
  }, [])

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* noop */ }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(245, 240, 232, 0.82)',
        backdropFilter: 'blur(3px)',
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#FDFAF5',
          border: '1px solid #D8D3CA',
          borderRadius: 4,
          padding: '32px 36px 28px',
          maxWidth: 460,
          width: '100%',
          boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
        }}
      >
        <h2 style={{ margin: '0 0 6px', fontFamily: 'Georgia, serif', fontSize: 22, color: '#2D4A3E' }}>
          Bienvenido al árbol
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: '#6B6B6B' }}>
          Aquí tienes todo lo que necesitas saber para empezar.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
          {STEPS.map(step => (
            <div
              key={step.title}
              style={{
                background: '#F5F0E8',
                border: '1px solid #E0DAD0',
                borderRadius: 3,
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16, color: '#2D4A3E', width: 20, textAlign: 'center' }}>
                  {step.icon}
                </span>
                <span style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#2D4A3E', fontWeight: 600 }}>
                  {step.title}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#4a4a4a', lineHeight: 1.55 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#8B9E94' }}>
            Puedes volver a esta guía desde el botón <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>?</span> en la cabecera.
          </p>
          <button
            onClick={dismiss}
            style={{
              background: '#2D4A3E', color: '#fff',
              border: 'none', borderRadius: 2,
              padding: '10px 22px',
              cursor: 'pointer', fontSize: 12,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              flexShrink: 0, marginLeft: 16,
            }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
