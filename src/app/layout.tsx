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

  // Inline script para aplicar el tema ANTES del primer render. Evita
  // el "flash de luz" al cargar para usuarios con dark mode activado.
  // Se ejecuta tan pronto el browser parsea el head — antes de que React
  // hidrate y antes de que CSS pinte el body.
  const themeScript = `(function(){try{var t=localStorage.getItem('genome-tree-theme');if(t==='dark')document.documentElement.dataset.theme='dark';}catch(e){}})();`

  return (
    <html lang="es" className="h-full">
      <head>
        <script nonce={nonce || undefined} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full" {...(nonce ? { 'data-nonce': nonce } : {})}>{children}</body>
    </html>
  )
}
