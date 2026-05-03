'use client'

import { useState } from 'react'

const PANEL_W = 340

const SECTIONS = [
  {
    title: 'Árbol familiar',
    items: [
      { icon: '↔', text: 'Arrastra el fondo para moverte por el árbol.' },
      { icon: '⊕', text: 'Usa la rueda del ratón o el gesto de pellizco para hacer zoom.' },
      { icon: '○', text: 'Haz clic en una persona para abrir su panel lateral.' },
      { icon: '✕', text: 'Presiona Escape o haz clic fuera del panel para cerrarlo.' },
    ],
  },
  {
    title: 'Buscar personas',
    items: [
      { icon: '◎', text: 'Escribe al menos 2 caracteres en la barra de búsqueda.' },
      { icon: '◉', text: 'Al seleccionar un resultado, el árbol se centra en esa persona automáticamente.' },
    ],
  },
  {
    title: 'Panel lateral',
    items: [
      { icon: '◈', text: '"Ver perfil completo" abre la página de la persona con todo su archivo.' },
      { icon: '◇', text: '"Editar datos" te lleva al formulario de edición (si tienes permisos).' },
      { icon: '+', text: '"Agregar contenido" abre directamente el formulario de nuevo contenido.' },
    ],
  },
  {
    title: 'Tus cambios pendientes',
    items: [
      { icon: '◌', text: 'Si no tienes permisos de edición directa, los cambios que envíes quedan pendientes de aprobación por el administrador.' },
      { icon: '◆', text: 'Puedes ver el estado de tus cambios en "Mis cambios" (menú superior).' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { icon: '⊞', text: 'Desde el panel de Administración puedes invitar usuarios, revisar propuestas y gestionar la configuración.' },
      { icon: '↺', text: 'Genera links de recuperación de contraseña para usuarios que hayan olvidado sus credenciales.' },
    ],
  },
]

export function HelpPanel() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Botón Ayuda en el header */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Ayuda"
        style={{
          height: 32, borderRadius: 3,
          border: '1.5px solid #C8D0CA',
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 5,
          padding: '0 10px',
          color: '#6B7B70', fontSize: 13,
          fontFamily: 'Georgia, serif',
          transition: 'border-color 0.2s, color 0.2s',
          flexShrink: 0,
          letterSpacing: '0.04em',
        }}
        onMouseEnter={e => {
          const b = e.currentTarget
          b.style.borderColor = '#2D4A3E'
          b.style.color = '#2D4A3E'
        }}
        onMouseLeave={e => {
          const b = e.currentTarget
          b.style.borderColor = '#C8D0CA'
          b.style.color = '#6B7B70'
        }}
      >
        <span style={{ fontStyle: 'italic', fontWeight: 700, fontSize: 14 }}>?</span>
        <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ayuda</span>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            zIndex: 60,
            background: 'rgba(0,0,0,0.18)',
          }}
        />
      )}

      {/* Panel deslizante */}
      <aside
        style={{
          position: 'fixed',
          top: 0, right: 0,
          height: '100dvh',
          width: PANEL_W,
          background: '#FAFAF7',
          borderLeft: '1px solid #DDE4DF',
          boxShadow: '-6px 0 32px rgba(0,0,0,0.10)',
          zIndex: 70,
          transform: open ? 'translateX(0)' : `translateX(${PANEL_W}px)`,
          transition: 'transform 0.30s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Cabecera */}
        <div style={{
          padding: '20px 24px 18px',
          borderBottom: '1px solid #E1DCD3',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{ margin: 0, fontFamily: 'Georgia, serif', fontSize: 17, color: '#2D4A3E' }}>
            Ayuda
          </h2>
          <button
            onClick={() => setOpen(false)}
            style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '1.5px solid #C8D0CA', background: 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: '#6B7B70', fontSize: 13,
            }}
          >
            ✕
          </button>
        </div>

        {/* Contenido */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px 32px' }}>
          {SECTIONS.map(section => (
            <div key={section.title} style={{ marginBottom: 28 }}>
              <p style={{
                margin: '0 0 10px',
                fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: '#8B9E94', fontFamily: 'Georgia, serif',
              }}>
                {section.title}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {section.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{
                      width: 20, flexShrink: 0, textAlign: 'center',
                      fontSize: 12, color: '#2D4A3E', marginTop: 1,
                    }}>
                      {item.icon}
                    </span>
                    <p style={{ margin: 0, fontSize: 12, color: '#4a4a4a', lineHeight: 1.55 }}>
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div style={{
            marginTop: 8, padding: '14px 16px',
            background: '#F0F5F2', border: '1px solid #C8D4CE',
            borderRadius: 3,
          }}>
            <p style={{ margin: 0, fontSize: 11, color: '#4a5c54', lineHeight: 1.6 }}>
              ¿Ves un <span style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>?</span> junto a una opción?
              Pasa el cursor encima para ver una explicación rápida.
            </p>
          </div>
        </div>
      </aside>
    </>
  )
}
