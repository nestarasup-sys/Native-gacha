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
  assert.deepEqual(frames, [11, 15, 19, 23, 12, 13, 14, 16, 17, 18, 20, 21, 22, 24])
  await session.prepareAhead(spans, 1, [actor])
  assert.equal(frames.length, 14, 'same boundary is cached')
  await session.prepareAhead(spans, 30, [actor])
  assert.deepEqual(frames.slice(14), [51, 55, 59, 63, 52, 53, 54, 56, 57, 58, 60, 61, 62, 64])
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

const eventually = async (predicate, message) => {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > 2000) throw Error(message)
    await new Promise(resolve => setTimeout(resolve, 1))
  }
}

test('real-time preview requests only demanded absolute frame and does not prewarm 14 images', async () => {
  const frames = []
  const session = new Session('studio', { render: async (_span, frame) => {
    frames.push(frame)
    return state
  }, dispose() {} })
  const ready = []
  session.requestFrame(spans, 18, [actor], (_id, frame) => ready.push(frame))
  await eventually(() => ready.length === 1, 'real-time frame did not finish')
  assert.deepEqual(frames, [18])
  assert.deepEqual(ready, [18])
  session.dispose()
})

test('real-time seeks coalesce stale pending frames instead of queuing 60 per second', async () => {
  const first = deferred()
  const frames = []
  const session = new Session('studio', { render: async (_span, frame) => {
    frames.push(frame)
    if (frames.length === 1) await first.promise
    return state
  }, dispose() {} })
  const ready = []
  session.requestFrame(spans, 17, [actor], (_id, frame) => ready.push(frame))
  await eventually(() => frames.length === 1, 'first frame did not start')
  session.requestFrame(spans, 18, [actor], (_id, frame) => ready.push(frame))
  session.requestFrame(spans, 19, [actor], (_id, frame) => ready.push(frame))
  first.resolve()
  await eventually(() => frames.length === 2 && ready.length === 2, 'coalesced frame did not finish')
  assert.deepEqual(frames, [17, 19])
  assert.equal(session.metrics().rendered, 2)
  session.dispose()
})

test('editing one actor invalidates only that actor; another actor keeps its cache', async () => {
  const second = { id: 'actor-b', updatedAt: 'v1' }
  const fromB = { element: { id: 'element-b', characterId: 'actor-b' }, imageDataUrl: 'data:image/png;base64,B' }
  const a = spans[0]
  const b = { ...a, elementId: 'element-b', from: fromB, to: fromB }
  const changes = []
  const session = new Session('studio', { render: async (span) => {
    changes.push(span.elementId)
    return span.from
  }, dispose() {} })
  const ready = []
  const onReady = id => ready.push(id)
  session.requestFrame([a,b], 18, [actor,second], onReady)
  await eventually(() => ready.length === 2, 'first two actors not ready')
  const before = session.get(b, 18, second)
  const fromA2 = { ...a.from, element: { ...a.from.element, poseSlot: 3 } }
  const revisedA = { ...a, from: fromA2, to: fromA2 }
  session.requestFrame([revisedA,b], 18, [actor,second], onReady)
  await eventually(() => ready.length === 3, 'edited actor not rerendered')
  assert.deepEqual(changes, ['element', 'element-b', 'element'])
  assert.strictEqual(session.get(b, 18, second), before)
  session.dispose()
})

test('last visible frame remains available inside its own transition while the next frame renders', async () => {
  const next = deferred()
  const session = new Session('studio', { render: async (_span, frame) => {
    if (frame === 19) await next.promise
    return { ...state, imageDataUrl: 'frame-' + frame }
  }, dispose() {} })
  session.requestFrame(spans, 18, [actor], () => {})
  await eventually(() => session.metrics().rendered === 1, 'initial raster missing')
  assert.equal(session.get(spans[0], 19, actor, true).imageDataUrl, 'frame-18')
  assert.equal(session.get(spans[0], 19, actor, false), undefined)
  session.requestFrame(spans, 19, [actor], () => {})
  await eventually(() => session.metrics().inFlight > 0, 'second raster not pending')
  assert.equal(session.get(spans[0], 19, actor, true).imageDataUrl, 'frame-18')
  next.resolve()
  await eventually(() => session.metrics().rendered === 2, 'second raster missing')
  assert.equal(session.get(spans[0], 19, actor).imageDataUrl, 'frame-19')
  session.dispose()
})

test('playback shows only exact articulated Gacha renders or the authored origin, never double-exposed images', async () => {
  const sample = { ...state, imageDataUrl: 'gacha-rig-render-frame-11' }
  const renderer = { render: async (_span, frame) => ({ ...sample, imageDataUrl: 'gacha-rig-render-frame-' + frame }), dispose() {} }
  const session = new Session('studio', renderer)
  const origin = session.getBestAvailable(spans[0], 15, actor)
  assert.strictEqual(origin, spans[0].from)
  await session.prepareAtFrame(spans, 11, [actor])
  assert.equal(session.getBestAvailable(spans[0], 13, actor).imageDataUrl, 'gacha-rig-render-frame-11')
  await session.prepareAtFrame(spans, 13, [actor])
  assert.equal(session.getBestAvailable(spans[0], 13, actor).imageDataUrl, 'gacha-rig-render-frame-13')
  session.dispose()
})

test('Gacha transition prefetch yields between real rig renders rather than holding all 14 synchronous frames', async () => {
  const frames = []
  const session = new Session('studio', { render: async (_span, frame) => {
    frames.push(frame)
    return state
  }, dispose() {} })
  await session.prepareAhead(spans, 0, [actor])
  assert.equal(frames.length, 14)
  assert.deepEqual(frames.slice(0, 4), [11,15,19,23])
  session.dispose()
})

test('after seek, stale actor identity cannot reject real Gacha frames from the next boundary', async () => {
  const frames = []
  const renderer = { render: async (span, frame) => {
    frames.push({ boundary: span.boundaryFrame, frame })
    return { ...span.from, imageDataUrl: 'exact-' + span.boundaryFrame + '-' + frame }
  }, dispose() {} }
  const session = new Session('studio', renderer)
  const ready = []
  session.requestFrame(spans, 18, [actor], (_id, frame) => ready.push(frame))
  await eventually(() => ready.includes(18), 'paused first frame missing')
  session.cancelPending()
  await session.prepareAhead(spans, 30, [actor])
  const renderedNext = session.get(spans[1], 51, actor)
  assert.equal(renderedNext?.imageDataUrl, 'exact-65-51')
  assert.ok(frames.some(x => x.boundary === 65))
  session.dispose()
})
