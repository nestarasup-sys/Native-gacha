import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { projectSceneCharacters, sceneExpressionPresetSignature } from '../../src/renderer/src/characters/sceneCharacterProjection.ts'

const itemCount = 2000
const renderCount = 200
const runs = 7
const elements = Array.from({ length: itemCount }, (_, index) => index % 4 === 0
  ? {
    id: `actor-${index}`,
    kind: 'character',
    characterId: `character-${index}`,
    activeExpressionCollectionId: `collection-${index % 7}`,
    activeExpressionPresetId: `preset-${index % 23}`
  }
  : { id: `element-${index}`, kind: index % 2 === 0 ? 'image' : 'speech' })

function previousPageDerivation(source) {
  const characters = source.filter((element) => element.kind === 'character')
  const autosaveSignature = JSON.stringify(source
    .filter((element) => element.kind === 'character')
    .map((element) => [element.id, element.activeExpressionCollectionId, element.activeExpressionPresetId]))
  const activePresetSignature = JSON.stringify(source
    .filter((element) => element.kind === 'character' && element.characterId && element.activeExpressionPresetId)
    .map((element) => [element.characterId, element.activeExpressionPresetId]))
  return { characters, autosaveSignature, activePresetSignature }
}

function currentPageDerivation(source) {
  return {
    ...projectSceneCharacters(source),
    activePresetSignature: sceneExpressionPresetSignature(source)
  }
}

function createMemoizedDerivation() {
  let lastSource = null
  let lastResult = null
  return (source) => {
    if (source !== lastSource) {
      lastSource = source
      lastResult = currentPageDerivation(source)
    }
    return lastResult
  }
}

function previousRepeatedRenders() {
  let result
  for (let render = 0; render < renderCount; render += 1) result = previousPageDerivation(elements)
  return result
}

function memoizedRepeatedRenders() {
  const derive = createMemoizedDerivation()
  let result
  for (let render = 0; render < renderCount; render += 1) result = derive(elements)
  return result
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

assert.deepEqual(currentPageDerivation(elements), previousPageDerivation(elements))
const previousMedianMs = measure(previousRepeatedRenders)
const memoizedMedianMs = measure(memoizedRepeatedRenders)
console.log(JSON.stringify({
  sceneElements: itemCount,
  characters: elements.filter((element) => element.kind === 'character').length,
  unrelatedRenders: renderCount,
  runs,
  previousMedianMs: Number(previousMedianMs.toFixed(3)),
  memoizedMedianMs: Number(memoizedMedianMs.toFixed(3)),
  speedup: Number((previousMedianMs / memoizedMedianMs).toFixed(2)),
  note: 'synthetic selector benchmark; assumes scene elements keep the same reference during unrelated UI renders'
}, null, 2))
