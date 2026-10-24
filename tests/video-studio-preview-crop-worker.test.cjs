'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function rig(width, height, alphas) {
  const posted = []
  const listeners = new Map()
  const crops = []
  let bitmapClosed = 0
  const self = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    postMessage: (message, transfer) => posted.push({ message, transfer }),
  }
  class OffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h }
    getContext() {
      return {
        drawImage: (...args) => crops.push(args.slice(1)),
        getImageData: () => ({
          data: Uint8ClampedArray.from(alphas.flatMap(a => [5, 10, 15, a])),
        }),
      }
    }
    transferToImageBitmap() { return { width: this.width, height: this.height } }
  }
  const source = fs.readFileSync(path.join(__dirname,
    '../src/renderer/src/features/videoStudio/videoGachaPreviewCrop.worker.ts'), 'utf8')
  const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  new Function('self', 'OffscreenCanvas', 'exports', js)(self, OffscreenCanvas, {})
  const bitmap = { width, height, close() { bitmapClosed++ } }
  return {
    run: (id) => listeners.get('message')({ data: { id, bitmap } }),
    posted, crops, closed: () => bitmapClosed,
  }
}

test('preview crop worker preserves the original alpha >8 bounding box and transfer semantics', () => {
  const alphas = [
    0, 8, 0, 0,
    0, 9, 200, 0,
    0, 0, 0, 0,
  ]
  const f = rig(4, 3, alphas)
  f.run(7)
  assert.equal(f.posted.length, 1)
  const { message, transfer } = f.posted[0]
  assert.equal(message.id, 7)
  assert.deepEqual(message.crop, { width: 2, height: 1 })
  assert.equal(message.width, 4)
  assert.equal(message.height, 3)
  assert.equal(message.bitmap.width, 2)
  assert.equal(message.bitmap.height, 1)
  assert.strictEqual(transfer[0], message.bitmap)
  assert.deepEqual(f.crops[1], [1, 1, 2, 1, 0, 0, 2, 1])
  assert.equal(f.closed(), 1)
})

test('preview crop worker retains complete dimensions for fully transparent rasters', () => {
  const f = rig(2, 2, [0, 0, 0, 0])
  f.run(9)
  assert.equal(f.posted[0].message.crop, null)
  assert.deepEqual([f.posted[0].message.bitmap.width, f.posted[0].message.bitmap.height], [2, 2])
  assert.equal(f.closed(), 1)
})
