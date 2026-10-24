'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load() {
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/src/features/videoStudio/previewTransitionSession.ts'), 'utf8')
  const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', js)((name) => {
    if (name === './characterTransitions') return {
      transitionSampleFrames: (span) => Array.from({ length: span.boundaryFrame - span.startFrame - 1 },
        (_, i) => span.startFrame + i + 1),
    }
    if (name === './transitionRenderer') return { TransitionRenderer: class { render() { throw Error('Expected injected renderer') } dispose() {} } }
    throw Error('Unexpected dependency: ' + name)
  }, mod, mod.exports)
  return mod.exports.PreviewTransitionSession
}
const Session = load()
const actor = { id: 'actor', updatedAt: 'v1' }
const state = { element: { id: 'element', characterId: 'actor' }, imageDataUrl: 'data:image/png;base64,SYNTHETIC' }
const spans = [
  { elementId: 'element', startFrame: 10, boundaryFrame: 25, from: state, to: state },
  { elementId: 'element', startFrame: 50, boundaryFrame: 65, from: state, to: state },
]
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

test('paused seek renders just the requested transition sample instead of all 14', async () => {
  const frames = []
  const renderer = { render: async (_span, frame) => { frames.push(frame); return state }, dispose() {} }
  const session = new Session('studio', renderer)
  await session.prepareAtFrame(spans, 18, [actor])
  assert.deepEqual(frames, [18])
  assert.equal(session.get(spans[0], 18, actor), state)
  assert.equal(session.get(spans[0], 17, actor), undefined)
  assert.equal(session.metrics().rendered, 1)
  session.dispose()
})

test('playback prepares next boundary exactly once, keeping all interpolated frames', async () => {
  const frames = []
  const renderer = { render: async (_span, frame) => { frames.push(frame); return state }, dispose() {} }
  const session = new Session('studio', renderer)
  await session.prepareAhead(spans, 0, [actor])
  assert.deepEqual(frames, Array.from({length: 14}, (_, i) => 11 + i))
  await session.prepareAhead(spans, 1, [actor])
  assert.equal(frames.length, 14, 'same boundary is cached')
  await session.prepareAhead(spans, 30, [actor])
  assert.deepEqual(frames.slice(14), Array.from({length: 14}, (_, i) => 51 + i))
  assert.equal(session.metrics().cachedFrames, 28)
  session.dispose()
})

test('cancelling preparation discards old result and prevents queued samples from rendering', async () => {
  const first = deferred()
  const frames = []
  let disposed = 0
  const renderer = {
    render: async (_span, frame, _character, signal) => {
      frames.push(frame)
      if (frames.length === 1) await first.promise
      signal?.throwIfAborted()
      return state
    },
    dispose: () => { disposed++ },
  }
  const session = new Session('studio', renderer)
  const work = session.prepareAhead(spans, 0, [actor])
  for (let i = 0; i < 5 && !frames.length; i++) await Promise.resolve()
  assert.deepEqual(frames, [11])
  session.cancelPending()
  first.resolve()
  await work
  assert.deepEqual(frames, [11])
  assert.equal(session.metrics().cachedFrames, 0)
  await session.prepareAtFrame(spans, 18, [actor])
  assert.deepEqual(frames, [11, 18])
  session.dispose()
  assert.equal(disposed, 1)
})

test('Play at the same frame is not cancelled by the paused preview effect', async () => {
  const first = deferred()
  const frames = []
  const renderer = { render: async (_span, frame) => {
    frames.push(frame)
    if (frames.length === 1) await first.promise
    return state
  }, dispose() {} }
  const session = new Session('studio', renderer)
  const play = session.prepareAhead(spans, 18, [actor])
  await session.prepareAtFrame(spans, 18, [actor])
  first.resolve()
  await play
  assert.equal(frames.length, 14)
  session.dispose()
})

test('dispose rejects delayed samples and frees stored PNG entries', async () => {
  const later = deferred()
  let cleanups = 0
  const renderer = {
    render: async () => { await later.promise; return state },
    dispose: () => { cleanups++ },
  }
  const session = new Session('studio', renderer)
  const work = session.prepareAtFrame(spans, 18, [actor])
  await Promise.resolve()
  session.dispose()
  later.resolve()
  await work
  assert.equal(session.metrics().cachedBytes, 0)
  assert.equal(session.metrics().cachedFrames, 0)
  assert.equal(cleanups, 1)
})

test('cache accounts PNG bytes and never constructs throwaway HTMLImageElement', async () => {
  const before = global.Image
  global.Image = class { constructor() { throw Error('Redundant preview image decode') } }
  try {
    const session = new Session('studio', { render: async () => state, dispose() {} })
    await session.prepareAtFrame(spans, 18, [actor])
    assert.equal(session.metrics().cachedBytes, state.imageDataUrl.length * 2)
    session.dispose()
  } finally { if (before === undefined) delete global.Image; else global.Image = before }
})
