import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Genome Tree',
  description: 'Archivo familiar privado e interactivo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  )
}
