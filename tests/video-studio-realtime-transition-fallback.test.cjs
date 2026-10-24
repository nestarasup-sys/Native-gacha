'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, deps = {}) {
  const source = fs.readFileSync(path.join(__dirname, file), 'utf8')
  const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'exports', 'module', js)((name) => {
    if (Object.hasOwn(deps, name)) return deps[name]
    throw Error('Unexpected import ' + name)
  }, mod.exports, mod)
  return mod.exports
}

const mixStageElement = (a, b, t) => ({
  ...a, x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t,
  width: a.width + (b.width-a.width)*t, height: a.height + (b.height-a.height)*t,
  rotation: a.rotation + (b.rotation-a.rotation)*t,
})
const smoothProgress = t => t*t*(3-2*t)
const transitionProgress = (span, frame) => (frame-span.startFrame)/(span.boundaryFrame-span.startFrame)
const { evaluateRealtimeTransitionFallback: render } = load(
  '../src/renderer/src/features/videoStudio/realtimeTransitionFallback.ts',
  { '../../../../shared/videoCharacterInterpolation': { mixStageElement, smoothProgress, transitionProgress } },
)
const left = {element: { id:'char1', x:0, y:0, width:80, height:140, rotation:0 }, imageDataUrl:'left.png'}
const right = {element: { id:'char1', x:200, y:40, width:110, height:180, rotation:90 }, imageDataUrl:'right.png'}
const span = { elementId:'char1', startFrame:10, boundaryFrame:25, from:left, to:right }

test('transition fallback gives visible movement every intermediate frame including the first and last', () => {
  assert.equal(render(span, 10), null)
  assert.equal(render(span, 25), null)
  const frames = Array.from({length:14}, (_,i)=>render(span, 11+i))
  assert.ok(frames.every(Boolean))
  assert.ok(frames.every(x=>x.fromImageDataUrl==='left.png' && x.toImageDataUrl==='right.png'))
  assert.ok(frames.every((x,i)=>i===0 || x.progress>frames[i-1].progress))
  assert.ok(frames[0].progress>0)
  assert.ok(frames[13].progress<1)
  assert.ok(frames[13].element.x>frames[0].element.x)
  assert.equal(render(span, 17.5).progress, .5)
  assert.equal(render(span, 17.5).element.x, 100)
})

test('realtime fallback retains authored endpoint variants and never writes raster', () => {
  const frame = render(span, 20)
  assert.equal(frame.fromImageDataUrl, 'left.png')
  assert.equal(frame.toImageDataUrl, 'right.png')
  assert.notStrictEqual(frame.element, left.element)
  assert.notStrictEqual(frame.element, right.element)
  assert.deepEqual(left.element, { id:'char1', x:0, y:0, width:80, height:140, rotation:0 })
  assert.deepEqual(right.element, { id:'char1', x:200, y:40, width:110, height:180, rotation:90 })
})

test('playback is not gated on preparing expensive transition rasters', () => {
  const editor = fs.readFileSync(path.join(__dirname, '../src/renderer/src/features/videoStudio/VideoStudioEditor.tsx'), 'utf8')
  const hook = fs.readFileSync(path.join(__dirname, '../src/renderer/src/features/videoStudio/useCharacterTransitions.ts'), 'utf8')
  assert.doesNotMatch(editor, /await characterAnimation\.preparePlayback/)
  assert.match(editor, /transitionFallback=\{transitionFallback\}/)
  assert.match(hook, /if \(!studio \|\| !enabled \|\| playing\) return/)
  assert.match(hook, /evaluateRealtimeTransitionFallback/)
})

test('fallback layers are composited with alpha not by swapping to an unrelated state', () => {
  const dom = fs.readFileSync(path.join(__dirname, '../src/renderer/src/features/videoStudio/VideoStudioDomElement.tsx'), 'utf8')
  assert.match(dom, /1 - transitionFallback\.progress/)
  assert.match(dom, /opacity: transitionFallback\.progress/)
  assert.match(dom, /transitionFallback\.fromImageDataUrl/)
  assert.match(dom, /transitionFallback\.toImageDataUrl/)
})
