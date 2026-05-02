'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { computeTreeLayout, NODE_W, NODE_H } from '@/lib/tree-layout'
import type { PersonData, RelationshipData } from '@/lib/tree-types'
import { PersonNode } from './PersonNode'
import { FamilyEdges } from './FamilyEdges'
import { PersonPanel } from './PersonPanel'
import { TreeSearch } from './TreeSearch'

const CANVAS_PAD = 120
const CENTER_SCALE = 1.2   // zoom level when centering from search

interface FamilyTreeProps {
  persons:       PersonData[]
  relationships: RelationshipData[]
  familySlug:    string
  searchEnabled: boolean
}

export function FamilyTree({ persons, relationships, familySlug, searchEnabled }: FamilyTreeProps) {
  const { nodes, familyUnits, bounds } = useMemo(
    () => computeTreeLayout(persons, relationships),
    [persons, relationships]
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

  const canvasW = bounds.maxX - bounds.minX + CANVAS_PAD * 2
  const canvasH = bounds.maxY - bounds.minY + CANVAS_PAD * 2
  const ox = -bounds.minX + CANVAS_PAD
  const oy = -bounds.minY + CANVAS_PAD

  useEffect(() => {
    const el = viewportRef.current
    if (!el || nodes.length === 0) return
    const vw = el.clientWidth
    const vh = el.clientHeight
    const s = Math.min(1, Math.min((vw * 0.9) / canvasW, (vh * 0.9) / canvasH))
    const init = { x: (vw - canvasW * s) / 2, y: (vh - canvasH * s) / 2, scale: s }
    setTransform(init)
    transformRef.current = init
  }, [canvasW, canvasH, nodes.length])

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

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
      }}
    >
      <TreeSearch
        enabled={searchEnabled}
        onSelectPerson={personId => {
          setSelectedId(personId)
          centerOnNode(personId)
        }}
      />

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
            transform: "translate(" + transform.x + "px, " + transform.y + "px) scale(" + transform.scale + ")",
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
            <g transform={"translate(" + ox + ", " + oy + ")"}>
              <FamilyEdges nodes={nodes} familyUnits={familyUnits} selectedId={selectedId} />
            </g>
          </svg>

          <div style={{ position: 'absolute', top: oy, left: ox }}>
            {nodes.map((node, i) => (
              <PersonNode
                key={node.id}
                node={node}
                selected={node.id === selectedId}
                highlighted={highlighted.has(node.id)}
                onSelect={id => setSelectedId(prev => (prev === id ? null : id))}
                animDelay={i * 60}
              />
            ))}
          </div>
        </div>
      </div>

      <PersonPanel
        personId={selectedId}
        familySlug={familySlug}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}
