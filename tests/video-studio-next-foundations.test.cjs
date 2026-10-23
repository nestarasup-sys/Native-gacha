'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(relativePath, deps = {}) {
  const content = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')
  const compiled = ts.transpile(content, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((id) => {
    if (Object.hasOwn(deps, id)) return deps[id]
    throw new Error('Unexpected test dependency: ' + id)
  }, mod, mod.exports)
  return mod.exports
}
const clock = load('../src/shared/videoStudioNext/projectClock.ts')
const diagnostic = load('../src/shared/videoStudioNext/diagnostics.ts')
const historical = load('../src/renderer/src/features/videoStudio/editHistory.ts')
const { VideoStudioCommandHistory, equalVideoStudioHistoryValue } = load('../src/shared/videoStudioNext/commandHistory.ts')
const budgetModule = load('../src/shared/videoStudioNext/resourceBudget.ts')
const { VideoStudioBoundedMemo } = load('../src/shared/videoStudioNext/boundedMemo.ts')

test('one project clock is deterministic, respects half-open frames and never accumulates floats', () => {
  assert.equal(clock.frameFromElapsed(10, 0, 60), 10)
  assert.equal(clock.frameFromElapsed(10, 16, 60), 10)
  assert.equal(clock.frameFromElapsed(10, 17, 60), 11)
  assert.equal(clock.frameFromElapsed(0, 1000, 6000), 60)
  assert.equal(clock.frameFromElapsed(10, -100, 60), 10)
  assert.equal(clock.frameFromElapsed(10, 99999, 60), 60)
  assert.deepEqual(clock.framePresentationTime(3599), { numerator: 3599, denominator: 60 })
  for (const invalid of [-1, NaN, Infinity, 1.5]) {
    assert.throws(() => clock.framePresentationTime(invalid), RangeError)
  }
})

test('Windows on-demand process report labels KiB correctly and never fabricates VRAM/FFmpeg', () => {
  const host = {
    sampledAt: '2026-10-23T15:00:00.000Z', platform: 'win32',
    mainPid: 9, totalRamBytes: 10000, freeRamBytes: 2000, mainRssBytes: 8000,
  }
  const report = diagnostic.videoStudioMemoryReport([
    { pid: 9, type: 'Browser', memory: { workingSetSize: 1024, privateBytes: 500, peakWorkingSetSize: 1100 } },
    { pid: 10, type: 'GPU', memory: { workingSetSize: 2048, privateBytes: 1500 } },
    { pid: -1, type: 'unknown', memory: { workingSetSize: 1e10 } },
  ], host)
  assert.equal(report.reportedWorkingSetKiB, 3072)
  assert.equal(report.reportedPrivateBytesKiB, 2000)
  assert.equal(report.electronProcesses.length, 2)
  assert.equal(report.gpuDedicatedBytes, null)
  assert.deepEqual(report.recentProcessFailures, [])
  assert.equal(report.ffmpegAndOtherChildrenIncluded, false)
  assert.equal(report.totalRamBytes, 10000)
  assert.equal(report.electronProcesses[1].type, 'GPU')
})

test('new standalone history matches existing checkpoint/undo/redo semantics and retains media refs', () => {
  const initial = { id: 'scene', imageDataUrl: 'data:image/png;base64,LARGE', frame: 0 }
  const after = { ...initial, frame: 10 }
  const later = { ...initial, frame: 20 }
  const old = new historical.EditHistory(historical.equalHistoryValue, 1000)
  const next = new VideoStudioCommandHistory(equalVideoStudioHistoryValue, 1000)
  for (const history of [old, next]) {
    history.begin('studio', initial)
    assert.equal(history.observe('studio', after), true)
    history.begin('studio', after)
    assert.equal(history.observe('studio', later), true)
  }
  for (const h of [old, next]) {
    assert.equal(h.undo('studio', later), after)
    assert.equal(h.undo('studio', after), initial)
    assert.equal(h.redo('studio', initial), after)
    h.reset('new-studio')
    assert.equal(h.undo('studio', later), undefined)
  }
  assert.equal(initial.imageDataUrl, after.imageDataUrl)
  assert.throws(() => new VideoStudioCommandHistory(() => true, 0), RangeError)
})

test('Gacha bounded memo deduplicates async recipes and evicts by retained bytes in shared ledger', async () => {
  const budget = new budgetModule.VideoStudioResourceBudget(128)
  const memo = new VideoStudioBoundedMemo(4, 100, (s) => s.bytes, budget)
  let calls = 0
  const render = () => { calls++; return Promise.resolve({ bytes: 64, dataUrl: 'PNG' }) }
  const a = memo.getOrCreate('normal:eye', render)
  const same = memo.getOrCreate('normal:eye', render)
  assert.equal(a, same)
  await Promise.all([a, same])
  assert.equal(calls, 1)
  assert.equal(budget.snapshot().usedBytes, 64)
  await memo.getOrCreate('pt:left-pupil', render)
  assert.equal(memo.stats().entries, 1, 'evicts large previous artwork by estimated bytes')
  assert.equal(budget.snapshot().usedBytes, 64)
  assert.equal(memo.stats().retainedBytes, 64)
  memo.clear()
  assert.equal(budget.snapshot().usedBytes, 0)
  assert.equal(memo.stats().entries, 0)
})

test('memo fails open for over-budget artwork, ignores stale completion after clear and permits retry', async () => {
  const budget = new budgetModule.VideoStudioResourceBudget(32)
  const memo = new VideoStudioBoundedMemo(3, 200, (x) => x.bytes, budget)
  await memo.getOrCreate('too-big', async () => ({ bytes: 64 }))
  assert.equal(memo.stats().entries, 0, 'result is usable but not cached')
  let complete
  const pending = memo.getOrCreate('late', () => new Promise((resolve) => { complete = resolve }))
  // schedule the factory before resolving it.
  await Promise.resolve()
  memo.clear()
  complete({ bytes: 16 })
  await pending
  assert.equal(budget.snapshot().usedBytes, 0)
  await assert.rejects(memo.getOrCreate('error', async () => { throw new Error('failed raster') }), /failed raster/)
  assert.equal(memo.stats().entries, 0)
  await memo.getOrCreate('retry', async () => ({ bytes: 16 }))
  assert.equal(budget.snapshot().usedBytes, 16)
  memo.clear()
  assert.equal(budget.snapshot().usedBytes, 0)
})
