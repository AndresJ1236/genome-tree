'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { computeTreeLayout, NODE_W, NODE_H } from '@/lib/tree-layout'
import type { PersonData, RelationshipData } from '@/lib/tree-types'
import { PersonNode } from './PersonNode'
import { FamilyEdges } from './FamilyEdges'
import { PersonPanel } from './PersonPanel'
import { TreeSearch } from './TreeSearch'
import { OnboardingOverlay } from './OnboardingOverlay'
import { QuickActionMenu, type QuickActionTarget } from './QuickActionMenu'

const CANVAS_PAD = 120
const CENTER_SCALE = 1.2
// Buffer in canvas-space pixels around the viewport to pre-render nearby nodes
const VIRT_BUFFER = 320

interface FamilyTreeProps {
  persons:        PersonData[]
  relationships:  RelationshipData[]
  familySlug:     string
  searchEnabled:  boolean
  focusPersonId?: string
  /** Si el viewer puede crear personas — habilita el menú radial de acciones rápidas. */
  canCreatePerson?: boolean
  /** Si el viewer es admin — añade la burbuja "Invitar" al menú radial. */
  isAdmin?: boolean
}

export function FamilyTree({ persons, relationships, familySlug, searchEnabled, focusPersonId, canCreatePerson, isAdmin }: FamilyTreeProps) {
  const { nodes, familyUnits, petLinks, siblingLinks, bounds } = useMemo(
    () => computeTreeLayout(persons, relationships, { focusPersonId }),
    [persons, relationships, focusPersonId]
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quickAction, setQuickAction] = useState<QuickActionTarget | null>(null)

  // Index rápido de persons para resolver hasFather/hasMother en long-press
  const personById = useMemo(() => {
    const m = new Map<string, PersonData>()
    for (const p of persons) m.set(p.id, p)
    return m
  }, [persons])

  const highlighted = useMemo(() => {
    if (!selectedId) return new Set<string>()
    const set = new Set<string>()
    for (const unit of familyUnits) {
      const inUnit =
        unit.parent1Id === selectedId ||
        unit.parent2Id === selectedId ||
        unit.childIds.includes(selectedId)
      if (inUnit) {
        set.add(unit.parent1Id)
        if (unit.parent2Id) set.add(unit.parent2Id)
        unit.childIds.forEach(c => set.add(c))
      }
    }
    set.delete(selectedId)
    return set
  }, [selectedId, familyUnits])

  const viewportRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const transformRef = useRef(transform)

  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 })
  const isPinchingRef = useRef(false)
  const [centering, setCentering] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const canvasW = bounds.maxX - bounds.minX + CANVAS_PAD * 2
  const canvasH = bounds.maxY - bounds.minY + CANVAS_PAD * 2

  const centerOnNode = useCallback((personId: string) => {
    const node = nodes.find(n => n.id === personId)
    const el = viewportRef.current
    if (!node || !el) return
    const vw = el.clientWidth
    const vh = el.clientHeight
    const scale = CENTER_SCALE
    const offsetX = -bounds.minX + CANVAS_PAD
    const offsetY = -bounds.minY + CANVAS_PAD
    const cx = node.x + offsetX + NODE_W / 2
    const cy = node.y + offsetY + NODE_H / 2
    const newT = { x: vw / 2 - cx * scale, y: vh / 2 - cy * scale, scale }
    setCentering(true)
    setTransform(newT)
    transformRef.current = newT
    setTimeout(() => setCentering(false), 420)
  }, [nodes, bounds])

  const ox = -bounds.minX + CANVAS_PAD
  const oy = -bounds.minY + CANVAS_PAD

  // Focus node: the one at x≈0 (layout centers on it via n.x -= focusX).
  const focusNode = useMemo(() => {
    if (nodes.length === 0) return null
    if (focusPersonId) {
      const n = nodes.find(n => n.id === focusPersonId)
      if (n) return n
    }
    return nodes.reduce((best, n) => Math.abs(n.x) < Math.abs(best.x) ? n : best, nodes[0])
  }, [nodes, focusPersonId])

  // Core family center: average x of focus person + their parents + their siblings.
  // Centering on this gives a more natural "family in the middle" view.
  const coreCenterX = useMemo(() => {
    if (!focusNode || nodes.length === 0) return 0
    const coreIds = new Set<string>([focusNode.id])
    if (focusNode.fatherId) coreIds.add(focusNode.fatherId)
    if (focusNode.motherId) coreIds.add(focusNode.motherId)
    for (const n of nodes) {
      if (n.id === focusNode.id) continue
      if ((focusNode.fatherId && n.fatherId === focusNode.fatherId) ||
          (focusNode.motherId && n.motherId === focusNode.motherId)) {
        coreIds.add(n.id)
      }
    }
    const coreNodes = nodes.filter(n => coreIds.has(n.id))
    if (coreNodes.length === 0) return focusNode.x + NODE_W / 2
    return coreNodes.reduce((sum, n) => sum + n.x + NODE_W / 2, 0) / coreNodes.length
  }, [nodes, focusNode])

  useEffect(() => {
    const el = viewportRef.current
    if (!el || nodes.length === 0) return
    const vw = el.clientWidth
    const vh = el.clientHeight
    const fitScale = Math.min(1, (vw * 0.9) / canvasW, (vh * 0.9) / canvasH)
    const s = vw <= 640 ? Math.max(0.65, fitScale) : fitScale

    let init: { x: number; y: number; scale: number }
    if (focusNode) {
      // Center horizontally on the core family (focus + parents + siblings).
      // Vertically: put the focus person at ~40% from the top.
      const fcx = coreCenterX + ox          // canvas x of core family center
      const fcy = focusNode.y + oy + NODE_H / 2  // canvas y of focus person center
      init = { x: vw / 2 - fcx * s, y: vh * 0.4 - fcy * s, scale: s }
    } else {
      init = { x: (vw - canvasW * s) / 2, y: (vh - canvasH * s) / 2, scale: s }
    }
    setTransform(init)
    transformRef.current = init
  }, [canvasW, canvasH, nodes.length, focusNode, coreCenterX, ox, oy])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const { x, y, scale } = transformRef.current
      const newScale = Math.max(0.2, Math.min(3, scale * factor))
      const ratio = newScale / scale
      const newT = { x: mx - (mx - x) * ratio, y: my - (my - y) * ratio, scale: newScale }
      setTransform(newT)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    let lastPinchDist = 0

    function pinchDist(e: TouchEvent) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        isPinchingRef.current = true
        dragRef.current.active = false
        e.preventDefault()
        lastPinchDist = pinchDist(e)
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      const d = pinchDist(e)
      if (lastPinchDist === 0) { lastPinchDist = d; return }
      const factor = d / lastPinchDist
      lastPinchDist = d
      const rect = el.getBoundingClientRect()
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top
      const { x, y, scale } = transformRef.current
      const newScale = Math.max(0.2, Math.min(3, scale * factor))
      const ratio = newScale / scale
      const newT = { x: mx - (mx - x) * ratio, y: my - (my - y) * ratio, scale: newScale }
      setTransform(newT)
      transformRef.current = newT
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) {
        isPinchingRef.current = false
        lastPinchDist = 0
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.person-node')) return
    if (isPinchingRef.current) return
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    const dx = e.clientX - dragRef.current.lastX
    const dy = e.clientY - dragRef.current.lastY
    dragRef.current.lastX = e.clientX
    dragRef.current.lastY = e.clientY
    setTransform(t => {
      const newT = { ...t, x: t.x + dx, y: t.y + dy }
      transformRef.current = newT
      return newT
    })
  }, [])

  const stopDrag = useCallback(() => { dragRef.current.active = false }, [])

  // ── Virtualización ────────────────────────────────────────────────────────
  // Only enabled when node count is large enough to matter
  const visibleIds = useMemo<Set<string> | null>(() => {
    if (nodes.length < 80) return null  // show all for small trees

    const el = viewportRef.current
    if (!el) return null
    const vw = el.clientWidth
    const vh = el.clientHeight
    const { x, y, scale } = transform

    const vpLeft   = (-x) / scale - VIRT_BUFFER
    const vpTop    = (-y) / scale - VIRT_BUFFER
    const vpRight  = (vw - x) / scale + VIRT_BUFFER
    const vpBottom = (vh - y) / scale + VIRT_BUFFER

    const _ox = -bounds.minX + CANVAS_PAD
    const _oy = -bounds.minY + CANVAS_PAD

    const ids = new Set<string>()
    for (const n of nodes) {
      const nx = n.x + _ox
      const ny = n.y + _oy
      if (nx + NODE_W > vpLeft && nx < vpRight && ny + NODE_H > vpTop && ny < vpBottom) {
        ids.add(n.id)
      }
    }
    // Always include selected + highlighted so edges/nodes stay visible
    if (selectedId) {
      ids.add(selectedId)
      highlighted.forEach(id => ids.add(id))
    }
    return ids
  }, [transform, nodes, bounds, selectedId, highlighted])

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <TreeSearch
        enabled={searchEnabled}
        onSelectPerson={personId => {
          setSelectedId(personId)
          centerOnNode(personId)
        }}
      />

      {/* Leyenda + hint de navegación — esquina inferior izquierda */}
      <TreeLegend />

      {/* Controles esquina inferior derecha */}
      <div style={{
        position: 'absolute',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        right:  'calc(16px + env(safe-area-inset-right, 0px))',
        zIndex: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
      }}>
        {focusPersonId && (
          <button
            onClick={() => centerOnNode(focusPersonId)}
            title="Centrar el árbol en tu posición"
            style={{
              background: '#FDFAF5',
              border: '1.5px solid #B5C4BC',
              borderRadius: 3,
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: 12,
              color: '#2D4A3E',
              fontFamily: 'Georgia, serif',
              letterSpacing: '0.04em',
              boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
              display: 'flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '#EAF0ED'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#2D4A3E'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '#FDFAF5'
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#B5C4BC'
            }}
          >
            <span style={{ fontSize: 14 }}>⌖</span> Ir a mí
          </button>
        )}
        {visibleIds !== null && (
          <div style={{
            fontSize: 10, color: '#A8B5AE', letterSpacing: '0.05em',
            userSelect: 'none', pointerEvents: 'none',
          }}>
            {visibleIds.size} / {nodes.length} visibles
          </div>
        )}
      </div>

      <div
        ref={viewportRef}
        className="tree-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
      >
        <div
          style={{
            position: 'absolute',
            transformOrigin: '0 0',
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transition: centering ? 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
            width: canvasW,
            height: canvasH,
          }}
        >
          <svg
            width={canvasW}
            height={canvasH}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            <g transform={`translate(${ox}, ${oy})`}>
              <FamilyEdges
                nodes={nodes}
                familyUnits={familyUnits}
                petLinks={petLinks}
                siblingLinks={siblingLinks}
                selectedId={selectedId}
                visibleIds={visibleIds}
              />
            </g>
          </svg>

          <div style={{ position: 'absolute', top: oy, left: ox }}>
            {nodes.map((node, i) => {
              if (visibleIds !== null && !visibleIds.has(node.id)) return null
              return (
                <PersonNode
                  key={node.id}
                  node={node}
                  selected={node.id === selectedId}
                  highlighted={highlighted.has(node.id)}
                  isCurrentUser={focusPersonId === node.id}
                  onSelect={id => setSelectedId(prev => (prev === id ? null : id))}
                  longPressEnabled={!!canCreatePerson}
                  onLongPress={(id, x, y) => {
                    const p = personById.get(id)
                    if (!p) return
                    setQuickAction({
                      personId: id,
                      hasFather: !!p.fatherId,
                      hasMother: !!p.motherId,
                      centerX: x,
                      centerY: y,
                    })
                  }}
                  animDelay={i * 60}
                />
              )
            })}
          </div>
        </div>
      </div>

      <OnboardingOverlay />

      {quickAction && (
        <QuickActionMenu
          target={quickAction}
          familySlug={familySlug}
          canInvite={!!isAdmin}
          onClose={() => setQuickAction(null)}
        />
      )}

      <PersonPanel
        personId={selectedId}
        familySlug={familySlug}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}

