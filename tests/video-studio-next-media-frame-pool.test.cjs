'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function compile(file) {
  return ts.transpile(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
  })
}
const resourceModule = { exports: {} }
new Function('module', 'exports', compile('../src/shared/videoStudioNext/resourceBudget.ts'))(
  resourceModule, resourceModule.exports
)
const { VideoStudioResourceBudget } = resourceModule.exports

function harness({ width = 4, height = 4, beforeBitmap, metadataWidth = width, metadataHeight = height } = {}) {
  const bitmaps = []
  const videoElements = []
  const document = {
    createElement(name) {
      assert.equal(name, 'video')
      const events = new Map()
      let currentTime = 0
      const video = {
        muted: false, preload: '', playsInline: false, crossOrigin: '', src: '',
        duration: 30, readyState: 3, videoWidth: metadataWidth, videoHeight: metadataHeight,
        get currentTime() { return currentTime },
        set currentTime(next) {
          currentTime = next
          queueMicrotask(() => { for (const callback of events.get('seeked') ?? []) callback() })
        },
        addEventListener(event, callback) {
          if (!events.has(event)) events.set(event, new Set())
          events.get(event).add(callback)
        },
        removeEventListener(event, callback) { events.get(event)?.delete(callback) },
        removeAttribute(key) { if (key === 'src') this.src = '' },
        load() {}, pause() {},
      }
      videoElements.push(video)
      return video
    },
  }
  const createImageBitmap = async (video) => {
    if (beforeBitmap) await beforeBitmap(video)
    const bitmap = {
      width, height, src: video.src, closed: false,
      close() { this.closed = true },
    }
    bitmaps.push(bitmap)
    return bitmap
  }
  const poolModule = { exports: {} }
  new Function('module', 'exports', 'document', 'HTMLMediaElement', 'window', 'createImageBitmap', 'DOMException',
    compile('../src/renderer/src/features/videoStudio/videoExportMediaFramePool.ts'))(
    poolModule, poolModule.exports, document,
    { HAVE_METADATA: 1, HAVE_CURRENT_DATA: 2 },
    { setTimeout, clearTimeout }, createImageBitmap, DOMException
  )
  return { Pool: poolModule.exports.VideoExportMediaFramePool, bitmaps, videoElements }
}
const scene = (...ids) => ({
  videos: ids.map((id) => ({
    clipId: id, assetId: id, sourceTimeNumerator: 0, sourceTimeDenominator: 60,
  })),
})

test('3 simultaneous videos stay open during composite even when LRU holds only 1', async () => {
  const { Pool, bitmaps } = harness()
  const budget = new VideoStudioResourceBudget(256)
  const pool = new Pool('job', 64, budget)
  const borrowed = await pool.acquireFramesForScene(scene('a', 'b', 'c'))
  assert.equal(borrowed.frames.size, 3)
  assert.ok(bitmaps.every((bitmap) => !bitmap.closed), 'no in-flight bitmap may be evicted')
  assert.equal(budget.snapshot().usedBytes, 192)
  await assert.rejects(pool.acquireFramesForScene(scene('d')), /simultâneas/)
  borrowed.release()
  borrowed.release()
  assert.equal(budget.snapshot().usedBytes, 64)
  assert.deepEqual(bitmaps.map((bitmap) => bitmap.closed), [false, true, true])
  const again = await pool.acquireFramesForScene(scene('a'))
  assert.equal(again.frames.get('a'), bitmaps[0], 'cached bitmap reused without decoding')
  again.release()
  assert.equal(bitmaps.length, 3)
  pool.dispose()
  assert.equal(budget.snapshot().usedBytes, 0)
  assert.ok(bitmaps.every((bitmap) => bitmap.closed))
})

test('layer-cache memory pressure releases derived layers before denying video frames', async () => {
  const { Pool, bitmaps } = harness()
  const budget = new VideoStudioResourceBudget(128)
  const layerLease = budget.tryReserve('preview', 64)
  let pressureCalls = 0
  const pool = new Pool('job', 96, budget, () => {
    pressureCalls++
    layerLease.release()
  })
  const borrowed = await pool.acquireFramesForScene(scene('a', 'b'))
  assert.equal(pressureCalls, 1)
  assert.equal(budget.snapshot().usedBytes, 128)
  assert.ok(bitmaps.every((bitmap) => !bitmap.closed))
  borrowed.release()
  assert.equal(budget.snapshot().usedBytes, 64)
  pool.dispose()
  assert.equal(budget.snapshot().usedBytes, 0)
})

