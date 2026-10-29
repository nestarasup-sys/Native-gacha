import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { buildAnimatorGarmentLayers } from '../../src/renderer/src/features/fabricator/models/animatorGarmentLayers.ts'
import { mapWardrobeComponentToPose } from '../../src/shared/wardrobePose.ts'

const itemCount = 2500
const runs = 5
const sourceParts = Array.from({ length: itemCount }, (_, index) => part(`bone-${index}`, 0, 0, 100, 100))
const displayParts = sourceParts.map((bone, index) => part(bone.id, index, index * .5, 120, 130))
const components = Array.from({ length: itemCount }, (_, index) => ({
  id: `shirt-${index}`,
  name: `Shirt ${index}`,
  category: 'camisa',
  attachedPartId: `bone-${index}`,
  x: index % 100,
  y: index % 80,
  width: 30,
  height: 40,
  rotation: index % 25,
  dataUrl: `data:${index}`
}))
const rigProject = project(sourceParts)
const displayProject = project(displayParts)
const wardrobeGroups = [{ modelSlot: 1, setId: 'bench', category: 'camisa', offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0 }]
const wardrobeDetails = { '1:bench': { components } }
const layerIndex = new Map(displayParts.map((bone, index) => [bone.id, index]))
const input = { rigProject, displayProject, wardrobeGroups, wardrobeDetails, layerIndex, layerStride: 16 }

function part(id, x, y, width, height) {
  return { id, name: id, x, y, width, height, rotation: 0, dataUrl: '' }
}

function project(parts) {
  return { slot: 1, parts, joints: [] }
}

function buildWithLinearLookups() {
  const entries = []
  let sequence = 0
  for (const group of wardrobeGroups) {
    if (group.modelSlot !== rigProject.slot) continue
    const set = wardrobeDetails[`${group.modelSlot}:${group.setId}`]
    if (!set) continue
    const mapped = []
    for (const component of set.components.filter((item) => item.category === 'camisa')) {
      const sourceBone = rigProject.parts.find((item) => item.id === component.attachedPartId)
      const poseBone = displayProject.parts.find((item) => item.id === component.attachedPartId)
      if (!sourceBone || !poseBone) continue
      const transform = mapWardrobeComponentToPose(component, sourceBone, poseBone)
      mapped.push({ component, transform, layer: layerIndex.get(poseBone.id) ?? 0 })
    }
    if (!mapped.length) continue
    const centerX = mapped.reduce((sum, item) => sum + item.transform.origin.x / mapped.length, 0)
    const centerY = mapped.reduce((sum, item) => sum + item.transform.origin.y / mapped.length, 0)
    for (const item of mapped) {
      entries.push({
        key: `${group.setId}:${group.category}:${item.component.id}`,
        dataUrl: item.component.dataUrl,
        originX: item.transform.origin.x,
        originY: item.transform.origin.y,
        centerX,
        centerY,
        matrix: item.transform.matrix,
        localLeft: item.transform.localLeft,
        localTop: item.transform.localTop,
        width: item.transform.renderWidth,
        height: item.transform.renderHeight,
        rotation: item.transform.localRotation,
        groupX: group.offsetX,
        groupY: group.offsetY,
        groupScaleX: group.scaleX,
        groupScaleY: group.scaleY,
        groupRotation: group.rotation,
        opacity: Math.min(1, Math.max(0, group.opacity ?? 1)),
        zIndex: item.layer * 16 + 4 + sequence % 8
      })
      sequence++
    }
  }
  return entries
}

function measure(build) {
  const durations = []
  let result = []
  for (let run = 0; run < runs; run += 1) {
    const start = performance.now()
    result = build()
    durations.push(performance.now() - start)
  }
  durations.sort((left, right) => left - right)
  return { medianMs: Number(durations[Math.floor(durations.length / 2)].toFixed(3)), result }
}

buildWithLinearLookups()
buildAnimatorGarmentLayers(input)
const linear = measure(buildWithLinearLookups)
const indexed = measure(() => buildAnimatorGarmentLayers(input))
assert.deepEqual(indexed.result, linear.result, 'A indexação precisa preservar a mesma composição para peças sem regra de costura.')

const speedup = linear.medianMs / Math.max(indexed.medianMs, .001)
console.log(JSON.stringify({
  benchmark: 'animator-garment-part-resolution',
  fixture: `${itemCount} parts + ${itemCount} garments`,
  runs,
  linearFindMedianMs: linear.medianMs,
  indexedMapMedianMs: indexed.medianMs,
  measuredSpeedup: Number(speedup.toFixed(2)),
  outputLayers: indexed.result.length,
  outputsIdentical: true,
  note: 'Synthetic CPU benchmark; measures the layer builder and excludes React rendering, image decoding and Electron.'
}, null, 2))
