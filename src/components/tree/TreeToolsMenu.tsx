'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface TreeToolsMenuProps {
  familySlug: string
  isAdmin: boolean
}

const ANIM_MS = 220

/**
 * Botón hamburguesa que abre un panel deslizante con animación desde el
 * lado derecho (transform: translateX). Estados:
 *   • mounted=false           — DOM no renderizado, drawer cerrado
 *   • mounted=true, open=false — DOM renderizado, animando salida
 *   • mounted=true, open=true  — drawer visible, animación entrada
 */
export function TreeToolsMenu({ familySlug, isAdmin }: TreeToolsMenuProps) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)

  function openDrawer() {
    setMounted(true)
    // requestAnimationFrame asegura que React aplica el estado inicial
    // (translateX(100%)) ANTES de cambiar a translateX(0), para que CSS
    // detecte el cambio y dispare la transición.
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
  }

  function closeDrawer() {
    setOpen(false)
    setTimeout(() => setMounted(false), ANIM_MS)
  }

  // Cerrar con ESC para no atrapar al usuario
  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted])

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        title="Más herramientas"
        className="no-underline border rounded-sm uppercase tracking-wide flex-shrink-0"
        style={{
          border: '1px solid #C8D4CE', color: '#2D4A3E',
          padding: '6px 10px', fontSize: 14, background: '#FFFDF9',
          cursor: 'pointer', lineHeight: 1,
        }}
      >
        ☰
      </button>

      {mounted && (
        <>
          {/* Backdrop con fade — click cierra el panel */}
          <div
            onClick={closeDrawer}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.25)',
              zIndex: 49,
              opacity: open ? 1 : 0,
              transition: `opacity ${ANIM_MS}ms ease-out`,
            }}
          />
          {/* Panel deslizante con translateX */}
          <aside
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: 'min(320px, 88vw)', background: '#F5F0E8',
              borderLeft: '1px solid #D8D2C7', zIndex: 50,
              display: 'flex', flexDirection: 'column',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.12)',
              transform: open ? 'translateX(0)' : 'translateX(100%)',
              transition: `transform ${ANIM_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              willChange: 'transform',
            }}
          >
            <div style={{
              padding: '18px 20px', borderBottom: '1px solid #E0DAD0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h2 style={{
                fontFamily: 'Georgia, serif', fontSize: 18, color: '#2D4A3E', margin: 0,
              }}>
                Herramientas
              </h2>
              <button
                type="button"
                onClick={closeDrawer}
                style={{
                  background: 'transparent', border: 'none', fontSize: 22,
                  color: '#6B6B6B', cursor: 'pointer', padding: 0, lineHeight: 1,
                }}
                title="Cerrar"
              >
                ✕
              </button>
            </div>

            <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
              <MenuItem
                href={`/${familySlug}/timeline`}
                icon="🕒"
                label="Línea de tiempo"
                description="Eventos familiares por década"
                onClick={closeDrawer}
              />
              <MenuItem
                href={`/${familySlug}/map`}
                icon="🗺️"
                label="Mapa de orígenes"
                description="Lugares de nacimiento en el mapa"
                onClick={closeDrawer}
              />

              {isAdmin && (
                <>
                  <Divider label="Exportar" />
                  <MenuItem
                    href="/api/relations/export"
                    icon="📄"
                    label="JSON"
                    description="Datos crudos del árbol"
                    external
                  />
                  <MenuItem
                    href="/api/gedcom/export"
                    icon="🌳"
                    label="GEDCOM"
                    description="Para Ancestry, MyHeritage, FamilySearch"
                    external
                  />
                </>
              )}

              <Divider label="Mi cuenta" />
              <MenuItem
                href={`/${familySlug}/settings`}
                icon="⚙️"
                label="Configuración"
                description="Preferencias y cuenta"
                onClick={closeDrawer}
              />
            </nav>
          </aside>
        </>
      )}
    </>
  )
}

function MenuItem({
  href, icon, label, description, onClick, external,
}: {
  href: string
  icon: string
  label: string
  description: string
  onClick?: () => void
  external?: boolean
}) {
  const style = {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '12px 20px', textDecoration: 'none', color: '#2C2C2C',
    transition: 'background 0.15s',
  } as const

  const inner = (
    <>
      <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, color: '#2D4A3E', fontWeight: 500 }}>{label}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#8B9E94' }}>{description}</p>
      </div>
    </>
  )

  if (external) {
    return (
      <a
        href={href}
        style={style}
        onMouseEnter={e => { e.currentTarget.style.background = '#EAE5DB' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
      >
        {inner}
      </a>
    )
  }
  return (
    <Link
      href={href}
      onClick={onClick}
      style={style}
      onMouseEnter={e => { e.currentTarget.style.background = '#EAE5DB' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {inner}
    </Link>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <p style={{
      margin: '14px 20px 4px', fontSize: 10,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      color: '#8B9E94', fontWeight: 600,
    }}>
      {label}
    </p>
  )
}
