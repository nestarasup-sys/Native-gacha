'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, deps = {}) {
  const code = ts.transpile(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)((name) => {
    if (Object.hasOwn(deps, name)) return deps[name]
    throw new Error('Unexpected runtime dependency: ' + name)
  }, mod, mod.exports)
  return mod.exports
}
const editing = load('../src/shared/videoTimelineEditing.ts')
const { applyVideoStudioEditorCommand: apply } = load('../src/shared/videoStudioNext/editorCore.ts', {
  '../videoTimelineEditing': editing
})
const baseTimeline = () => ({
  schemaVersion: 1, frameRate: 60, durationFrames: 600, playheadFrame: 20, playing: false,
  characterKeys: [], textClips: [], saveMarkers: [], videoClips: [],
})
const fixture = (timeline = baseTimeline()) => ({
  schemaVersion: 1, id: 'synthetic', title: 'Gacha', updatedAt: 'old',
  elements: [{ id: 'actor', kind: 'character' }, { id: 'text', kind: 'speech' }],
  assets: [{ id: 'art', dataUrl: 'data:image/png;base64,HEAVY' }],
  videoTimeline: timeline,
})
const stamp = '2026-10-23T14:00:00.000Z'

test('EditorCore resizes speech exactly as the legacy domain algorithm without copying media', () => {
  const timeline = { ...baseTimeline(), textClips: [
    { id: 'a', elementId: 'text', kind: 'speech', startFrame: 0, endFrame: 120 },
    { id: 'b', elementId: 'text2', kind: 'speech', startFrame: 120, endFrame: 240 },
  ] }
  const studio = fixture(timeline)
  const command = { type: 'resize-block', target: { kind: 'text', clipId: 'a' }, startFrame: 0, endFrame: 180 }
  const actual = apply(studio, timeline, command, stamp)
  const legacy = editing.resizeTimelineBlock(timeline, command.target, 0, 180, ['actor'])
  assert.deepEqual(actual.videoTimeline, legacy)
  assert.equal(actual.assets, studio.assets)
  assert.equal(actual.elements, studio.elements)
  assert.equal(actual.videoTimeline.textClips[0].endFrame, 180)
  assert.equal(timeline.textClips[0].endFrame, 120)
  assert.equal(actual.updatedAt, stamp)
})

test('EditorCore preserves identity for rejected locked lane and malformed values', () => {
  const timeline = { ...baseTimeline(), trackSettings: { speech: { locked: true } }, textClips: [
    { id: 'a', elementId: 'text', kind: 'speech', startFrame: 0, endFrame: 120 },
  ] }
  const studio = fixture(timeline)
  assert.equal(apply(studio, timeline, { type: 'resize-block', target: { kind: 'text', clipId: 'a' }, startFrame: 0, endFrame: 200 }, stamp), studio)
  assert.equal(apply(studio, timeline, { type: 'set-duration', durationFrames: NaN, playheadFrame: 1 }, stamp), studio)
  assert.equal(apply(studio, timeline, { type: 'set-view', zoom: -1 }, stamp), studio)
})

test('EditorCore commands keep unrelated data and the original v1 document unchanged', () => {
  const original = fixture()
  const withView = apply(original, original.videoTimeline, { type: 'set-view', zoom: 2, height: 300 }, stamp)
  const settings = { locked: true, visible: false }
  const withTrack = apply(withView, withView.videoTimeline, { type: 'set-track-settings', trackId: 'actor', settings }, stamp)
  const transitioned = apply(withTrack, withTrack.videoTimeline, { type: 'set-character-transitions', enabled: false }, stamp)
  assert.equal(original.videoTimeline.timelineZoom, undefined)
  assert.equal(withView.videoTimeline.timelineZoom, 2)
  assert.equal(withView.videoTimeline.timelineHeight, 300)
  assert.deepEqual(withTrack.videoTimeline.trackSettings.actor, settings)
  assert.equal(transitioned.videoTimeline.animateCharacterTransitions, false)
  assert.equal(apply(transitioned, transitioned.videoTimeline, { type: 'set-character-transitions', enabled: false }, stamp), transitioned)
  assert.equal(apply(withTrack, withTrack.videoTimeline, { type: 'set-track-settings', trackId: 'actor', settings }, stamp), withTrack)
})

test('EditorCore duration keeps legacy playhead semantics and media identity', () => {
  const source = fixture()
  const changed = apply(source, source.videoTimeline, { type: 'set-duration', durationFrames: 100, playheadFrame: 200 }, stamp)
  assert.equal(changed.videoTimeline.durationFrames, 100)
  assert.equal(changed.videoTimeline.playheadFrame, 100)
  assert.equal(source.videoTimeline.playheadFrame, 20)
  assert.equal(changed.assets[0], source.assets[0])
  assert.equal(apply(changed, changed.videoTimeline, { type: 'set-duration', durationFrames: 100, playheadFrame: 200 }, stamp), changed)
})
