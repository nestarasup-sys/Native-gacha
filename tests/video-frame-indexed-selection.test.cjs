'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/shared/videoFrame.ts'), 'utf8')
const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
const moduleInstance = { exports: {} }
new Function('module', 'exports', js)(moduleInstance, moduleInstance.exports)
const { resolveVideoFrameSelection } = moduleInstance.exports

function linear(timeline, frame) {
  const result = { hiddenCharacterIds: new Set(), textClipByElementId: new Map(), videoClips: [] }
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= timeline.durationFrames) return result
  for (const item of timeline.characterGaps ?? []) if (Number.isInteger(item.startFrame) && Number.isInteger(item.endFrame) && item.startFrame <= frame && frame < item.endFrame) result.hiddenCharacterIds.add(item.elementId)
  for (const item of timeline.textClips) if (!result.textClipByElementId.has(item.elementId) && Number.isInteger(item.startFrame) && Number.isInteger(item.endFrame) && item.startFrame <= frame && frame < item.endFrame) result.textClipByElementId.set(item.elementId, item)
  for (const item of timeline.videoClips ?? []) if (Number.isInteger(item.startFrame) && Number.isInteger(item.endFrame) && item.startFrame <= frame && frame < item.endFrame) result.videoClips.push(item)
  return result
}

function timeline(count = 1000) {
  return {
    durationFrames: 36000,
    characterGaps: Array.from({ length: count }, (_, i) => ({ elementId: 'c'+(i % 6), startFrame: (i * 137) % 36000, endFrame: ((i * 137) % 36000) + 28 })),
    textClips: Array.from({ length: count }, (_, i) => ({ elementId: 't'+(i % 7), id: 't'+i, startFrame: (i * 131) % 36000, endFrame: ((i * 131) % 36000) + 140 })),
    videoClips: Array.from({ length: count }, (_, i) => ({ id: 'v'+i, startFrame: (i * 139) % 36000, endFrame: ((i * 139) % 36000) + 165 })),
  }
}

test('indexed frame selection keeps original order and first-wins semantics for overlapping clips', () => {
  const t = timeline(1300)
  t.textClips.unshift({ elementId: 't0', id: 'first', startFrame: 20, endFrame: 500 })
  t.textClips.push({ elementId: 't0', id: 'last', startFrame: 20, endFrame: 500 })
  t.videoClips.unshift({ id: 'video-first', startFrame: 20, endFrame: 500 })
  for (let frame = 0; frame <= 36100; frame += 37) {
    assert.deepEqual(resolveVideoFrameSelection(t, frame), linear(t, frame), `frame ${frame}`)
  }
  assert.equal(resolveVideoFrameSelection(t, 30).textClipByElementId.get('t0')?.id, 'first')
  assert.equal(resolveVideoFrameSelection(t, 30).videoClips[0].id, 'video-first')
})

test('index invalidates when an edited timeline replaces its clip array', () => {
  const t = timeline(10)
  resolveVideoFrameSelection(t, 100)
  t.textClips = [{ elementId: 'speech-new', id: 'new', startFrame: 99, endFrame: 108 }]
  const current = resolveVideoFrameSelection(t, 100)
  assert.equal(current.textClipByElementId.get('speech-new')?.id, 'new')
})

test('timeline preset label identity is stable while playhead advances', () => {
  const editor = fs.readFileSync(path.join(__dirname, '../src/renderer/src/features/videoStudio/VideoStudioEditor.tsx'), 'utf8')
  assert.match(editor, /const videoPresetNames = useMemo\(/)
  assert.match(editor, /\[studioExpressionPresets\]/)
  assert.match(editor, /presetNames=\{videoPresetNames\}/)
})
