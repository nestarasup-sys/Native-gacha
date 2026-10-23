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

function harness({ width = 4, height = 4, beforeBitmap } = {}) {
  const bitmaps = []
  const videoElements = []
  const document = {
    createElement(name) {
      assert.equal(name, 'video')
      const events = new Map()
      let currentTime = 0
      const video = {
        muted: false, preload: '', playsInline: false, crossOrigin: '', src: '',
        duration: 30, readyState: 3,
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

test('denied second frame closes it, releases first pin, leaves no transient memory', async () => {
  const { Pool, bitmaps } = harness()
  const budget = new VideoStudioResourceBudget(64)
  const pool = new Pool('job', 96, budget)
  await assert.rejects(pool.acquireFramesForScene(scene('a', 'b')), /Orçamento/)
  assert.deepEqual(bitmaps.map((bitmap) => bitmap.closed), [false, true])
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
