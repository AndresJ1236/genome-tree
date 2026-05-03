# 04 — The Tree Layout Algorithm

> The single most complex part of the codebase. ~750 lines in [`src/lib/tree-layout.ts`](../../src/lib/tree-layout.ts). Read this end-to-end before changing anything.

## What it does

Given:
- A list of `Person` records with `fatherId`/`motherId` self-references
- A list of `Relationship` records (SPOUSE/PARTNER/SIBLING)
- A focus person (the logged-in user)

It produces:
- An (x, y) coordinate for every Person
- A list of `FamilyUnit` records (couple → children groupings) for edge rendering
- A list of `SiblingLink` records for explicit sibling lines
- A list of `PetLink` records for orbiting pets
- An overall bounds rectangle

The output is consumed by `FamilyTree.tsx` (canvas) and `FamilyEdges.tsx` (SVG paths).

## Constants

```ts
NODE_W = 72         // node width (px)
NODE_H = 72         // node height (px)
GEN_H  = 250        // vertical spacing between generations
H_GAP  = 150        // horizontal spacing between adjacent units in a row
COUPLE_GAP = 120    // distance between two members of a couple unit
ORBIT_R = 110       // radius pets orbit their owner at
SIDE_GAP_PX = 500   // empty space between paternal and maternal clusters
```

## Pipeline overview

```
Input: persons, relationships, { focusPersonId? }
  ↓
1. Separate pets from non-pets (pets get orbital placement, not generation grid)
  ↓
2. Build childrenOf, parentsOf maps
  ↓
3. Build inferredCouples (from shared children + explicit SPOUSE/PARTNER)
  ↓
4. Build explicitSiblings (from explicit SIBLING relationships, separate map)
  ↓
5. Build spousesOf, explicitSiblingsOf bidirectional lookups
  ↓
6. Determine focusId (option > auto-detect deepest interior person)
  ↓
7. Generation assignment via BFS-from-focus  ← v2.0 key change
  ↓
8. Compute lateral scores via computeFocusLateralScores  ← per-user paternal/maternal
  ↓
9. For each generation (bottom-up):
     • Build units (group spouses into couple units)
     • Compute fallback x positions (side-bounded clusters)
     • Place units, propagating constraints from children below
  ↓
10. Center the canvas on the focus person (subtract focus.x from all x)
  ↓
11. Place pets in orbit around their owners
  ↓
12. Build FamilyUnit edge records (parent couple → kids)
  ↓
13. Emit SiblingLink records (only for siblings without registered shared parents)
  ↓
Output: TreeLayout
```

## 1. inferredCouples — who is a couple?

```ts
const inferredCouples = new Map<string, { p1: string; p2: string }>()
```

Populated from two sources:

**A. Shared children**: if any Person has `fatherId=X` AND `motherId=Y`, then `(X, Y)` is a couple.

```ts
const likelyRealCouple = (a, b) => {
  const ay = ownYear(a); const by = ownYear(b)
  return ay === 9999 || by === 9999 || Math.abs(ay - by) <= 60
}
```

The 60-year tolerance lets data-entry errors and unusual age gaps through. Was 35 in v1.0; raised to 60 in v2.0 to fix a real-world miss.

**B. Explicit `Relationship` rows of type SPOUSE/PARTNER**: any such row is a couple, period. SIBLING rows are routed to `explicitSiblings` instead.

`spousesOf` is a bidirectional `Map<personId, partnerIds[]>` derived from `inferredCouples`. SIBLING relationships are NEVER added to `spousesOf` — that would make the layout treat siblings as couples (wrong).

## 2. Generation assignment — BFS from focus (NEW v2.0)

The historical bug this fixes: previously, `gen` was computed as **depth from roots** (max distance to any childless ancestor + 1). When one branch had more recorded generations than the other (e.g. Apellido2 family has 4 generations recorded, Apellido1 family only 2), the parent and their siblings ended up on different rows. Pass 2 alignment dragged the parent down, but their siblings stayed shallow.

The v2.0 algorithm uses **distance from the focus person** through the relationship graph:

