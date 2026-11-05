import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { createEditorV7Document } from '../../src/shared/editorV7.ts'
import { createEditorV7FrameRenderer, renderEditorV7Frame } from '../../electron/domains/editorV7/renderFrame.ts'

test('native V7 renderer rasterizes canonical layers and preserves RGBA byte layout', async () => {
  const image = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 240, g: 20, b: 30, alpha: 1 } } }).png().toBuffer()
  const document = createEditorV7Document('render-test', 'Renderer test', { width: 320, height: 180, fps: 30, durationFrames: 30 })
  document.assets.push({ id: 'red', name: 'red', mimeType: 'image/png', dataUrl: `data:image/png;base64,${image.toString('base64')}` })
  document.layers.push({ id: 'red-layer', name: 'red layer', assetId: 'red', startTick: 0, endTick: document.durationTicks, transform: { x: 10, y: 10, width: 20, height: 20, rotation: 0, opacity: 1, flipX: false }, visible: true, zIndex: 0 })
  const raw = await renderEditorV7Frame(document, 0)
  const cachedRaw = await createEditorV7FrameRenderer(document)(0)
  assert.equal(raw.length, 320 * 180 * 4)
  assert.equal(cachedRaw.length, raw.length)
  assert.deepEqual([...raw.subarray((15 * 320 + 15) * 4, (15 * 320 + 15) * 4 + 4)], [240, 20, 30, 255])
  assert.deepEqual([...cachedRaw.subarray((15 * 320 + 15) * 4, (15 * 320 + 15) * 4 + 4)], [240, 20, 30, 255])
  assert.deepEqual([...raw.subarray(0, 4)], [255, 255, 255, 255])
})

test('native V7 renderer rejects a cancelled frame render before allocating work', async () => {
  const document = createEditorV7Document('cancel-test', 'Cancelled', { width: 320, height: 180, fps: 30, durationFrames: 30 })
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  await assert.rejects(renderEditorV7Frame(document, 0, controller.signal), /cancelled/)
})
