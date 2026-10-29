import { performance } from 'node:perf_hooks'
import {
  createCompletedMotionPreparation,
  hasCompletedMotionPreparation,
  indexMotionPreparationCharacters,
  rememberCompletedMotionPreparation
} from '../../src/renderer/src/features/editorV6/motion/motionPreparationModel.ts'

const characterCount = 120
const planCount = 2400
const rounds = 5
const characters = Array.from({ length: characterCount }, (_, index) => ({
  id: `character-${index}`,
  name: `Personagem ${index}`,
  updatedAt: '2026-10-29T00:00:00.000Z',
  hair: '#000000', outfit: '#ffffff', skin: '#f2c8a8',
  customization: {
    modelSlot: 1, poseSlot: null,
    partOverrides: Object.fromEntries(Array.from({ length: 30 }, (_, part) => [`part-${part}`, { x: part, y: part + index, rotation: part * 3 }])),
    layerOrder: Array.from({ length: 40 }, (_, layer) => `layer-${layer}`),
    wardrobeGroups: Array.from({ length: 18 }, (_, group) => ({
      id: `group-${group}`, modelSlot: 1,
      components: Array.from({ length: 12 }, (_, part) => ({ id: `component-${group}-${part}`, assetId: `asset-${index}-${group}-${part}` }))
    })),
    faceAppearance: {
      modelSlot: 1,
      transforms: Object.fromEntries(Array.from({ length: 20 }, (_, part) => [`face-${part}`, { x: part, y: index, width: 100, height: 100, rotation: 0 }]))
    }
  }
}))
const plans = Array.from({ length: planCount }, (_, index) => ({ key: `motion-plan-${index}`, characterId: characters[index % characters.length].id }))

function measureLegacy() {
  const completed = new Set()
  let processed = 0
  const started = performance.now()
  for (const plan of plans) {
    const character = characters.find((item) => item.id === plan.characterId)
    if (!character) continue
    const key = JSON.stringify([plan.key, character])
    if (!completed.has(key)) {
      completed.add(key)
      processed++
      if (completed.size > 256) completed.delete(completed.values().next().value)
    }
  }
  const retainedStringBytes = [...completed].reduce((total, key) => total + key.length * 2, 0)
  return { milliseconds: performance.now() - started, processed, retainedEntries: completed.size, retainedStringBytes }
}

function measureIndexed() {
  const completed = createCompletedMotionPreparation()
  const index = indexMotionPreparationCharacters(characters)
  let processed = 0
  const started = performance.now()
  for (const plan of plans) {
    const character = index.get(plan.characterId)
    if (!character || hasCompletedMotionPreparation(completed, plan.key, character)) continue
    rememberCompletedMotionPreparation(completed, plan.key, character)
    processed++
  }
  const retainedCharacters = completed.oldestFirst.map((entry) => entry.character)
  const uniqueFingerprintBytes = [...new Set(retainedCharacters.map((character) => character.fingerprint))]
    .reduce((total, fingerprint) => total + fingerprint.length * 2, 0)
  const uniqueCharacterIdBytes = [...new Set(retainedCharacters.map((character) => character.characterId))]
    .reduce((total, characterId) => total + characterId.length * 2, 0)
  const retainedPlanKeyBytes = [...completed.byPlan.keys()].reduce((total, key) => total + key.length * 2, 0)
  return { milliseconds: performance.now() - started, processed, retainedEntries: completed.oldestFirst.length, retainedPlanKeyBytes, uniqueFingerprintBytes, uniqueCharacterIdBytes }
}

const legacySamples = []
const indexedSamples = []
const serializationCounts = { legacy: [], indexed: [] }
const originalStringify = JSON.stringify
for (let round = 0; round < rounds; round++) {
  let serializations = 0
  JSON.stringify = function (...args) { serializations++; return originalStringify.apply(this, args) }
  const legacy = measureLegacy()
  serializationCounts.legacy.push(serializations)
  JSON.stringify = originalStringify
  legacySamples.push(legacy)

  serializations = 0
  JSON.stringify = function (...args) { serializations++; return originalStringify.apply(this, args) }
  const indexed = measureIndexed()
  serializationCounts.indexed.push(serializations)
  JSON.stringify = originalStringify
  indexedSamples.push(indexed)
}

const median = (values) => [...values].sort((left, right) => left - right)[Math.floor(values.length / 2)]
const legacyMedianMs = median(legacySamples.map((sample) => sample.milliseconds))
const indexedMedianMs = median(indexedSamples.map((sample) => sample.milliseconds))
const legacyProcessed = legacySamples[0].processed
const indexedProcessed = indexedSamples[0].processed
const legacyRetained = legacySamples[0].retainedEntries
const indexedRetained = indexedSamples[0].retainedEntries
if (legacyProcessed !== planCount || indexedProcessed !== legacyProcessed || legacyRetained !== 256 || indexedRetained !== legacyRetained) throw Error('Os caminhos de preparação concluíram planos ou mantiveram entradas diferentes.')

console.log(JSON.stringify({
  scenario: { characters: characterCount, plans: planCount, rounds, approximateCharacterCodeUnits: originalStringify(characters[0]).length },
  legacy: {
    medianMs: Number(legacyMedianMs.toFixed(2)),
    medianSerializations: median(serializationCounts.legacy),
    retainedKeyBytes: legacySamples[0].retainedStringBytes,
    retainedEntries: legacyRetained
  },
  indexed: {
    medianMs: Number(indexedMedianMs.toFixed(2)),
    medianSerializations: median(serializationCounts.indexed),
    retainedPlanKeyBytes: indexedSamples[0].retainedPlanKeyBytes,
    uniqueFingerprintBytes: indexedSamples[0].uniqueFingerprintBytes,
    uniqueCharacterIdBytes: indexedSamples[0].uniqueCharacterIdBytes,
    retainedEntries: indexedRetained
  },
  speedup: Number((legacyMedianMs / indexedMedianMs).toFixed(2)),
  identicalCompletedPlans: indexedProcessed
}, null, 2))
