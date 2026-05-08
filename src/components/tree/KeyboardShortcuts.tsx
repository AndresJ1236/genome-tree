'use client'

import { useEffect, useState } from 'react'

interface KeyboardShortcutsProps {
  /** Callback ESC — el padre cierra paneles/menús abiertos */
  onEscape?: () => void
}

/**
 * Atajos globales del árbol:
 *   /       → enfoca el input de búsqueda
 *   ?       → muestra/oculta el overlay con la lista de atajos
 *   ESC     → cierra paneles abiertos (vía callback)
 *
 * Diseñado para no interferir con la entrada de texto: si el usuario
 * está escribiendo en un input/textarea/contenteditable, los atajos no
 * se disparan (excepto ESC para cerrar overlays).
 */
export function KeyboardShortcuts({ onEscape }: KeyboardShortcutsProps) {
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    function isTyping() {
      const a = document.activeElement
      if (!a) return false
      const tag = a.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if ((a as HTMLElement).isContentEditable) return true
      return false
    }

    function handleKey(e: KeyboardEvent) {
      // ESC siempre fuera del filtro: queremos poder cerrar paneles
      // incluso desde un input (el blur lo resuelve naturalmente).
      if (e.key === 'Escape') {
        if (helpOpen) {
          setHelpOpen(false)
          e.preventDefault()
          return
        }
        onEscape?.()
        return
      }

      if (isTyping()) return

      if (e.key === '/') {
        const input = document.getElementById('tree-search-input') as HTMLInputElement | null
        if (input && !input.disabled) {
          input.focus()
          input.select()
          e.preventDefault()
        }
      } else if (e.key === '?') {
        setHelpOpen(v => !v)
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [helpOpen, onEscape])

  if (!helpOpen) return null

  return (
    <div
      onClick={() => setHelpOpen(false)}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFDF9', border: '1px solid #D8D3CA', borderRadius: 4,
          padding: '24px 28px', maxWidth: 380, width: '90%',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        }}
      >
        <h2 style={{
          margin: '0 0 16px', fontFamily: 'Georgia, serif', fontSize: 20, color: '#2D4A3E',
        }}>
          Atajos de teclado
        </h2>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ShortcutRow keys={['/']} description="Enfocar la búsqueda" />
          <ShortcutRow keys={['?']} description="Mostrar/ocultar esta lista" />
          <ShortcutRow keys={['Esc']} description="Cerrar paneles y menús" />
          <ShortcutRow keys={['Hover 1s']} description="Abrir menú de acciones rápidas en una persona" />
        </ul>
        <p style={{ margin: '18px 0 0', fontSize: 11, color: '#8B9E94', textAlign: 'center' }}>
          Presiona <Kbd>Esc</Kbd> o haz click fuera para cerrar
        </p>
      </div>
    </div>
  )
}

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#3a3a3a' }}>
      <div style={{ display: 'flex', gap: 4, minWidth: 90 }}>
        {keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}
      </div>
      <span>{description}</span>
    </li>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: 'inline-block', padding: '2px 8px',
      background: '#F0EBE2', border: '1px solid #D8D3CA',
      borderRadius: 3, fontSize: 11, fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      color: '#2D4A3E',
    }}>
      {children}
    </kbd>
  )
}
