'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const code = ts.transpile(fs.readFileSync(path.resolve(__dirname, '../src/shared/videoStudioNext/resourceBudget.ts'), 'utf8'), {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
})
const mod = { exports: {} }
new Function('module', 'exports', code)(mod, mod.exports)
const { VideoStudioResourceBudget } = mod.exports

test('ledger tracks multiple categories by bytes and rejects over-budget requests', () => {
  const budget = new VideoStudioResourceBudget(100, 80)
  const image = budget.tryReserve('artwork', 60)
  const decoder = budget.tryReserve('video-decoder', 30)
  assert.ok(image && decoder)
  assert.equal(budget.tryReserve('export', 11), null)
  assert.deepEqual([budget.snapshot().usedBytes, budget.snapshot().availableBytes], [90, 10])
  assert.equal(budget.snapshot().pressure, true)
  assert.equal(budget.snapshot().byCategory.artwork, 60)
  decoder.release()
  decoder.release()
  assert.equal(budget.snapshot().usedBytes, 60)
  const frame = budget.tryReserve('ipc', 40)
  assert.ok(frame)
  assert.equal(budget.snapshot().activeLeases, 2)
  frame.release()
  image.release()
  assert.equal(budget.snapshot().usedBytes, 0)
})

test('invalid reservations cannot poison counters; disposal releases all leases', () => {
  for (const config of [[0, 0], [100, 101], [100.1, 80], [100, 0]]) {
    assert.throws(() => new VideoStudioResourceBudget(...config), RangeError)
  }
  const budget = new VideoStudioResourceBudget(100)
  for (const invalid of [0, -1, 1.1, NaN, Infinity]) assert.throws(() => budget.tryReserve('other', invalid), RangeError)
  const first = budget.tryReserve('texture', 99)
  const snap = budget.snapshot()
  budget.dispose()
  assert.equal(budget.snapshot().usedBytes, 0)
  assert.equal(snap.usedBytes, 99, 'old snapshots remain stable')
  first.release()
  assert.equal(budget.tryReserve('other', 1), null)
})

test('separate ledgers do not incorrectly share their counters', () => {
  const a = new VideoStudioResourceBudget(16)
  const b = new VideoStudioResourceBudget(16)
  const x = a.tryReserve('preview', 16)
  assert.equal(a.tryReserve('preview', 1), null)
  assert.ok(b.tryReserve('preview', 1))
  x.release()
  assert.equal(a.snapshot().availableBytes, 16)
  assert.equal(b.snapshot().availableBytes, 15)
})
