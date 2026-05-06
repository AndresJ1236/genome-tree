import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Genome Tree',
  description: 'Archivo familiar privado e interactivo',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Next.js reads x-nonce (set by proxy.ts) and applies it to its own inline
  // scripts. Reading it here also makes it available for any custom <script> tags.
  const nonce = (await headers()).get('x-nonce') ?? ''

  return (
    <html lang="es" className="h-full">
      <body className="h-full" {...(nonce ? { 'data-nonce': nonce } : {})}>{children}</body>
    </html>
  )
}