```ts
const gen = new Map<string, number>()
gen.set(focusId, 0)
const queue: string[] = [focusId]

while (queue.length > 0) {
  const id = queue.shift()!
  const g = gen.get(id)!
  const p = personMap.get(id)

  // Parents → g - 1 (older generation, smaller number)
  if (p.fatherId && !gen.has(p.fatherId)) {
    gen.set(p.fatherId, g - 1)
    queue.push(p.fatherId)
  }
  if (p.motherId && !gen.has(p.motherId)) {
    gen.set(p.motherId, g - 1)
    queue.push(p.motherId)
  }

  // Children → g + 1 (younger). Reaching siblings of an ancestor happens
  // here: ancestor.parents are at g-1, then their other children land at g.
  for (const cid of childrenOf.get(id) ?? []) {
    if (!gen.has(cid)) { gen.set(cid, g + 1); queue.push(cid) }
  }

  // Spouses → same generation
  for (const sid of spousesOf.get(id) ?? []) {
    if (!gen.has(sid)) { gen.set(sid, g); queue.push(sid) }
  }

  // Explicit siblings → same generation (lets us connect Fabiola, Santiago,
  // Lupe to Ana even when their shared parents aren't recorded)
  for (const sid of explicitSiblingsOf.get(id) ?? []) {
    if (!gen.has(sid)) { gen.set(sid, g); queue.push(sid) }
  }
}
```

### Normalization

After BFS, gens are negative (ancestors) and positive (descendants) with focus at 0. We shift so the minimum is 0:

```ts
const minReached = Math.min(...gen.values())
if (minReached !== 0) {
  for (const [id, g] of [...gen.entries()]) gen.set(id, g - minReached)
}
```

After shift: oldest ancestors at gen 0, focus somewhere in the middle, descendants at the bottom.

### Disconnected people

Anyone the BFS doesn't reach (truly disconnected from the focus through any relationship) is set to `gen = 0` (top of canvas).

> **CRITICAL HISTORICAL GOTCHA**: don't use a "huge negative offset" for disconnected people (the original v2.0 attempt used `tempDepth - 1000`, which after normalization put the connected family at gen ≈ 1000 → y ≈ 250,000 px → off-screen). Always use 0.

## 3. Lateral scoring — paternal left, maternal right

`computeFocusLateralScores(focusId, personMap, personSet, spousesOf)` produces a `Map<personId, number>` where:

- `score < 0` → paternal side (left)
- `score > 0` → maternal side (right)
- `score = 0` → focus, focus's siblings, or disconnected people

### BFS scoring (upward from focus)

```ts
scores.set(focusId, 0)
const queue = [{ id: focusId, score: 0 }]

while (queue.length > 0) {
  const { id, score } = queue.shift()!
  const person = personMap.get(id)

  // Father → LEFT. If already on left, full step. If on right, half step (pulls toward center).
  if (person.fatherId && !scores.has(person.fatherId)) {
    const next = score <= 0 ? score - 1 : score - 0.5
    scores.set(person.fatherId, next)
    queue.push({ id: person.fatherId, score: next })
  }

  // Mother → RIGHT.
  if (person.motherId && !scores.has(person.motherId)) {
    const next = score >= 0 ? score + 1 : score + 0.5
    scores.set(person.motherId, next)
    queue.push({ id: person.motherId, score: next })
  }
}
```

Result for the user's tree: WJ (father) gets -1, MP (mother) gets +1, LJ (paternal grandfather) gets -2, AS (paternal grandmother — reached via mother of WJ from -1) gets -0.5, etc.

### Spread focus's siblings

The focus's own siblings are placed near the focus but spread by birth order:

```ts
allOrdered.forEach((id, i) => {
  if (id === focusId) return
  scores.set(id, (i - focusIdx) * 0.45)   // -0.45, +0.45, -0.9, etc.
})
```

This keeps the focus visually centered among their generation.

### Branch propagation

After BFS, only direct ancestors are scored. To get an entire branch on one side, we propagate scores iteratively:

