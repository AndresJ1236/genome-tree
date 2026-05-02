'use client'

import { NODE_W, NODE_H } from '@/lib/tree-layout'
import type { LayoutNode, FamilyUnit } from '@/lib/tree-types'

const BRANCH_COLOR = '#B5C4BC'
const BRANCH_HOVER = '#7aad95'
const BRANCH_ACTIVE = '#2D4A3E'
const BRANCH_WIDTH = 1.6

interface FamilyEdgesProps {
  nodes: LayoutNode[]
  familyUnits: FamilyUnit[]
  selectedId: string | null
  visibleIds: Set<string> | null
}

export function FamilyEdges({ nodes, familyUnits, selectedId, visibleIds }: FamilyEdgesProps) {
  const byId = new Map(nodes.map(n => [n.id, n]))

  const units = visibleIds === null ? familyUnits : familyUnits.filter(u =>
    visibleIds.has(u.parent1Id) ||
    (u.parent2Id != null && visibleIds.has(u.parent2Id)) ||
    u.childIds.some(c => visibleIds.has(c))
  )

  const isActive = (unit: FamilyUnit) =>
    selectedId === unit.parent1Id ||
    selectedId === unit.parent2Id ||
    unit.childIds.includes(selectedId ?? '')

  return (
    <g>
      {units.map(unit => {
        const p1 = byId.get(unit.parent1Id)
        const p2 = unit.parent2Id ? byId.get(unit.parent2Id) : null
        if (!p1) return null

        const active = isActive(unit)
        const stroke = active ? BRANCH_ACTIVE : BRANCH_COLOR
        const strokeW = active ? 2.2 : BRANCH_WIDTH

        // Anchor points
        const p1cx = p1.x + NODE_W / 2
        const p1by = p1.y + NODE_H

        const p2cx = p2 ? p2.x + NODE_W / 2 : p1cx
        const p2by = p2 ? p2.y + NODE_H : p1by

        // Junction: midpoint between the two parents, below them
        const jx = (p1cx + p2cx) / 2
        const jy = p2 ? Math.max(p1by, p2by) + 55 : p1by + 55

        const children = unit.childIds.map(cid => byId.get(cid)).filter(Boolean) as LayoutNode[]

        return (
          <g key={unit.id} className="family-unit">
            {/* Couple connector (horizontal arc between spouses) */}
            {p2 && !unit.isExCouple && (
              <path
                d={coupleArc(p1cx, p1.y + NODE_H * 0.5, p2cx, p2.y + NODE_H * 0.5)}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeW}
                strokeLinecap="round"
                opacity={0.6}
                style={branchStyle(unit.parent1Id + '-couple', active)}
              />
            )}

            {/* Parent 1 → junction (only when there are children) */}
            {children.length > 0 && (
              <path
                d={branchDown(p1cx, p1by, jx, jy)}
                pathLength={1}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeW}
                strokeLinecap="round"
                style={branchStyle(unit.parent1Id + '-j', active)}
              />
            )}

            {/* Parent 2 → junction (only when there are children) */}
            {p2 && children.length > 0 && (
              <path
                d={branchDown(p2cx, p2by, jx, jy)}
                pathLength={1}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeW}
                strokeLinecap="round"
                style={branchStyle(unit.parent2Id! + '-j', active)}
              />
            )}

            {/* Junction → each child */}
            {children.map(child => {
              const cx = child.x + NODE_W / 2
              const cy = child.y
              return (
                <path
                  key={child.id}
                  d={branchDown(jx, jy, cx, cy)}
                  pathLength={1}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeW}
                  strokeLinecap="round"
                  style={branchStyle(child.id + '-branch', active)}
                />
              )
            })}

            {/* Junction dot */}
            {children.length > 0 && (
              <circle
                cx={jx}
                cy={jy}
                r={active ? 3 : 2}
                fill={stroke}
                opacity={0.8}
                style={{ transition: 'all 0.3s ease' }}
              />
            )}
          </g>
        )
      })}
    </g>
  )
}

// ── Path builders ──────────────────────────────────────────────────────────

function branchDown(x1: number, y1: number, x2: number, y2: number): string {
  const mid = (y1 + y2) / 2
  // Cubic bezier: control points pull toward vertical center
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`
}

function coupleArc(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2
  const my = Math.max(y1, y2) + 10
  return `M ${x1} ${y1} Q ${mx} ${my}, ${x2} ${y2}`
}

// ── Animation style ────────────────────────────────────────────────────────

function branchStyle(key: string, active: boolean): React.CSSProperties {
  return {
    strokeDasharray: 1,
    strokeDashoffset: 0,
    transition: active
      ? 'stroke 0.25s ease, stroke-width 0.25s ease'
      : 'stroke 0.4s ease, stroke-width 0.4s ease',
    animation: `growBranch 0.7s ease-out forwards`,
    animationDelay: `${hashDelay(key)}ms`,
  } as React.CSSProperties
}

function hashDelay(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffff
  return (h % 12) * 50
}
