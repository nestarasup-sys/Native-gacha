'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function moduleFrom(file, factory) {
  const source = fs.readFileSync(path.resolve(__dirname, file), 'utf8')
  const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'Image', 'document', js)(
    factory.require, module, module.exports, factory.Image, factory.document
  )
  return module.exports
}

function fakeRenderer() {
  const counter = { decoded: 0, skinTints: 0 }
  class FakeImage {
    naturalWidth = 1024
    naturalHeight = 1024
    width = 1024
    height = 1024
    decoding = 'async'
    onload = null
    onerror = null
    set src(value) {
      this.source = value
      counter.decoded++
      queueMicrotask(() => this.onload?.())
    }
    get src() { return this.source }
    async decode() {}
  }
  const document = { createElement(name) {
    assert.equal(name, 'canvas')
    return {
      width: 0, height: 0,
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray([135, 110, 96, 255]) }),
        putImageData() { counter.skinTints++ },
      }),
      toDataURL: () => 'data:image/png;base64,FAKE',
    }
  } }
  const basic = moduleFrom('../src/shared/videoStudioNext/resourceBudget.ts', {
    require: () => ({}), Image: FakeImage, document,
  })
  const memo = moduleFrom('../src/shared/videoStudioNext/boundedMemo.ts', {
    require: () => ({}), Image: FakeImage, document,
  })
  const imageMemos = moduleFrom('../src/renderer/src/characters/characterImageMemos.ts', {
    require: (id) => id.endsWith('/boundedMemo') ? memo : {},
    Image: FakeImage, document,
  })
  const renderer = moduleFrom('../src/renderer/src/characters/characterRenderer.ts', {
    require: (id) => {
      if (id === './characterImageMemos') return imageMemos
      if (id.endsWith('/hairCategories')) return { hairCategories: [] }
      if (id.endsWith('/skinTint')) return { tintSkinPixels: () => {} }
      return {}
    },
    Image: FakeImage, document,
  })
  return { budget: basic.VideoStudioResourceBudget, renderer, counter }
}

test('opt-in Gacha export cache retains decoded originals by bytes, never 256 unbounded assets', async () => {
  const { budget: Budget, renderer, counter } = fakeRenderer()
  const ledger = new Budget(160 * 1024 * 1024)
  renderer.configureVideoExportCharacterImageCaches(ledger)
  for (let i = 0; i < 14; i++) {
    await renderer.loadCachedImage('synthetic-source-' + i)
  }
  assert.ok(ledger.snapshot().byCategory.texture <= 24 * 1024 * 1024)
  const previousDecoded = counter.decoded
  await renderer.loadCachedImage('synthetic-source-13')
  assert.equal(counter.decoded, previousDecoded, 'recently used image is reused')
  await renderer.loadCachedImage('synthetic-source-0')
  assert.equal(counter.decoded, previousDecoded + 1, 'evicted image can be decoded again')
  renderer.clearVideoExportCharacterImageCaches()
  assert.equal(ledger.snapshot().usedBytes, 0)
  renderer.disposeVideoExportCharacterImageCaches()
  assert.equal(ledger.snapshot().usedBytes, 0)
})

test('skin recolors share the export ledger and are released without touching source assets', async () => {
  const { budget: Budget, renderer, counter } = fakeRenderer()
  const ledger = new Budget(160 * 1024 * 1024)
  renderer.configureVideoExportCharacterImageCaches(ledger)
  const first = await renderer.loadSkinTintedImage('model-body', '#806655')
  const second = await renderer.loadSkinTintedImage('model-body', '#806655')
  assert.equal(first, second, 'same model/tint reuses a derived image')
  for (let i = 0; i < 10; i++) {
    await renderer.loadSkinTintedImage('model-body', '#' + String(i).padStart(6, '0'))
  }
  assert.ok(counter.skinTints >= 10)
  assert.ok(ledger.snapshot().byCategory.texture <= 40 * 1024 * 1024)
  renderer.disposeVideoExportCharacterImageCaches()
  assert.equal(ledger.snapshot().usedBytes, 0)
})