// ── Leyenda de colores ────────────────────────────────────────────────────────

function TreeLegend() {
  const [open, setOpen] = useState(false)

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left:   'calc(16px + env(safe-area-inset-left, 0px))',
        zIndex: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
      }}
    >
      {open && (
        <div
          style={{
            background: '#FDFAF5',
            border: '1px solid #D8D3CA',
            borderRadius: 3,
            padding: '12px 14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <LegendItem
            ring={{ background: '#FFF3D6', border: '2px solid #C5973A' }}
            label="Tú"
          />
          <LegendItem
            ring={{ background: '#C8D9D2', border: '2px solid #7aad95' }}
            label="Familia directa seleccionada"
          />
          <LegendItem
            ring={{ background: '#EAF0ED', border: '1.5px solid #B5C4BC' }}
            label="Persona"
          />
          <LegendItem
            ring={{ background: '#EDE8E0', border: '1.5px dashed #9B9690' }}
            label="Fallecido/a"
          />
        </div>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          background: '#FDFAF5',
          border: '1.5px solid #C8D0CA',
          borderRadius: 3,
          padding: '6px 12px',
          cursor: 'pointer',
          fontSize: 12,
          color: '#6B7B70',
          fontFamily: 'Georgia, serif',
          letterSpacing: '0.04em',
          display: 'flex', alignItems: 'center', gap: 5,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#2D4A3E'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#2D4A3E'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = '#C8D0CA'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#6B7B70'
        }}
      >
        {open ? '▾' : '▸'} Leyenda
      </button>
    </div>
  )
}

function LegendItem({ ring, label }: { ring: React.CSSProperties; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
        ...ring,
      }} />
      <span style={{ fontSize: 12, color: '#4a4a4a', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}
