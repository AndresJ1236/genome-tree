'use client'

import { useEffect, useRef, useState } from 'react'
import { setMediaDuration } from '@/app/actions/media'

interface MediaItemAV {
  id:          string
  url:         string
  mimeType:    string
  kind:        'AUDIO' | 'VIDEO'
  caption:     string | null
  durationSec: number | null
}

interface AudioVideoPlayerProps {
  item: MediaItemAV
}

/**
 * Reproductor mínimo para audio/video. Usa los elementos nativos del
 * navegador con controls={true} — sin librerías pesadas.
 *
 * Si la duración no está guardada en DB, la lee de los metadatos del
 * archivo y la persiste vía setMediaDuration. Eso evita el costo de
 * ffmpeg en el server.
 */
export function AudioVideoPlayer({ item }: AudioVideoPlayerProps) {
  const ref = useRef<HTMLAudioElement | HTMLVideoElement | null>(null)
  const [duration, setDuration] = useState<number | null>(item.durationSec)

  // Detectar duración cuando el navegador carga los metadatos
  useEffect(() => {
    if (item.durationSec != null) return  // ya guardada
    const el = ref.current
    if (!el) return
    const onMeta = () => {
      const sec = (el as HTMLMediaElement).duration
      if (Number.isFinite(sec) && sec > 0) {
        const rounded = Math.round(sec)
        setDuration(rounded)
        // Persistir en background; si falla, no mostramos error al usuario
        setMediaDuration({ mediaId: item.id, durationSec: rounded }).catch(() => {})
      }
    }
    el.addEventListener('loadedmetadata', onMeta)
    return () => el.removeEventListener('loadedmetadata', onMeta)
  }, [item.id, item.durationSec])

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div style={{
      background: '#FAF7F0',
      border: '1px solid #E0DAD0',
      borderRadius: 4,
      padding: 14,
      marginBottom: 16,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        fontSize: 11,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: '#6B7B70',
      }}>
        <span>{item.kind === 'AUDIO' ? '🎙️ Audio' : '🎬 Video'}</span>
        {duration != null && (
          <span style={{ color: '#9B9B9B' }}>· {formatDuration(duration)}</span>
        )}
      </div>

      {item.kind === 'VIDEO' ? (
        <video
          ref={ref as React.RefObject<HTMLVideoElement>}
          controls
          preload="metadata"
          src={item.url}
          style={{ width: '100%', maxHeight: 480, borderRadius: 3, background: '#000' }}
        />
      ) : (
        <audio
          ref={ref as React.RefObject<HTMLAudioElement>}
          controls
          preload="metadata"
          src={item.url}
          style={{ width: '100%' }}
        />
      )}

      {item.caption && (
        <p style={{
          margin: '10px 0 0',
          fontSize: 12,
          color: '#6B6B6B',
          fontStyle: 'italic',
          lineHeight: 1.5,
        }}>
          {item.caption}
        </p>
      )}
    </div>
  )
}
