'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { BirthPlaceCluster } from '@/app/actions/people'

interface OriginMapProps {
  clusters:   BirthPlaceCluster[]
  familySlug: string
}

interface GeocodedCluster extends BirthPlaceCluster {
  lat: number
  lng: number
}

/**
 * Mapa de Leaflet con un marker por cada lugar de nacimiento agregado.
 *
 * La geocoding se hace en el cliente con Nominatim (OpenStreetMap, gratis,
 * sin API key). Cada lugar se queda cacheado en localStorage para no abusar
 * del rate limit (1 req/sec recomendado).
 *
 * Tiles: OpenStreetMap directo. Para uso heavy se podría migrar a un
 * servicio con CDN tipo MapTiler (free tier muy generoso) pero para
 * un proyecto familiar OSM aguanta de sobra.
 */
export function OriginMap({ clusters, familySlug }: OriginMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<unknown>(null)
  const [geocoded, setGeocoded] = useState<GeocodedCluster[]>([])
  const [progress, setProgress] = useState({ done: 0, total: clusters.length, errors: 0 })

  // Geocoding lazy con cache
  useEffect(() => {
    let cancelled = false

    async function geocodeAll() {
      const cache = readCache()
      const results: GeocodedCluster[] = []
      let done = 0
      let errors = 0

      for (const c of clusters) {
        if (cancelled) return
        const cached = cache[c.place]
        if (cached) {
          if (cached.lat != null && cached.lng != null) {
            results.push({ ...c, lat: cached.lat, lng: cached.lng })
          }
        } else {
          try {
            const coords = await geocodePlace(c.place)
            cache[c.place] = coords ?? { lat: null, lng: null }
            writeCache(cache)
            if (coords) {
              results.push({ ...c, lat: coords.lat, lng: coords.lng })
            }
            // Rate limit: Nominatim pide 1 req/sec
            await sleep(1100)
          } catch {
            errors++
          }
        }
        done++
        setProgress({ done, total: clusters.length, errors })
      }
      if (!cancelled) setGeocoded(results)
    }

    geocodeAll()
    return () => { cancelled = true }
  }, [clusters])

  // Inicializar mapa cuando hay datos geocodeados
  useEffect(() => {
    if (geocoded.length === 0 || !containerRef.current) return

    let active = true

    ;(async () => {
      const L = (await import('leaflet')).default
      // CSS de leaflet vía import dinámico
      await import('leaflet/dist/leaflet.css' as string).catch(() => {})

      if (!active || !containerRef.current) return

      // Inicializar mapa solo una vez
      if (!mapRef.current) {
        const map = L.map(containerRef.current).setView([0, 0], 2)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(map)
        mapRef.current = map
      }

      const map = mapRef.current as InstanceType<typeof L.Map>
      const bounds = L.latLngBounds([])

      for (const c of geocoded) {
        const radius = Math.max(8, Math.min(28, 8 + c.count * 3))
        const marker = L.circleMarker([c.lat, c.lng], {
          radius,
          color:       '#2D4A3E',
          fillColor:   '#5B8A75',
          fillOpacity: 0.6,
          weight:      2,
        }).addTo(map)

        const linksHtml = c.personIds
          .map(id => `<a href="/${familySlug}/person/${id}" style="display:block;font-size:11px;color:#2D4A3E;text-decoration:underline;margin-top:2px">→ Ver persona</a>`)
          .slice(0, 5)
          .join('')

        marker.bindPopup(`
          <div style="font-family: Georgia, serif; min-width: 160px">
            <div style="font-size:14px;font-weight:600;color:#2D4A3E;margin-bottom:4px">${escapeHtml(c.place)}</div>
            <div style="font-size:11px;color:#6B6B6B;margin-bottom:6px">${c.count} ${c.count === 1 ? 'persona' : 'personas'}</div>
            ${linksHtml}
          </div>
        `)

        bounds.extend([c.lat, c.lng])
      }

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 8 })
      }
    })()

    return () => { active = false }
  }, [geocoded, familySlug])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {progress.total > 0 && progress.done < progress.total && (
        <div style={{
          padding: '8px 16px',
          background: '#FFF8E6',
          borderBottom: '1px solid #E8D68A',
          fontSize: 12,
          color: '#8B6411',
          textAlign: 'center',
        }}>
          📍 Localizando lugares: {progress.done} / {progress.total}
          {progress.errors > 0 && ` · ${progress.errors} no encontrados`}
        </div>
      )}

      {progress.done === progress.total && geocoded.length === 0 && (
        <div style={{
          padding: 24, textAlign: 'center', color: '#8B9E94', fontSize: 13,
        }}>
          No se pudo localizar ninguno de los {clusters.length} lugares.
          Verifica que los textos de "lugar de nacimiento" estén bien escritos
          (ej. "Quito, Ecuador" funciona mejor que "Quito").
        </div>
      )}

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, background: '#E8E2D5' }} />

      <div style={{
        padding: '8px 16px',
        background: '#FAF7F0',
        borderTop: '1px solid #E0DAD0',
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
        fontSize: 11,
        color: '#6B6B6B',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Link href={`/${familySlug}/tree`} style={{ color: '#2D4A3E', textDecoration: 'none' }}>
          ← Volver al árbol
        </Link>
        <span>
          {geocoded.length} de {clusters.length} lugares mapeados ·
          círculos más grandes = más personas nacidas ahí
        </span>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

const CACHE_KEY = 'genome-geocode-v1'

function readCache(): Record<string, { lat: number | null; lng: number | null }> {
  if (typeof localStorage === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') }
  catch { return {} }
}

function writeCache(cache: Record<string, { lat: number | null; lng: number | null }>) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) }
  catch { /* localStorage full o privado */ }
}

async function geocodePlace(place: string): Promise<{ lat: number; lng: number } | null> {
  // Nominatim de OpenStreetMap. User-Agent es buena práctica.
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
  if (!res.ok) return null
  const data = await res.json() as Array<{ lat: string; lon: string }>
  if (data.length === 0) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
