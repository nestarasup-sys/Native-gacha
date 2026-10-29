import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateModelSourceComposePixels, shouldComposeModelSourceOnMainThread } from '../src/renderer/src/features/fabricator/models/modelSourceExecutionStrategy.ts'

function project(width, height, partSize) {
  return {
    width,
    height,
    tolerance: 74,
    parts: Array.from({ length: 8 }, (_, index) => ({
      id: `part-${index}`,
      x: index % 4 * partSize,
      y: Math.floor(index / 4) * partSize,
      width: partSize,
      height: partSize,
      sourceTransform: { x: index % 4 * partSize, y: Math.floor(index / 4) * partSize, width: partSize, height: partSize }
    }))
  }
}

test('composição moderada evita inicialização e trânsito do worker', () => {
  const model = project(2048, 1024, 512)

  assert.equal(estimateModelSourceComposePixels(model, {}), 6_291_456)
  assert.equal(shouldComposeModelSourceOnMainThread(model, {}, 74), true)
})

test('folhas grandes são compostas no worker para evitar bloqueio longo da interface', () => {
  const model = project(4096, 2048, 1024)

  assert.equal(estimateModelSourceComposePixels(model, {}), 25_165_824)
  assert.equal(shouldComposeModelSourceOnMainThread(model, {}, 74), false)
})

test('carga intermediária permanece local para não triplicar o tempo de prévia', () => {
  const model = project(3072, 1536, 768)

  assert.equal(estimateModelSourceComposePixels(model, {}), 14_155_776)
  assert.equal(shouldComposeModelSourceOnMainThread(model, {}, 74), true)
})

test('alterações de Chroma sempre usam o worker mesmo em folhas pequenas', () => {
  const model = project(1200, 900, 150)

  assert.equal(shouldComposeModelSourceOnMainThread(model, {}, 90), false)
})

test('estimativa considera dimensões editadas no rascunho', () => {
  const model = project(1200, 900, 150)
  const original = estimateModelSourceComposePixels(model, {})
  const enlarged = estimateModelSourceComposePixels(model, { 'part-0': { width: 800, height: 800 } })

  assert.ok(enlarged > original)
  assert.equal(shouldComposeModelSourceOnMainThread(model, { 'part-0': { width: 800, height: 800 } }, 74), true)
})
