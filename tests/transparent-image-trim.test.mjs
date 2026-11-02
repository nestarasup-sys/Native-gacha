import test from 'node:test'
import assert from 'node:assert/strict'
import { trimTransparentImage } from '../src/renderer/src/characters/transparentImageTrim.ts'

async function runTrim(alphaRows, { readFails = false, missingContext = false, decodeFails = false } = {}) {
  const originalImage = globalThis.Image
  const originalDocument = globalThis.document
  const canvases = []
  class FakeImage {
    naturalWidth = alphaRows[0]?.length ?? 0
    naturalHeight = alphaRows.length
    set src(_value) {
      queueMicrotask(() => decodeFails ? this.onerror?.() : this.onload?.())
    }
  }
  class FakeCanvas {
    width = 0
    height = 0
    constructor() { canvases.push(this) }
    getContext() {
      if (missingContext) return null
      return {
        drawImage() {},
        getImageData: () => {
          if (readFails) throw new Error('canvas read blocked')
          const data = new Uint8ClampedArray(this.width * this.height * 4)
          for (let y = 0; y < alphaRows.length; y++) {
            for (let x = 0; x < alphaRows[y].length; x++) data[(y * this.width + x) * 4 + 3] = alphaRows[y][x]
          }
          return { data }
        }
      }
    }
    toDataURL() { return 'data:image/png;base64,cropped' }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: FakeImage })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new FakeCanvas() } })
  try {
    const result = await trimTransparentImage('data:image/png;base64,source')
    return { result, canvases }
  } finally {
    if (originalImage === undefined) delete globalThis.Image
    else Object.defineProperty(globalThis, 'Image', { configurable: true, value: originalImage })
    if (originalDocument === undefined) delete globalThis.document
    else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
  }
}

test('corta a margem transparente e mantém a posição e as dimensões da origem', async () => {
  const { result, canvases } = await runTrim([
    [0, 0, 0, 0, 0],
    [0, 0, 20, 20, 0],
    [0, 0, 255, 20, 0],
    [0, 0, 0, 0, 0]
  ])
  assert.deepEqual(result, {
    dataUrl: 'data:image/png;base64,cropped', width: 2, height: 2,
    left: 2, top: 1, sourceWidth: 5, sourceHeight: 4
  })
  assert.equal(canvases[1].width, 2)
  assert.equal(canvases[1].height, 2)
})

test('ignora pixels quase transparentes e retorna null para imagem vazia ou já justa', async () => {
  const nearlyTransparent = await runTrim([[0, 8, 0], [0, 0, 0]])
  assert.equal(nearlyTransparent.result, null)
  assert.equal(nearlyTransparent.canvases.length, 1)

  const alreadyTight = await runTrim([[255, 255], [255, 255]])
  assert.equal(alreadyTight.result, null)
  assert.equal(alreadyTight.canvases.length, 1)
})

test('falhas de decode, leitura e contexto continuam resolvendo sem recorte', async () => {
  assert.equal((await runTrim([[255]], { decodeFails: true })).result, null)
  assert.equal((await runTrim([[255]], { readFails: true })).result, null)
  assert.equal((await runTrim([[255]], { missingContext: true })).result, null)
})
