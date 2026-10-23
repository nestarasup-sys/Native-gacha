'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(filename) {
  const src = fs.readFileSync(path.resolve(__dirname, filename), 'utf8')
  const compiled = ts.transpile(src, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('module', 'exports', compiled)(mod, mod.exports)
  return mod.exports
}
const { VideoStudioResourceBudget } = load('../src/shared/videoStudioNext/resourceBudget.ts')
const { VideoStudioRasterAdmission } = load('../src/shared/videoStudioNext/rasterAdmission.ts')
const deferred = () => {
  let resolve, reject
  const promise = new Promise((r, j) => { resolve = r; reject = j })
  return { promise, resolve, reject }
}

test('raster requests serialize; estimated bytes are reserved BEFORE a renderer starts', async () => {
  const budget = new VideoStudioResourceBudget(128)
  const gate = new VideoStudioRasterAdmission(budget, 64, 1)
  const endFirst = deferred()
  let started = 0
  const first = gate.run(async () => {
    started++
    assert.equal(budget.snapshot().byCategory['render-work'], 64)
    await endFirst.promise
    return 'first'
  })
  const second = gate.run(async () => {
    started++
    assert.equal(budget.snapshot().byCategory['render-work'], 64)
    return 'second'
  })
  await assert.rejects(gate.run(async () => 'never'), /saturada/)
  await Promise.resolve()
  assert.equal(started, 1)
  assert.deepEqual(gate.status(), { active: true, waiting: 1, disposed: false })
  endFirst.resolve()
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second'])
  assert.equal(started, 2)
  assert.equal(budget.snapshot().usedBytes, 0)
  gate.dispose()
})

test('a pressure callback evicts derived art before admission but never changes project source', async () => {
  const budget = new VideoStudioResourceBudget(128)
  const oldCache = budget.tryReserve('artwork', 96)
  let pressureEvents = 0
  const gate = new VideoStudioRasterAdmission(budget, 64, 2, () => {
    pressureEvents++
    oldCache.release()
  })
  await gate.run(async () => {
    assert.equal(budget.snapshot().usedBytes, 64)
    return true
  })
  assert.equal(pressureEvents, 1)
  assert.equal(budget.snapshot().usedBytes, 0)
  gate.dispose()
})

test('out-of-budget denial happens before expensive raster function runs', async () => {
  const budget = new VideoStudioResourceBudget(32)
  const gate = new VideoStudioRasterAdmission(budget, 64)
  let invoked = false
  await assert.rejects(gate.run(async () => {
    invoked = true
    return 'wrong'
  }), /Orçamento/)
  assert.equal(invoked, false)
  assert.equal(budget.snapshot().usedBytes, 0)
  gate.dispose()
})

test('renderer rejection cannot leak a reservation and next operation still works', async () => {
  const budget = new VideoStudioResourceBudget(128)
  const gate = new VideoStudioRasterAdmission(budget, 64)
  await assert.rejects(gate.run(async () => { throw new Error('simulated renderer failure') }), /simulated/)
  assert.equal(budget.snapshot().usedBytes, 0)
  assert.equal(await gate.run(async () => 42), 42)
  gate.dispose()
  assert.equal(budget.snapshot().usedBytes, 0)
})

test('disposing rejects queued work without touching the in-flight lease until it finishes', async () => {
  const budget = new VideoStudioResourceBudget(128)
  const gate = new VideoStudioRasterAdmission(budget, 64, 4)
  const pending = deferred()
  let queuedStarted = false
  const running = gate.run(async () => { await pending.promise; return 'done' })
  const queued = gate.run(async () => { queuedStarted = true; return 'wrong' })
  assert.equal(budget.snapshot().usedBytes, 64)
  gate.dispose()
  await assert.rejects(queued, /descartado/)
  assert.equal(budget.snapshot().usedBytes, 64)
  pending.resolve()
  assert.equal(await running, 'done')
  assert.equal(queuedStarted, false)
  assert.equal(budget.snapshot().usedBytes, 0)
  await assert.rejects(gate.run(async () => 1), /descartado/)
})
