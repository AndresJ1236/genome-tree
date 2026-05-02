'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { computeTreeLayout, NODE_W, NODE_H } from '@/lib/tree-layout'
import type { PersonData, RelationshipData } from '@/lib/tree-types'
import { PersonNode } from './PersonNode'
import { FamilyEdges } from './FamilyEdges'
import { PersonPanel } from './PersonPanel'
import { TreeSearch } from './TreeSearch'
import { OnboardingOverlay } from './OnboardingOverlay'
import { HelpTooltip } from '@/components/ui/HelpTooltip'

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
}

export function FamilyTree({ persons, relationships, familySlug, searchEnabled, focusPersonId }: FamilyTreeProps) {
  const { nodes, familyUnits, petLinks, bounds } = useMemo(
    () => computeTreeLayout(persons, relationships, { focusPersonId }),
    [persons, relationships, focusPersonId]
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)

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

  // The focus node is the one the layout centered on (n.x === 0 after centering).
  // If focusPersonId was passed, look it up; otherwise find the node with x closest to 0.
  const focusNode = useMemo(() => {
    if (nodes.length === 0) return null
    if (focusPersonId) {
      const n = nodes.find(n => n.id === focusPersonId)
      if (n) return n
    }
    return nodes.reduce((best, n) => Math.abs(n.x) < Math.abs(best.x) ? n : best, nodes[0])
  }, [nodes, focusPersonId])

  useEffect(() => {
    const el = viewportRef.current
    if (!el || nodes.length === 0) return
    const vw = el.clientWidth
    const vh = el.clientHeight
    const s = Math.min(1, Math.min((vw * 0.9) / canvasW, (vh * 0.9) / canvasH))

    let init: { x: number; y: number; scale: number }
    if (focusNode) {
      // Place the focus person at the horizontal center and ~40% from the top
      // (so ancestors above and children below are both visible)
      const fcx = focusNode.x + ox + NODE_W / 2
      const fcy = focusNode.y + oy + NODE_H / 2
      init = { x: vw / 2 - fcx * s, y: vh * 0.4 - fcy * s, scale: s }
    } else {
      init = { x: (vw - canvasW * s) / 2, y: (vh - canvasH * s) / 2, scale: s }
    }
    setTransform(init)
    transformRef.current = init
  }, [canvasW, canvasH, nodes.length, focusNode, ox, oy])

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

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.person-node')) return
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

      {/* Hint de navegación — esquina inferior izquierda, discreto */}
      <div
        style={{
          position: 'absolute', bottom: 16, left: 16, zIndex: 20,
          display: 'flex', gap: 8, alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontSize: 10, color: '#A8B5AE', letterSpacing: '0.06em', userSelect: 'none' }}>
          Arrastra · Rueda = zoom
        </span>
        <HelpTooltip
          text={"Arrastra el fondo para moverte.\nRueda del ratón para hacer zoom.\nHaz clic en una persona para ver su perfil."}
          position="top"
        >
          <span
            style={{
              pointerEvents: 'auto',
              width: 15, height: 15, borderRadius: '50%',
              border: '1px solid #B5C4BC',
              color: '#8B9E94', fontSize: 9,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'default', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700,
            }}
          >
            ?
          </span>
        </HelpTooltip>
      </div>

      {/* Contador de personas visibles — solo si hay virtualización activa */}
      {visibleIds !== null && (
        <div style={{
          position: 'absolute', bottom: 16, right: 16, zIndex: 20,
          fontSize: 10, color: '#A8B5AE', letterSpacing: '0.05em',
          userSelect: 'none', pointerEvents: 'none',
        }}>
          {visibleIds.size} / {nodes.length} visibles
        </div>
      )}

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
                  onSelect={id => setSelectedId(prev => (prev === id ? null : id))}
                  animDelay={i * 60}
                />
              )
            })}
          </div>
        </div>
      </div>

      <OnboardingOverlay />

      <PersonPanel
        personId={selectedId}
        familySlug={familySlug}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}