test('preflight denies a second frame BEFORE bitmap allocation and releases the first pin', async () => {
  const { Pool, bitmaps } = harness()
  const budget = new VideoStudioResourceBudget(64)
  const pool = new Pool('job', 96, budget)
  await assert.rejects(pool.acquireFramesForScene(scene('a', 'b')), /Orçamento/)
  assert.deepEqual(bitmaps.map((bitmap) => bitmap.closed), [false], 'second bitmap is never allocated')
  assert.equal(budget.snapshot().activeLeases, 1, 'first frame can remain in reusable LRU')
  const recovered = await pool.acquireFramesForScene(scene('a'))
  assert.equal(recovered.frames.get('a'), bitmaps[0])
  recovered.release()
  pool.dispose()
  assert.equal(budget.snapshot().usedBytes, 0)
  assert.ok(bitmaps.every((bitmap) => bitmap.closed))
})

test('dispose during async decoding closes late bitmap and rejects the request', async () => {
  let enteredDecode
  let finishDecode
  const entered = new Promise((resolve) => { enteredDecode = resolve })
  const delayed = new Promise((resolve) => { finishDecode = resolve })
  const { Pool, bitmaps } = harness({ beforeBitmap: async () => {
    enteredDecode()
    await delayed
  } })
  const budget = new VideoStudioResourceBudget(128)
  const pool = new Pool('job', 96, budget)
  const pending = pool.acquireFramesForScene(scene('a'))
  await entered
  pool.dispose()
  finishDecode()
  await assert.rejects(pending, /descartado/)
  assert.equal(bitmaps.length, 1)
  assert.equal(bitmaps[0].closed, true)
  assert.equal(budget.snapshot().usedBytes, 0)
})

test('seek with source PTS is repeatable; abort and invalid timestamps cleanly fail', async () => {
  const { Pool, bitmaps, videoElements } = harness()
  const budget = new VideoStudioResourceBudget(256)
  const pool = new Pool('job', 96, budget)
  const first = await pool.acquireFramesForScene({
    videos: [{ clipId: 'a', assetId: 'source', sourceTimeNumerator: 30, sourceTimeDenominator: 60 }],
  })
  assert.equal(videoElements[0].currentTime, 0.5)
  first.release()
  const second = await pool.acquireFramesForScene({
    videos: [{ clipId: 'a', assetId: 'source', sourceTimeNumerator: 0, sourceTimeDenominator: 60 }],
  })
  assert.equal(videoElements[0].currentTime, 0)
  second.release()
  const previous = await pool.acquireFramesForScene({
    videos: [{ clipId: 'a', assetId: 'source', sourceTimeNumerator: 30, sourceTimeDenominator: 60 }],
  })
  assert.equal(videoElements[0].currentTime, 0.5, 'reverse seek returned to correct PTS')
  assert.equal(previous.frames.get('a').closed, false, 'new frame remains alive until release')
  previous.release()
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(pool.acquireFramesForScene(scene('b'), abort.signal), /abort|cancelad/i)
  await assert.rejects(pool.acquireFramesForScene({
    videos: [{ clipId: 'bad', assetId: 'source', sourceTimeNumerator: NaN, sourceTimeDenominator: 60 }],
  }), /Timestamp/)
  pool.dispose()
  assert.equal(budget.snapshot().usedBytes, 0)
})

test('long export releases idle HTMLVideoElement decoders instead of retaining every source', async () => {
  const { Pool, videoElements } = harness()
  const budget = new VideoStudioResourceBudget(512)
  const pool = new Pool('job', 64, budget, undefined, 3)
  for (let i = 0; i < 12; i++) {
    const borrowed = await pool.acquireFramesForScene(scene('media-' + i))
    assert.equal(borrowed.frames.size, 1)
    borrowed.release()
  }
  assert.equal(videoElements.length, 12, 'each new source has been decoded once')
  assert.equal(videoElements.filter((video) => video.src !== '').length, 3,
    'only three recently used decoders remain loaded')
  const revisited = await pool.acquireFramesForScene(scene('media-0'))
  assert.equal(revisited.frames.size, 1)
  revisited.release()
  assert.equal(videoElements.filter((video) => video.src !== '').length, 3)
  pool.dispose()
  assert.equal(videoElements.filter((video) => video.src !== '').length, 0)
  assert.equal(budget.snapshot().usedBytes, 0)
})

