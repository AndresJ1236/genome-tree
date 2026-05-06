'use client'

import { useState } from 'react'
import { logout } from '@/app/actions/auth'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { HelpPanel } from '@/components/ui/HelpPanel'

interface AppHeaderProps {
  familySlug: string
  role: string
  unreadCount: number
}

export function AppHeader({ familySlug, role, unreadCount }: AppHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const isAdmin = role === 'ADMIN'

  const navLinks = [
    { label: 'Árbol', href: `/${familySlug}/tree` },
    isAdmin
      ? { label: 'Administración', href: `/${familySlug}/admin` }
      : { label: 'Mis cambios', href: `/${familySlug}/settings/proposals` },
    { label: 'Ajustes', href: `/${familySlug}/settings` },
  ]

  return (
    <header
      className="flex items-center justify-between border-b"
      style={{
        background:   '#FDFAF5',
        borderColor:  '#D8D3CA',
        paddingTop:    'max(0.5rem, env(safe-area-inset-top, 0px))',
        paddingBottom: '0.5rem',
        paddingLeft:   'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight:  'max(1rem, env(safe-area-inset-right, 0px))',
      }}
    >
      {/* Logo + desktop nav */}
      <div className="flex items-center gap-3">
        <span
          className="text-sm sm:text-lg tracking-wide sm:tracking-widest uppercase"
          style={{ fontFamily: 'Georgia, Cambria, serif', color: '#2D4A3E' }}
        >
          Genome Tree
        </span>
        <span className="hidden sm:block" style={{ color: '#D8D3CA' }}>|</span>
        <nav className="hidden sm:flex gap-4">
          <a
            href={`/${familySlug}/tree`}
            className="text-sm tracking-wide uppercase"
            style={{ color: '#6B6B6B' }}
          >
            Árbol
          </a>
          {isAdmin ? (
            <a
              href={`/${familySlug}/admin`}
              className="text-sm tracking-wide uppercase"
              style={{ color: '#6B6B6B' }}
            >
              Administración
            </a>
          ) : (
            <a
              href={`/${familySlug}/settings/proposals`}
              className="text-sm tracking-wide uppercase"
              style={{ color: '#6B6B6B' }}
            >
              Mis cambios
            </a>
          )}
        </nav>
      </div>

      {/* Desktop right */}
      <div className="hidden sm:flex items-center gap-3">
        {isAdmin && (
          <span
            className="px-1.5 py-0.5 text-xs rounded-sm"
            style={{ background: '#EAF0ED', color: '#2D4A3E' }}
          >
            Admin
          </span>
        )}
        <NotificationBell initialUnreadCount={unreadCount} />
        <HelpPanel />
        <a
          href={`/${familySlug}/settings`}
          className="text-sm tracking-wide uppercase"
          style={{ color: '#6B6B6B' }}
        >
          Ajustes
        </a>
        <form action={logout}>
          <button
            type="submit"
            className="text-sm tracking-wide uppercase"
            style={{ color: '#6B6B6B' }}
          >
            Salir
          </button>
        </form>
      </div>

      {/* Mobile right: campana + hamburguesa */}
      <div className="flex sm:hidden items-center gap-2">
        <NotificationBell initialUnreadCount={unreadCount} />
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menú"
          style={{
            background: 'none',
            border: '1.5px solid #C8D0CA',
            borderRadius: 3,
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#2D4A3E',
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ☰
        </button>
      </div>

      {/* Backdrop del drawer */}
      <div
        onClick={() => setDrawerOpen(false)}
        style={{
          position:      'fixed',
          inset:         0,
          background:    'rgba(0,0,0,0.25)',
          zIndex:        60,
          opacity:       drawerOpen ? 1 : 0,
          pointerEvents: drawerOpen ? 'auto' : 'none',
          transition:    'opacity 0.25s ease',
        }}
      />

      {/* Drawer lateral derecho */}
      <div
        style={{
          position:      'fixed',
          top:           0,
          right:         0,
          height:        '100dvh',
          width:         280,
          background:    '#FDFAF5',
          borderLeft:    '1px solid #D8D3CA',
          boxShadow:     '-6px 0 32px rgba(0,0,0,0.12)',
          zIndex:        70,
          display:       'flex',
          flexDirection: 'column',
          transform:     drawerOpen ? 'translateX(0)' : 'translateX(100%)',
          transition:    'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          overflow:      'hidden',
        }}
      >
        {/* Cabecera del drawer */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '20px 20px 16px',
            borderBottom:   '1px solid #E8E4DC',
          }}
        >
          <span
            style={{
              fontFamily:    'Georgia, serif',
              color:         '#2D4A3E',
              fontSize:      13,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Genome Tree
          </span>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Cerrar menú"
            style={{
              background:  'none',
              border:      '1.5px solid #C8D0CA',
              borderRadius: '50%',
              width:       28,
              height:      28,
              display:     'flex',
              alignItems:  'center',
              justifyContent: 'center',
              cursor:      'pointer',
              color:       '#6B7B70',
              fontSize:    13,
            }}
          >
            ✕
          </button>
        </div>

        {/* Links de navegación */}
        <nav style={{ display: 'flex', flexDirection: 'column' }}>
          {navLinks.map(item => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setDrawerOpen(false)}
              style={{
                padding:       '14px 20px',
                fontFamily:    'Georgia, serif',
                fontSize:      13,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color:         '#2C2C2C',
                textDecoration: 'none',
                borderBottom:  '1px solid #F0EBE2',
                display:       'block',
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Footer: badge admin + ayuda + salir */}
        <div
          style={{
            marginTop: 'auto',
            padding:   '20px',
            borderTop: '1px solid #E8E4DC',
            display:   'flex',
            flexDirection: 'column',
            gap:       14,
          }}
        >
          {isAdmin && (
            <span
              style={{
                padding:      '3px 8px',
                background:   '#EAF0ED',
                color:        '#2D4A3E',
                fontSize:     11,
                borderRadius: 2,
                alignSelf:    'flex-start',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Admin
            </span>
          )}
          <HelpPanel />
          <form action={logout}>
            <button
              type="submit"
              style={{
                fontFamily:    'Georgia, serif',
                fontSize:      13,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color:         '#6B6B6B',
                background:    'none',
                border:        'none',
                cursor:        'pointer',
                padding:       0,
              }}
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
