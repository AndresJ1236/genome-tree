'use client'

import { useEffect, useRef, useState } from 'react'

interface ConfirmButtonProps {
  label: string
  confirmLabel?: string
  onConfirm: () => void
  disabled?: boolean
  style?: React.CSSProperties
}

// Botón de dos clics: primer clic muestra "¿Seguro?", segundo clic ejecuta.
// Si el usuario no confirma en 3 segundos, vuelve al estado normal.
export function ConfirmButton({
  label,
  confirmLabel = '¿Seguro? Sí, eliminar',
  onConfirm,
  disabled,
  style,
}: ConfirmButtonProps) {
  const [pending, setPending] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleClick() {
    if (!pending) {
      setPending(true)
      timerRef.current = setTimeout(() => setPending(false), 3000)
    } else {
      if (timerRef.current) clearTimeout(timerRef.current)
      setPending(false)
      onConfirm()
    }
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      style={
        pending
          ? { ...style, border: '1px solid #C87070', background: '#8B4444', color: '#fff', transition: 'background 0.15s, color 0.15s' }
          : { border: '1px solid #E6C1C1', background: '#FFF5F5', color: '#8B4444', borderRadius: 2, cursor: 'pointer', transition: 'background 0.15s, color 0.15s', ...style }
      }
    >
      {pending ? confirmLabel : label}
    </button>
  )
}