test('idle decoder cap never closes videos required simultaneously by one scene', async () => {
  const { Pool, videoElements, bitmaps } = harness()
  const budget = new VideoStudioResourceBudget(512)
  const pool = new Pool('job', 64, budget, undefined, 2)
  const borrowed = await pool.acquireFramesForScene(scene('one', 'two', 'three', 'four', 'five'))
  assert.equal(borrowed.frames.size, 5)
  assert.equal(videoElements.filter((video) => video.src !== '').length, 5)
  assert.ok(bitmaps.every((bitmap) => !bitmap.closed))
  borrowed.release()
  assert.equal(videoElements.filter((video) => video.src !== '').length, 2)
  pool.dispose()
  assert.equal(budget.snapshot().usedBytes, 0)
  assert.ok(bitmaps.every((bitmap) => bitmap.closed))
  assert.throws(() => new Pool('job', 64, undefined, undefined, 0), /decoders ociosos/)
})

test('admission failure cannot start a seek or allocate a bitmap', async () => {
  const { Pool, bitmaps, videoElements } = harness()
  const budget = new VideoStudioResourceBudget(32)
  const pool = new Pool('job', 96, budget)
  await assert.rejects(pool.acquireFramesForScene(scene('too-large')), /Orçamento/)
  assert.equal(bitmaps.length, 0)
  assert.equal(videoElements[0].currentTime, 0)
  assert.equal(budget.snapshot().usedBytes, 0)
  pool.dispose()
})

test('bad metadata rejects before decode; oversized bitmap is closed and returns reserved bytes', async () => {
  const budget = new VideoStudioResourceBudget(512)
  const wrongMeta = harness({ metadataWidth: 0 })
  const invalid = new wrongMeta.Pool('job', 512, budget)
  await assert.rejects(invalid.acquireFramesForScene(scene('invalid')), /Dimensões/)
  assert.equal(wrongMeta.bitmaps.length, 0)
  assert.equal(budget.snapshot().usedBytes, 0)
  invalid.dispose()

  const largerBitmap = harness({ width: 8, height: 8, metadataWidth: 4, metadataHeight: 4 })
  const pool = new largerBitmap.Pool('job', 512, budget)
  await assert.rejects(pool.acquireFramesForScene(scene('surprise')), /excede a reserva/)
  assert.equal(largerBitmap.bitmaps.length, 1)
  assert.equal(largerBitmap.bitmaps[0].closed, true)
  assert.equal(budget.snapshot().usedBytes, 0)
  pool.dispose()
})

test('bitmap conversion failure releases pre-admitted bytes and permits retry', async () => {
  let attempts = 0
  const { Pool } = harness({ beforeBitmap: async () => {
    if (++attempts === 1) throw new Error('synthetic bitmap failure')
  } })
  const budget = new VideoStudioResourceBudget(128)
  const pool = new Pool('job', 96, budget)
  await assert.rejects(pool.acquireFramesForScene(scene('retry')), /synthetic bitmap failure/)
  assert.equal(budget.snapshot().usedBytes, 0)
  const usable = await pool.acquireFramesForScene(scene('retry'))
  assert.equal(usable.frames.size, 1)
  usable.release()
  pool.dispose()
  assert.equal(budget.snapshot().usedBytes, 0)
})

test('abort during bitmap conversion closes late bitmap and releases its lease', async () => {
  let started
  let complete
  const entered = new Promise(resolve => { started = resolve })
  const delayed = new Promise(resolve => { complete = resolve })
  const { Pool, bitmaps } = harness({ beforeBitmap: async () => {
    started()
    await delayed
  } })
  const budget = new VideoStudioResourceBudget(128)
  const pool = new Pool('job', 96, budget)
  const controller = new AbortController()
  const pending = pool.acquireFramesForScene(scene('a'), controller.signal)
  await entered
  assert.equal(budget.snapshot().usedBytes, 64, 'reservation exists during conversion')
  controller.abort()
  complete()
  await assert.rejects(pending, /abort|cancelad/i)
  assert.equal(bitmaps.length, 1)
  assert.equal(bitmaps[0].closed, true)
  assert.equal(budget.snapshot().usedBytes, 0)
  pool.dispose()
})