```ts
while (propagated && safety-- > 0) {
  propagated = false

  // Spouses inherit partner's score
  for (const [id, s] of scores.entries()) {
    for (const sid of spousesOf.get(id) ?? [])
      if (!scores.has(sid)) { scores.set(sid, s); propagated = true }
  }

  // Siblings (same parents) inherit one sibling's score
  // ...

  // Children inherit avg of scored parents
  // ...

  // Parents inherit from any scored child (catches in-laws of a scored relative)
  // ...
}
```

After this loop, every person reachable through any combination of relationships from the focus has a score. Disconnected people stay at `0`.

### L/R separation gap (in the layout, not in scores)

The score values themselves are NOT used for x positioning — they're a sorting key. The actual gap between paternal and maternal clusters is applied in the per-generation layout step using `SIDE_GAP_PX = 500`.

## 4. Per-generation layout (bottom-up)

For each generation `g` from `maxGen` down to `0`:

### Build units

A unit is a group of mutual spouses at the same generation. Single people form 1-member units.

```ts
function buildGenerationUnits(ids: string[]): GenUnit[] {
  // BFS through spousesOf within this generation, grouping connected components
}
```

A unit's `members` are sorted internally by score (ascending) so the leftward partner is on the left.

### Fallback positions: side-bounded

```ts
const negUnits = []   // score < -0.001
const zeroUnits = []  // |score| <= 0.001
const posUnits = []   // score > 0.001

// Zero cluster centered at 0
const zeroSpan = (zeroUnits.length - 1) * H_GAP
const zeroLeftEdge = -zeroSpan / 2
zeroUnits.forEach((unit, i) => fallbackCenters.set(unit, zeroLeftEdge + i * H_GAP))

// Paternal cluster: rightmost paternal unit at zeroLeftEdge - SIDE_GAP_PX,
// extending leftward (oldest at the far left)
const negRightEdge = zeroLeftEdge - SIDE_GAP_PX
negUnits.forEach((unit, i) => {
  const fromRight = negUnits.length - 1 - i
  fallbackCenters.set(unit, negRightEdge - fromRight * H_GAP)
})

// Maternal cluster: leftmost maternal unit at (zeroRightEdge + SIDE_GAP_PX)
const posLeftEdge = (zeroLeftEdge + zeroSpan) + SIDE_GAP_PX
posUnits.forEach((unit, i) => fallbackCenters.set(unit, posLeftEdge + i * H_GAP))
```

This creates three explicit regions: paternal at `x < 0`, focus + neutrals at `~0`, maternal at `x > 0`. A paternal-side person can never end up on the maternal side.

### Desired centers from children

When a generation has children below (already placed), each unit's preferred center is the midpoint of its children's x positions:

```ts
function desiredCenterForUnit(members) {
  const childXes = []
  for (const m of members)
    for (const cid of childrenOf.get(m) ?? [])
      if (xPos.has(cid)) childXes.push(xPos.get(cid))

  if (childXes.length === 0) return null   // fallback to side-bounded position
  return (Math.min(...childXes) + Math.max(...childXes)) / 2
}
```

### Place left-to-right with H_GAP enforcement

```ts
units.sort(by desiredCenter)
let previousRightmost = null
for (const unit of units) {
  const desiredCenter = desiredCenterForUnit(...) ?? fallbackCenters.get(unit)
  const desiredLeft = desiredCenter + memberOffsets[0]
  let center = desiredCenter
  if (previousRightmost !== null) {
    const minLeft = previousRightmost + H_GAP
    if (desiredLeft < minLeft) center += minLeft - desiredLeft  // push right
  }
  // ... assign x positions to members
  previousRightmost = center + memberOffsets[last]
}
```

This prevents overlap. If two units want the same spot, the one sorted later gets shifted right.

## 5. Center on focus

```ts
const focusX = xPos.get(focusId) ?? 0
for (const n of nodes) n.x -= focusX
```

After this, the focus person is at x=0 and everyone else is positioned relative to them.

## 6. Pet placement

Pets aren't in the generation grid. For each pet, find their owner (via `fatherId` or `motherId`) and place them on a fixed orbit:

