import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { SetupForm } from './SetupForm'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const count = await prisma.family.count()
  if (count > 0) redirect('/login')

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F5F1EA', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        background: '#FDFAF5', border: '1px solid #D8D3CA', borderRadius: 8,
        padding: '36px 32px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'Georgia, Cambria, serif',
            fontSize: 22, fontWeight: 400, color: '#2D4A3E',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            margin: '0 0 8px',
          }}>
            Genome Tree
          </h1>
          <p style={{ fontSize: 13, color: '#6B6B6B', margin: 0 }}>
            Configura tu primera familia para empezar
          </p>
        </div>

        <SetupForm />
      </div>
    </div>
  )
}
