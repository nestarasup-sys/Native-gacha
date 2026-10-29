import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { createWardrobePanelCandidateIndex, upperWardrobePanels, wardrobePanelCandidates } from '../../src/renderer/src/features/customizer/wardrobePanelModel.ts'

const setCount = 700
const renderCount = 80
const runs = 7
const componentsBySet = [
  ['shirt', 'Camisa', 'camisa', 'tronco'],
  ['jacket', 'Jaqueta', 'jaqueta', 'tronco'],
  ['upper-left', 'Manga esquerda', 'manga-superior', 'braço esquerdo'],
  ['upper-right', 'Manga direita', 'manga-superior', 'braço direito'],
  ['lower-left', 'Manga inferior esquerda', 'manga-inferior', 'antebraço esquerdo'],
  ['lower-right', 'Manga inferior direita', 'manga-inferior', 'antebraço direito']
]
const summaries = Array.from({ length: setCount }, (_, index) => ({
  id: `set-${index}`,
  modelSlot: 1,
  modelName: 'Modelo sintético',
  name: `Conjunto ${index}`,
  updatedAt: '2026-10-29T00:00:00.000Z',
  edition: 2,
  componentCount: componentsBySet.length
}))
const wardrobeDetails = Object.fromEntries(summaries.map((summary, setIndex) => [
  `${summary.modelSlot}:${summary.id}`,
  {
    schemaVersion: 1,
    edition: 2,
    id: summary.id,
    modelSlot: summary.modelSlot,
    modelName: summary.modelName,
    name: summary.name,
    width: 64,
    height: 64,
    updatedAt: summary.updatedAt,
    components: componentsBySet.map(([id, name, category, side]) => ({
      id: `${id}-${setIndex}`,
      name,
      category,
      attachedPartId: side,
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      rotation: 0,
      dataUrl: 'data:image/png;base64,AA=='
    }))
  }
]))
const inputs = {
  panels: upperWardrobePanels,
  selectedModelSlot: 1,
  wardrobeSets: summaries,
  wardrobeDetails,
  faceComponentAssets: [],
  faceComponentDetails: {}
}

function previousPageDerivation() {
  return inputs.panels.map((panel) => wardrobePanelCandidates(
    panel,
    inputs.selectedModelSlot,
    inputs.wardrobeSets,
    inputs.wardrobeDetails,
    inputs.faceComponentAssets,
    inputs.faceComponentDetails
  ))
}

function memoizedPageDerivation() {
  const index = createWardrobePanelCandidateIndex(inputs)
  return inputs.panels.map((panel) => index.get(panel.id) ?? [])
}

function previousRepeatedRenders() {
  let projection = []
  for (let render = 0; render < renderCount; render += 1) projection = previousPageDerivation()
  return projection
}

function memoizedRepeatedRenders() {
  const index = createWardrobePanelCandidateIndex(inputs)
  let projection = []
  for (let render = 0; render < renderCount; render += 1) {
    projection = inputs.panels.map((panel) => index.get(panel.id) ?? [])
  }
  return projection
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

function measure(task) {
  task()
  task()
  return median(Array.from({ length: runs }, () => {
    const start = performance.now()
    task()
    return performance.now() - start
  }))
}

assert.deepEqual(memoizedPageDerivation(), previousPageDerivation())
const previousMedianMs = measure(previousRepeatedRenders)
const memoizedMedianMs = measure(memoizedRepeatedRenders)
console.log(JSON.stringify({
  wardrobeSets: setCount,
  components: setCount * componentsBySet.length,
  panels: inputs.panels.length,
  unrelatedRenders: renderCount,
  runs,
  previousMedianMs: Number(previousMedianMs.toFixed(3)),
  memoizedMedianMs: Number(memoizedMedianMs.toFixed(3)),
  speedup: Number((previousMedianMs / memoizedMedianMs).toFixed(2)),
  note: 'synthetic selector benchmark; assumes wardrobe catalog references remain stable between unrelated character edits'
}, null, 2))
