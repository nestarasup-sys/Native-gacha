import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditorV7Document, editorV7FrameToTick, editorV7TickToFrame, parseEditorV7Document, resolveEditorV7Scene } from '../../src/shared/editorV7.ts'

const png = 'data:image/png;base64,aGVsbG8='
function fixture() {
  const document = createEditorV7Document('doc-1', 'Fixture', { width: 320, height: 180, fps: 30, durationFrames: 30 })
  document.assets.push({ id: 'asset-a', mimeType: 'image/png', dataUrl: png, name: 'synthetic' })
  document.layers.push({ id: 'layer-a', name: 'actor', assetId: 'asset-a', startTick: 0, endTick: document.durationTicks, transform: { x: 50, y: 40, width: 100, height: 80, rotation: 0, opacity: 1, flipX: false }, visible: true, zIndex: 0 })
  return document
}

test('frame/tick conversion is exact for the project frame rate', () => {
  for (let frame = 0; frame < 100_000; frame += 1) assert.equal(editorV7TickToFrame(editorV7FrameToTick(frame, { numerator: 30, denominator: 1 }), { numerator: 30, denominator: 1 }), frame)
})

test('scene resolution is absolute, stable, and respects half-open layer intervals', () => {
  const document = fixture()
  const tick = editorV7FrameToTick(12, document.frameRate)
  const first = resolveEditorV7Scene(document, tick)
  first.layers[0].transform.x = -999
  const second = resolveEditorV7Scene(document, tick)
  assert.equal(second.layers[0].transform.x, 50)
  document.layers[0].endTick = tick
  assert.equal(resolveEditorV7Scene(document, tick).layers.length, 0)
})

test('hidden layers are excluded and draw order has a stable tie-breaker', () => {
  const document = fixture()
  document.layers.push({ ...document.layers[0], id: 'layer-b', name: 'second', visible: false, zIndex: 2 })
  document.layers.push({ ...document.layers[0], id: 'layer-c', name: 'third', zIndex: 0 })
  assert.deepEqual(resolveEditorV7Scene(document, 0).layers.map(({ id }) => id), ['layer-a', 'layer-c'])
})

test('document validation rejects missing assets, duplicate IDs, and malformed image data', () => {
  const document = fixture()
  const missing = structuredClone(document)
  missing.layers[0].assetId = 'missing'
  assert.throws(() => parseEditorV7Document(missing))
  const duplicate = structuredClone(document)
  duplicate.assets.push({ ...duplicate.assets[0] })
  assert.throws(() => parseEditorV7Document(duplicate))
  const badData = structuredClone(document)
  badData.assets[0].dataUrl = 'https://example.test/image.png'
  assert.throws(() => parseEditorV7Document(badData))
})

test('frame conversion and scene resolution reject invalid time', () => {
  const document = fixture()
  assert.throws(() => editorV7FrameToTick(1.5, document.frameRate), RangeError)
  assert.throws(() => resolveEditorV7Scene(document, document.durationTicks), RangeError)
})
