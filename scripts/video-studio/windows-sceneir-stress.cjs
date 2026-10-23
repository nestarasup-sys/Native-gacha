'use strict'
/**
 * Windows-only, synthetic SEMANTIC SceneIR stress (not a GPU/video-export
 * benchmark). No personal Gacha/media files are loaded; no project is saved.
 *
 * node scripts/video-studio/windows-sceneir-stress.cjs --quick
 * node scripts/video-studio/windows-sceneir-stress.cjs
 */
const assert = require('node:assert/strict')
const { performance } = require('node:perf_hooks')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
if (process.platform !== 'win32') throw new Error('Stress harness supported only on Windows.')

function load(relativePath, dependencies = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8')
  const code = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => {
    if (Object.hasOwn(dependencies, id)) return dependencies[id]
    throw new Error('Unexpected dependency: ' + id)
  }, mod, mod.exports)
  return mod.exports
}
const frame = load('src/shared/videoFrame.ts')
const clock = load('src/shared/videoStudioNext/projectClock.ts')
const characterTimeline = load('src/shared/videoCharacterTimeline.ts')
const characterTransitions = load('src/shared/videoCharacterTransitions.ts')
const snapshots = load('src/shared/videoExportSnapshot.ts', { './videoFrame': frame })
const ir = load('src/shared/videoSceneIR.ts', {
  './videoFrame': frame,
  './videoStudioNext/projectClock': clock,
  './videoCharacterTimeline': characterTimeline,
  './videoCharacterTransitions': characterTransitions,
  './videoExportSnapshot': snapshots
})

function syntheticStudio(actors, keys, duration) {
  const elements = []
  const bases = {}
  for (let i = 0; i < actors; i++) {
    const id = 'actor-' + i
    const element = {
      id, kind: 'character', characterId: 'synthetic-model-' + i,
      poseSlot: 1, text: '', x: 10 + i % 8, y: 20 + i % 7,
      width: 25, height: 30, rotation: 0, zIndex: 1 + i,
    }
    elements.push(element)
    bases[id] = { element, imageDataUrl: 'data:image/png;base64,SYNTHETIC-' + i }
  }
  const characterKeys = []
  for (let index = 0; index < keys; index++) {
    const actor = index % actors, id = 'actor-' + actor
    const when = Math.floor((index + 1) * (duration - 60) / (keys + 1))
    const base = bases[id]
    characterKeys.push({
      id: 'key-' + index, elementId: id, frame: when, poseSlot: index % 2 + 1,
      expressionCollectionId: null, expressionPresetId: null, faceMode: 'idle',
      state: { element: { ...base.element, poseSlot: index % 2 + 1 },
        imageDataUrl: base.imageDataUrl },
    })
  }
  const textClips = []
  for (let index = 0; index < 180; index++) {
    const actor = index % actors, start = Math.floor(index * duration / 181)
    const id = 'bubble-' + index
    elements.push({
      id, kind: 'speech', text: 'Texto sintetico ' + index,
      speakerCharacterId: 'actor-' + actor,
      x: 10, y: 10, width: 20, height: 10, rotation: 0, zIndex: 90,
    })
    textClips.push({
      id: 'speech-' + index, elementId: id, kind: 'speech',
      startFrame: start, endFrame: Math.min(duration, start + 100),
    })
  }
  const videoClips = Array.from({ length: 4 }, (_, i) => ({
    id: 'video-' + i, assetId: 'media-' + i, startFrame: 0, endFrame: duration,
    sourceStartFrame: 0, sourceEndFrame: duration,
  }))
  return {
    schemaVersion: 1, id: 'synthetic-project', title: 'Synthetic stress',
    color: '#777', createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
    backgroundColor: '#fff', backgroundAssetId: null,
    backgroundX: 0, backgroundY: 0, backgroundWidth: 100,
    backgroundHeight: 100, backgroundRotation: 0,
    assets: [], elements,
    videoTimeline: {
      schemaVersion: 1, frameRate: 60, durationFrames: duration,
      playheadFrame: 0, playing: false, animateCharacterTransitions: true,
      characterBases: bases, characterKeys, characterGaps: [], textClips,
      videoClips, saveMarkers: [],
    },
  }
}

function measure(label, actors, keys, duration, samples) {
  const source = syntheticStudio(actors, keys, duration)
  const startRSS = process.memoryUsage().rss
  const compiledAt = performance.now()
  const program = ir.compileVideoScene(snapshots.createVideoExportSnapshot(source), 'animated')
  const compileMs = performance.now() - compiledAt
  const times = []
  let videos = 0, characterSamples = 0, changedFrames = 0, previousKey = ''
  for (let i = 0; i < samples; i++) {
    const projectFrame = Math.floor(i * (duration - 1) / Math.max(1, samples - 1))
    const started = performance.now()
    const scene = ir.evaluateVideoSceneFrame(program, projectFrame)
    times.push(performance.now() - started)
    assert.equal(scene.frame, projectFrame)
    assert.deepEqual({ numerator: scene.timestampNumerator, denominator: scene.timestampDenominator },
      clock.framePresentationTime(projectFrame))
    assert.equal(scene.videos.length, 4)
    videos += scene.videos.length
    characterSamples += scene.characters.length
    if (previousKey && scene.reuseKey !== previousKey) changedFrames++
    previousKey = scene.reuseKey
  }
  times.sort((a, b) => a - b)
  return {
    scenario: label, actors, keys, durationFrames: duration, samples,
    compileMs: +compileMs.toFixed(3),
    p95EvaluationMs: +times[Math.floor((times.length - 1) * 0.95)].toFixed(3),
    maxEvaluationMs: +times[times.length - 1].toFixed(3),
    rssDeltaMiB: +((process.memoryUsage().rss - startRSS) / 1048576).toFixed(2),
    videoFrameRefs: videos, characterFrameRefs: characterSamples, changedFrameKeys: changedFrames,
    caveat: 'Synthetic semantic evaluation only; excludes PNG raster, GPU, decode, FFmpeg and IPC.',
  }
}
const quick = process.argv.includes('--quick')
const duration = quick ? 1800 : 54000
const samples = quick ? 120 : 1500
const profiles = quick ? [[12, 100]] : [[12, 300], [24, 600], [48, 1000]]
for (const [actors, keys] of profiles) {
  console.log(JSON.stringify(measure(quick ? 'quick' : '15min sampled', actors, keys, duration, samples)))
}
