import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { partJointAnchor, isTorsoPart } from '../../src/shared/modelRig.ts'
import { buildFabricatorJointMarkers } from '../../src/renderer/src/features/fabricator/models/jointMarkerModel.ts'

const itemCount = 1500
const runs = 7
const parts = Array.from({ length: itemCount }, (_, index) => ({
  id: `part-${index}`,
  name: index % 37 === 0 ? `Tronco ${index}` : `Parte ${index}`,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  dataUrl: ''
}))
const joints = Array.from({ length: itemCount - 1 }, (_, index) => ({
  id: `joint-${index}`,
  parentPartId: `part-${index}`,
  childPartId: `part-${index + 1}`,
  parentAnchor: { x: 50, y: 50 },
  childAnchor: { x: 50, y: 50 },
  fixed: index % 3 === 0
}))
const selectedIds = parts.filter((_, index) => index % 13 === 0).map((part) => part.id)

function buildWithRepeatedScans() {
  const withAnchors = parts.flatMap((part) => {
    const anchor = partJointAnchor(part, joints)
    return anchor ? [{ part, anchor, offset: 0 }] : []
  })
  const groups = new Map()
  for (const item of withAnchors) {
    const key = `${item.anchor.x.toFixed(2)}:${item.anchor.y.toFixed(2)}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const jointedParts = withAnchors.map((item) => {
    const key = `${item.anchor.x.toFixed(2)}:${item.anchor.y.toFixed(2)}`
    const group = groups.get(key) ?? []
    return { ...item, offset: (group.findIndex((candidate) => candidate.part.id === item.part.id) - (group.length - 1) / 2) * 20 }
  })
  return jointedParts
    .filter(({ part }) => !isTorsoPart(part))
    .map((item) => ({ ...item, fixed: Boolean(joints.some((joint) => joint.childPartId === item.part.id && joint.fixed)) }))
    .sort((a, b) => Number(selectedIds.includes(a.part.id)) - Number(selectedIds.includes(b.part.id)))
    .map((item) => ({ ...item, selected: selectedIds.includes(item.part.id) }))
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

function measure(build) {
  build()
  build()
  return median(Array.from({ length: runs }, () => {
    const start = performance.now()
    build()
    return performance.now() - start
  }))
}

const expected = buildWithRepeatedScans()
const indexed = buildFabricatorJointMarkers(parts, joints, selectedIds)
assert.deepEqual(indexed, expected, 'the indexed planner must preserve every marker and its display order')

const repeatedScanMedianMs = measure(buildWithRepeatedScans)
const indexedMedianMs = measure(() => buildFabricatorJointMarkers(parts, joints, selectedIds))
console.log(JSON.stringify({
  parts: itemCount,
  joints: joints.length,
  markers: indexed.length,
  runs,
  repeatedScanMedianMs: Number(repeatedScanMedianMs.toFixed(3)),
  indexedMedianMs: Number(indexedMedianMs.toFixed(3)),
  speedup: Number((repeatedScanMedianMs / indexedMedianMs).toFixed(2))
}, null, 2))