```ts
ORBIT_ANGLES = [80, 35, 125, -35, 145, -80, 170]   // degrees, 0 = right

for (const pet of pets) {
  const owner = nodeById.get(pet.fatherId ?? pet.motherId)
  if (!owner) continue
  const angle = ORBIT_ANGLES[i % ORBIT_ANGLES.length] * Math.PI / 180
  pet.x = owner.cx + ORBIT_R * cos(angle)
  pet.y = owner.cy + ORBIT_R * sin(angle)
}
```

A pet without a registered owner is dropped to the far left as an orphan.

## 7. FamilyUnit emission

For each couple in `inferredCouples`:

```ts
{
  id: 'unit-' + coupleKey,
  parent1Id: p1,
  parent2Id: p2,
  childIds: [...persons whose fatherId+motherId match p1 and p2],
  isExCouple: explicitCoupleData[k]?.isEx ?? false,
}
```

For single-parent rows (someone has `fatherId` but not `motherId`, or vice versa):

```ts
{
  id: 'solo-' + parentId,
  parent1Id: parentId,
  parent2Id: null,
  childIds: [...]
}
```

The renderer (`FamilyEdges.tsx`) draws:
- A horizontal arc between couple members (hidden if `isExCouple`)
- A junction dot below the couple, halfway between them
- Cubic Bezier curves from each parent to the junction
- Cubic Bezier curves from the junction to each child

## 8. SiblingLink emission

```ts
const siblingLinks = []
for (const { p1, p2 } of explicitSiblings.values()) {
  const a = personMap.get(p1), b = personMap.get(p2)
  const shareParent = (a.fatherId && a.fatherId === b.fatherId)
                   || (a.motherId && a.motherId === b.motherId)
  if (shareParent) continue   // already connected via family unit edges
  siblingLinks.push({ person1Id: p1, person2Id: p2 })
}
```

The renderer draws these as a **discrete dashed arc** above the row, lighter than couple/branch lines. This handles the "Fabiola, Santiago, Lupe are siblings of Ana but their parents aren't entered yet" case.

Once you eventually register a shared parent for those siblings, the SiblingLink is suppressed automatically — they get connected through the family unit instead.

## Common bugs (and where they live)

| Symptom | Look at |
|---------|---------|
| Spouses on different rows | `inferredCouples` — are they actually detected? |
| One side missing entirely | BFS from focus — does focus have BOTH `fatherId` and `motherId` set? |
| Overlapping nodes | `H_GAP` enforcement in the placement loop |
| Couple shown as ex even though married | `endDate` is non-null on the SPOUSE row |
| Sibling line shown when shouldn't be | Check `shareParent` filter — both `a.fatherId === b.fatherId` AND `a.motherId === b.motherId` should be considered |
| Pets in the wrong place | `petsByOwner` — does the pet's `fatherId`/`motherId` point to a person in the visible set? |
| Disconnected person in middle | Check score = 0 fallback. If they should be on a side, they need at least one relationship to the focus's graph |

## When to NOT touch this file

This algorithm is delicate. Before modifying:

1. Reproduce the bug locally with a test fixture
2. Read the Pass 0/1/2 history below — solutions from v1 may not apply post-v2 BFS rewrite
3. Test with at least: empty tree, focus-only tree, focus with no parents, focus with one parent, deep paternal vs shallow maternal, ex-couples, pets
4. Deploy carefully; if anything breaks, **revert immediately**

## Historical context (what NOT to bring back)

- **Pass 1** (v1.0–v1.x): aligned a couple where one side had no parents. Removed in v2.0 — BFS-from-focus handles this naturally.
- **Pass 2** (v1.x): iterative max-alignment for couples with parents at different depths. Caused oscillation when re-derivation pulled aligned people back to their own parents' depth + 1. Removed in v2.0.
- **Score-level SIDE_GAP** (early v2.0): tried to push scores apart numerically, but the per-generation layout used INDEX-based fallback positions, so the score gap never translated into pixels. Replaced with the side-bounded fallback positioning above.
- **Disconnected people offset of -1000** (broken v2.0 attempt): pushed connected family thousands of rows down. Now we use 0.
