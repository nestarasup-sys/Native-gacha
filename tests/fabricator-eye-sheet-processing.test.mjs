import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { splitEyeSheet } from '../src/renderer/src/features/fabricator/face/splitEyeSheet.ts'
import { splitEyeSheetPixels } from '../src/renderer/src/features/fabricator/face/splitEyeSheetPixels.ts'
import { pngBufferToDataUrl } from '../src/renderer/src/features/fabricator/face/pngBufferToDataUrl.ts'

function pixelIndex(width, x, y) {
  return (y * width + x) * 4
}

function fillRect(data, width, { x1, x2, y1, y2, color }) {
  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) data.set(color, pixelIndex(width, x, y))
  }
}

test('separa as três peças, remove fundo conectado à borda e preserva áreas internas', () => {
  const width = 8
  const height = 18
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set([0, 255, 0, 255], offset)
  fillRect(pixels, width, { x1: 2, x2: 5, y1: 1, y2: 4, color: [220, 30, 30, 255] })
  fillRect(pixels, width, { x1: 3, x2: 4, y1: 7, y2: 10, color: [30, 30, 220, 255] })
  fillRect(pixels, width, { x1: 1, x2: 6, y1: 13, y2: 16, color: [220, 30, 220, 255] })

  const enclosedBackgroundPixel = pixelIndex(width, 3, 2)
  pixels.set([0, 255, 0, 255], enclosedBackgroundPixel)
  const [eye, pupil, closedEye] = splitEyeSheetPixels(pixels, width, height)

  assert.deepEqual([eye.kind, eye.width, eye.height], ['eye', 4, 4])
  assert.deepEqual([pupil.kind, pupil.width, pupil.height], ['pupil', 2, 4])
  assert.deepEqual([closedEye.kind, closedEye.width, closedEye.height], ['eye-closed', 6, 4])
  assert.equal(pixels[pixelIndex(width, 0, 0) + 3], 0)
  assert.equal(pixels[enclosedBackgroundPixel + 3], 255)
  assert.deepEqual([...eye.pixels.slice(0, 4)], [220, 30, 30, 255])
  assert.deepEqual([...pupil.pixels.slice(0, 4)], [30, 30, 220, 255])
  assert.deepEqual([...closedEye.pixels.slice(0, 4)], [220, 30, 220, 255])
})

test('valida dimensões e conteúdo antes de recortar', () => {
  assert.throws(() => splitEyeSheetPixels(new Uint8ClampedArray(4), 0, 1), /dimensões inválidas/)
  assert.throws(() => splitEyeSheetPixels(new Uint8ClampedArray(4), 2, 1), /dimensões inválidas/)
  assert.throws(() => splitEyeSheetPixels(new Uint8ClampedArray(4 * 12), 3, 4), /A folha não contém peças visíveis/)
})

test('codifica PNGs com o mesmo prefixo de data URL e deixa a análise de pixels no worker', async () => {
  assert.equal(pngBufferToDataUrl(Uint8Array.from([137, 80, 78, 71]).buffer), 'data:image/png;base64,iVBORw==')

  const renderer = await readFile('src/renderer/src/features/fabricator/face/splitEyeSheet.ts', 'utf8')
  const worker = await readFile('src/renderer/src/features/fabricator/face/eyeSheetProcessor.worker.ts', 'utf8')
  assert.match(renderer, /new Worker\(new URL\('\.\/eyeSheetProcessor\.worker\.ts'/)
  assert.doesNotMatch(renderer, /getImageData|createImageBitmap|new Uint8ClampedArray/)
  assert.match(worker, /OffscreenCanvas/)
  assert.match(worker, /splitEyeSheetPixels/)
  assert.match(worker, /32_000_000/)
  assert.match(worker, /postMessage\(\{ id: data\.id, type: 'complete', pieces \}, pieces\.map\(\(piece\) => piece\.png\)\)/)
})

test('converte respostas do worker e o termina ao concluir', async () => {
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  let currentWorker
  class FakeWorker {
    onmessage = null
    onerror = null
    onmessageerror = null
    terminated = false
    postMessage(message) { this.message = message }
    terminate() { this.terminated = true }
    constructor() { currentWorker = this }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: FakeWorker })
  try {
    const pending = splitEyeSheet('synthetic-source')
    assert.equal(currentWorker.message.id, 1)
    currentWorker.onmessage({ data: {
      id: 1,
      type: 'complete',
      pieces: [{ kind: 'eye', width: 1, height: 1, png: Uint8Array.from([137, 80, 78, 71]).buffer }]
    } })
    assert.deepEqual(await pending, [{ kind: 'eye', width: 1, height: 1, dataUrl: 'data:image/png;base64,iVBORw==' }])
    assert.equal(currentWorker.terminated, true)
    assert.equal(currentWorker.onmessage, null)
  } finally {
    if (previousWorker) Object.defineProperty(globalThis, 'Worker', previousWorker)
    else Reflect.deleteProperty(globalThis, 'Worker')
  }
})

test('cancelar a importação termina o worker e rejeita como AbortError', async () => {
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  let currentWorker
  class FakeWorker {
    onmessage = null
    onerror = null
    onmessageerror = null
    terminated = false
    postMessage() { this.sent = true }
    terminate() { this.terminated = true }
    constructor() { currentWorker = this }
  }
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: FakeWorker })
  try {
    const controller = new AbortController()
    const pending = splitEyeSheet('synthetic-source', controller.signal)
    assert.equal(currentWorker.sent, true)
    controller.abort()
    await assert.rejects(pending, { name: 'AbortError' })
    assert.equal(currentWorker.terminated, true)
    assert.equal(currentWorker.onmessage, null)
    const workspace = await readFile('src/renderer/src/features/fabricator/face/FaceComponentsWorkspace.tsx', 'utf8')
    const importCommands = await readFile('src/renderer/src/features/fabricator/face/faceComponentImportCommands.ts', 'utf8')
    const batchWriter = await readFile('src/renderer/src/features/fabricator/face/faceComponentAssetBatch.ts', 'utf8')
    assert.match(workspace, /cancelEyeSheetImport\(\), \[mode, modelSlot\]\)/)
    assert.match(importCommands, /eyeSheetImportController\.current = controller/)
    assert.match(importCommands, /eyeSheetImportContextCancelled\.current = true[\s\S]*controller\.abort\(\)/)
    assert.match(importCommands, /saveAssetBatch\(dependencies\.api, modelSlot, plan\.entries, controller\.signal\)/)
    assert.match(importCommands, /if \(!dependencies\.isContextCurrent\(\)\) return/)
    assert.match(batchWriter, /Promise\.allSettled\(attemptedIds\.map\(\(id\) => writer\.deleteFaceComponentAsset\(modelSlot, id\)\)\)/)
  } finally {
    if (previousWorker) Object.defineProperty(globalThis, 'Worker', previousWorker)
    else Reflect.deleteProperty(globalThis, 'Worker')
  }
})
