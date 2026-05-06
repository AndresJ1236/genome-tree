'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'gtree-onboarded-v1'

const STEPS_DESKTOP = [
  { icon: '✋', title: 'Navega', desc: 'Arrastra el fondo para moverte. Usa la rueda del ratón para acercar y alejar.' },
  { icon: '👆', title: 'Selecciona', desc: 'Haz clic en cualquier persona para ver su perfil, fotos e historial familiar.' },
  { icon: '🔍', title: 'Busca', desc: 'Escribe un nombre en la barra de búsqueda (arriba a la izquierda) para encontrar personas.' },
  { icon: '⌖', title: 'Vuelve a ti', desc: 'Si te pierdes, el botón "Ir a mí" (abajo a la derecha) te centra en tu posición.' },
]

const STEPS_MOBILE = [
  { icon: '☝️', title: 'Muévete', desc: 'Arrastra con un dedo para navegar por el árbol.' },
  { icon: '🤌', title: 'Zoom', desc: 'Pellizca con dos dedos para acercar o alejar.' },
  { icon: '👆', title: 'Selecciona', desc: 'Toca cualquier persona para ver su perfil y fotos.' },
  { icon: '🔍', title: 'Busca', desc: 'Usa la barra de búsqueda arriba para encontrar personas.' },
]

export function OnboardingOverlay() {
  const [visible, setVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
    } catch {
      // localStorage not available
    }
    const mq = window.matchMedia('(max-width: 640px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* noop */ }
    setVisible(false)
  }

  if (!visible) return null

  const steps = isMobile ? STEPS_MOBILE : STEPS_DESKTOP

  return (
    <div
      style={{
        position:       'absolute',
        inset:          0,
        zIndex:         30,
        display:        'flex',
        alignItems:     isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        background:     'rgba(245, 240, 232, 0.82)',
        backdropFilter: 'blur(3px)',
        padding:        isMobile ? '0' : '24px',
      }}
    >
      <div
        style={{
          background:  '#FDFAF5',
          border:      '1px solid #D8D3CA',
          borderRadius: isMobile ? '12px 12px 0 0' : 4,
          padding:     isMobile ? '20px 20px' : '32px 36px 28px',
          paddingBottom: isMobile
            ? 'calc(32px + env(safe-area-inset-bottom, 0px))'
            : '28px',
          maxWidth:    460,
          width:       '100%',
          boxShadow:   isMobile ? '0 -8px 40px rgba(0,0,0,0.14)' : '0 12px 40px rgba(0,0,0,0.12)',
          maxHeight:   isMobile ? '85dvh' : 'none',
          overflowY:   'auto',
        }}
      >
        {/* Drag handle en móvil */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#C8D0CA' }} />
          </div>
        )}

        <h2 style={{
          margin: '0 0 4px',
          fontFamily: 'Georgia, serif',
          fontSize: isMobile ? 18 : 22,
          color: '#2D4A3E',
        }}>
          Bienvenido al árbol familiar
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#4a4a4a' }}>
          Gestos básicos para usar el árbol:
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: isMobile ? 10 : 14,
          marginBottom: 24,
        }}>
          {steps.map(step => (
            <div
              key={step.title}
              style={{
                background:   '#F5F0E8',
                border:       '1px solid #E0DAD0',
                borderRadius: 3,
                padding:      isMobile ? '12px 14px' : '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: isMobile ? 18 : 20 }}>{step.icon}</span>
                <span style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: '#2D4A3E', fontWeight: 600 }}>
                  {step.title}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#4a4a4a', lineHeight: 1.55 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>

        <div style={{
          display:        'flex',
          flexDirection:  isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems:     isMobile ? 'stretch' : 'center',
          gap:            12,
        }}>
          {!isMobile && (
            <p style={{ margin: 0, fontSize: 13, color: '#6B7B70', lineHeight: 1.5 }}>
              Puedes volver a esta guía usando el botón <strong>? Ayuda</strong> del menú.
            </p>
          )}
          <button
            onClick={dismiss}
            style={{
              background:    '#2D4A3E',
              color:         '#fff',
              border:        'none',
              borderRadius:  2,
              padding:       isMobile ? '14px 0' : '12px 24px',
              cursor:        'pointer',
              fontSize:      14,
              letterSpacing: '0.04em',
              flexShrink:    0,
              width:         isMobile ? '100%' : 'auto',
            }}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
