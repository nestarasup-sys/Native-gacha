import test from 'node:test'
import assert from 'node:assert/strict'
import { selectOriginalModelSource, selectMountedModelSource } from '../src/shared/fabricatorModelViews.ts'

const source = 'data:image/png;base64,c29tZQ=='
const project = () => ({
  schemaVersion: 1, slot: 1, name: 'Modelo montado', sourceName: 'folha.png',
  sourceAssetName: 'source-abcd1234.png', sourceDataUrl: source,
  width: 300, height: 400, tolerance: 74, updatedAt: '2026-10-22T12:00:00Z',
  parts: [{
    id: 'cabeca', name: 'Cabeça', x: 175, y: 95, width: 52, height: 60, rotation: 15,
    dataUrl: 'data:image/png;base64,UEVDQQ==',
    sourceTransform: { x: 15, y: 20, width: 42, height: 48, rotation: 0, jointAnchor: {x: 32, y: 62} },
    jointAnchor: {x: 201, y: 155}
  }],
  joints: [{ id: 'pescoço', parentPartId: 'tronco', childPartId: 'cabeca', fixed: true }],
  layerOrder: ['cabeca'], hiddenPartIds: ['cabeca']
})

test('Model Source usa folha e coordenadas da imagem original, não a pose montada', () => {
  const model = project()
  const original = selectOriginalModelSource(model)
  assert.equal(original.kind, 'original')
  assert.equal(original.sourceDataUrl, source)
  assert.deepEqual([original.parts[0].x, original.parts[0].y], [15,20])
  assert.deepEqual([original.parts[0].width, original.parts[0].height], [42,48])
  assert.equal('joints' in original, false)
  assert.equal(original.parts[0].dataUrl, model.parts[0].dataUrl)
})

test('Poses DEV recebe a montagem com articulações, escala e camadas, sem mutar catálogo', () => {
  const model = project()
  const previous = structuredClone(model)
  const mounted = selectMountedModelSource(model)
  assert.equal(mounted.kind, 'mounted')
  assert.deepEqual([mounted.parts[0].x, mounted.parts[0].y], [175,95])
  assert.equal(mounted.parts[0].rotation, 15)
  assert.equal(mounted.joints[0].fixed, true)
  assert.deepEqual(mounted.layerOrder, ['cabeca'])
  mounted.parts[0].x = 400
  mounted.parts[0].sourceTransform.jointAnchor.x = 800
  mounted.joints[0].fixed = false
  mounted.layerOrder.push('teste')
  mounted.hiddenPartIds.push('teste')
  assert.deepEqual(model, previous)
})

test('contratos funcionam para modelos legados sem sourceTransform ou lista de camadas', () => {
  const model = project()
  delete model.parts[0].sourceTransform
  delete model.layerOrder
  delete model.hiddenPartIds
  assert.equal(selectOriginalModelSource(model).parts[0].x,175)
  assert.deepEqual(selectMountedModelSource(model).layerOrder,['cabeca'])
  assert.deepEqual(selectMountedModelSource(model).hiddenPartIds,[])
})
