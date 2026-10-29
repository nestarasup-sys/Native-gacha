import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createBoundedImageCache } from '../src/renderer/src/ui/image/boundedImageCache.ts'
import {
  applyFrameState,
  moveFramePart,
  rotateFramePart,
  serializeAnimation,
  serializeAnimatorDraft,
  transformsFromProject
} from '../src/renderer/src/features/fabricator/models/animatorFrameModel.ts'
import { renderAnimatorThumbnail } from '../src/renderer/src/features/fabricator/models/animatorThumbnail.ts'

const require = createRequire(import.meta.url)
const typescript = require('typescript')
const previousTypeScriptLoader = require.extensions['.ts']
require.extensions['.ts'] = (module, filename) => {
  const source = readFileSync(filename, 'utf8')
  const compiled = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 }
  }).outputText
  module._compile(compiled, filename)
}
const { breathingVariations, createBreathingAnimation } = require('../src/renderer/src/features/fabricator/models/animatorBreathingModel.ts')
if (previousTypeScriptLoader) require.extensions['.ts'] = previousTypeScriptLoader
else delete require.extensions['.ts']

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function createProject() {
  const parts = [
    { id: 'root', name: 'Tronco', x: 0, y: 0, width: 10, height: 10, rotation: 0, jointAnchor: { x: 10, y: 5 }, dataUrl: 'data:root' },
    { id: 'child', name: 'Braço', x: 10, y: 0, width: 10, height: 10, rotation: 0, jointAnchor: { x: 10, y: 5 }, dataUrl: 'data:child' },
    { id: 'grandchild', name: 'Antebraço', x: 20, y: 0, width: 10, height: 10, rotation: 0, jointAnchor: { x: 20, y: 5 }, dataUrl: 'data:grandchild' },
    { id: 'unfixed', name: 'Acessório', x: 50, y: 0, width: 10, height: 10, rotation: 0, dataUrl: 'data:unfixed' }
  ]
  const joints = [
    { id: 'root-child', parentPartId: 'root', childPartId: 'child', parentAnchor: { x: 10, y: 5 }, childAnchor: { x: 10, y: 5 }, pivot: { x: 10, y: 5 }, fixed: true },
    { id: 'child-grandchild', parentPartId: 'child', childPartId: 'grandchild', parentAnchor: { x: 10, y: 5 }, childAnchor: { x: 20, y: 5 }, pivot: { x: 15, y: 5 }, fixed: true },
    { id: 'root-unfixed', parentPartId: 'root', childPartId: 'unfixed', parentAnchor: { x: 10, y: 5 }, childAnchor: { x: 50, y: 5 }, pivot: { x: 30, y: 5 }, fixed: false }
  ]
  return {
    schemaVersion: 1, slot: 1, name: 'Modelo', sourceName: 'Modelo', sourceAssetName: '', sourceDataUrl: '',
    width: 100, height: 100, tolerance: 0, parts, joints, layerOrder: parts.map((part) => part.id), hiddenPartIds: [], updatedAt: '2026-10-29T00:00:00.000Z'
  }
}

function createFrameState(project) {
  return { animation: null, transforms: transformsFromProject(project), joints: structuredClone(project.joints), frameId: 'frame-1' }
}

function createBreathingSourceAndPose() {
  const parts = [
    { id: 'torso', name: 'Tronco', x: 40, y: 30, width: 20, height: 30, rotation: 0, jointAnchor: { x: 50, y: 60 }, dataUrl: 'torso' },
    { id: 'head', name: 'Cabeça', x: 42, y: 5, width: 16, height: 20, rotation: 0, jointAnchor: { x: 50, y: 25 }, dataUrl: 'head' },
    { id: 'arm', name: 'Braço esquerdo', x: 20, y: 32, width: 8, height: 25, rotation: 0, jointAnchor: { x: 24, y: 57 }, dataUrl: 'arm' },
    { id: 'thigh', name: 'Coxa esquerda', x: 43, y: 60, width: 14, height: 24, rotation: 0, jointAnchor: { x: 50, y: 60 }, dataUrl: 'thigh' },
    { id: 'shin', name: 'Canela esquerda', x: 44, y: 84, width: 12, height: 26, rotation: 0, jointAnchor: { x: 50, y: 84 }, dataUrl: 'shin' },
    { id: 'foot', name: 'Pé esquerdo', x: 43, y: 110, width: 14, height: 8, rotation: 0, jointAnchor: { x: 50, y: 110 }, dataUrl: 'foot' }
  ]
  const joints = [
    { id: 'torso-head', parentPartId: 'torso', childPartId: 'head', parentAnchor: { x: 50, y: 30 }, childAnchor: { x: 50, y: 25 }, fixed: true },
    { id: 'torso-arm', parentPartId: 'torso', childPartId: 'arm', parentAnchor: { x: 42, y: 35 }, childAnchor: { x: 24, y: 40 }, fixed: true },
    { id: 'torso-thigh', parentPartId: 'torso', childPartId: 'thigh', parentAnchor: { x: 50, y: 60 }, childAnchor: { x: 50, y: 60 }, fixed: true },
    { id: 'thigh-shin', parentPartId: 'thigh', childPartId: 'shin', parentAnchor: { x: 50, y: 84 }, childAnchor: { x: 50, y: 84 }, fixed: true },
    { id: 'shin-foot', parentPartId: 'shin', childPartId: 'foot', parentAnchor: { x: 50, y: 110 }, childAnchor: { x: 50, y: 110 }, fixed: true }
  ].map((joint) => ({ ...joint, pivot: { x: (joint.parentAnchor.x + joint.childAnchor.x) / 2, y: (joint.parentAnchor.y + joint.childAnchor.y) / 2 } }))
  const source = {
    schemaVersion: 1, slot: 2, name: 'Modelo teste', sourceName: 'Modelo teste', sourceAssetName: '', sourceDataUrl: '',
    width: 120, height: 160, tolerance: 0, parts, joints, layerOrder: parts.map((part) => part.id), hiddenPartIds: [], updatedAt: 'model-updated'
  }
  const pose = {
    schemaVersion: 1, slot: 4, name: 'Parada', category: 'Parado', sourceModelSlot: 2,
    sourceModelName: 'Modelo teste', sourceModelUpdatedAt: 'model-updated', width: 120, height: 160,
    parts: structuredClone(parts), joints: structuredClone(joints), layerOrder: parts.map((part) => part.id), hiddenPartIds: [], updatedAt: 'pose-updated'
  }
  return { source, pose }
}

test('bounded image cache deduplicates in-flight loads and applies LRU eviction', async () => {
  const calls = []
  const cache = createBoundedImageCache({ load: async (source) => { calls.push(source); return { source } }, estimateValueBytes: () => 10, maxEntries: 2, maxBytes: 1000 })
  const gate = deferred()
  const sharedCache = createBoundedImageCache({ load: (source) => { calls.push(`shared:${source}`); return gate.promise }, estimateValueBytes: () => 10, maxEntries: 2, maxBytes: 1000 })

  const firstRequest = sharedCache.load('same')
  const duplicateRequest = sharedCache.load('same')
  assert.equal(firstRequest, duplicateRequest)
  await Promise.resolve()
  assert.deepEqual(calls, ['shared:same'])
  gate.resolve({ source: 'same' })
  await firstRequest
  assert.equal((await sharedCache.load('same')).source, 'same')
  assert.equal(sharedCache.getStats().entries, 1)

  await cache.load('a')
  await cache.load('b')
  await cache.load('a') // Marks a as recently used.
  await cache.load('c')
  assert.equal(cache.getStats().entries, 2)
  await cache.load('b')
  assert.equal(calls.filter((source) => source === 'b').length, 2)
  assert.equal(cache.getStats().retainedBytes <= cache.getStats().maxBytes, true)
})

test('bounded image cache skips oversized entries and allows failed sources to retry', async () => {
  let attempts = 0
  const cache = createBoundedImageCache({
    load: async (source) => {
      if (source === 'retry' && attempts++ === 0) throw new Error('decode failed')
      return { source }
    },
    estimateValueBytes: (value) => value.source === 'large' ? 99 : 10,
    maxEntries: 4,
    maxBytes: 100
  })

  await assert.rejects(cache.load('retry'), /decode failed/)
  assert.equal(cache.getStats().inFlight, 0)
  await cache.load('retry')
  assert.equal(cache.getStats().entries, 1)
  await cache.load('large') // 5 UTF-16 characters + 99 estimated bytes exceeds the cap.
  assert.equal(cache.getStats().entries, 1)
})

test('clearing cache prevents an older in-flight image from repopulating it', async () => {
  const oldLoad = deferred()
  const loads = []
  const cache = createBoundedImageCache({
    load: (source) => {
      loads.push(source)
      return loads.length === 1 ? oldLoad.promise : Promise.resolve({ source, generation: 'new' })
    },
    estimateValueBytes: () => 1,
    maxEntries: 2,
    maxBytes: 100
  })

  const oldRequest = cache.load('same')
  await Promise.resolve()
  cache.clear()
  const newRequest = cache.load('same')
  assert.equal((await newRequest).generation, 'new')
  oldLoad.resolve({ source: 'same', generation: 'old' })
  await oldRequest
  assert.equal(cache.getStats().entries, 1)
  assert.equal((await cache.load('same')).generation, 'new')
})

test('fixed descendants move with a parent while non-fixed links stay independent', () => {
  const project = createProject()
  const original = structuredClone(project)
  const next = moveFramePart(project, createFrameState(project), 'root', 3, -2, true)
  const moved = applyFrameState(project, next.transforms, next.joints)

  assert.deepEqual(project, original, 'the source model is immutable')
  assert.deepEqual([moved.parts.find((part) => part.id === 'root').x, moved.parts.find((part) => part.id === 'root').y], [3, -2])
  assert.deepEqual([moved.parts.find((part) => part.id === 'child').x, moved.parts.find((part) => part.id === 'child').y], [13, -2])
  assert.deepEqual([moved.parts.find((part) => part.id === 'grandchild').x, moved.parts.find((part) => part.id === 'grandchild').y], [23, -2])
  assert.equal(moved.parts.find((part) => part.id === 'unfixed').x, 50)
  assert.deepEqual(next.joints[0].pivot, { x: 13, y: 3 })
  assert.deepEqual(next.joints[2].pivot, { x: 31.5, y: 4 })

  const selectedOnly = moveFramePart(project, createFrameState(project), 'root', 3, -2, false)
  assert.equal(selectedOnly.transforms.child.x, 10)
  assert.equal(selectedOnly.transforms.grandchild.x, 20)
})

test('fixed descendants rotate around the joint and recompute pivots without mutating source', () => {
  const project = createProject()
  const original = structuredClone(project)
  const next = rotateFramePart(project, createFrameState(project), 'root', 90, true)

  assert.deepEqual(project, original, 'the source model is immutable')
  assert.ok(Math.abs(next.transforms.child.x - 5) < 1e-9)
  assert.ok(Math.abs(next.transforms.child.y - 5) < 1e-9)
  assert.ok(Math.abs(next.transforms.grandchild.x - 5) < 1e-9)
  assert.ok(Math.abs(next.transforms.grandchild.y - 15) < 1e-9)
  assert.equal(next.transforms.unfixed.x, 50)
  assert.deepEqual(next.joints[0].pivot, { x: 10, y: 5 })
  assert.deepEqual(next.joints[1].pivot, { x: 10, y: 10 })

  const selectedOnly = rotateFramePart(project, createFrameState(project), 'root', 90, false)
  assert.equal(selectedOnly.transforms.child.x, 10)
  assert.equal(selectedOnly.transforms.grandchild.x, 20)
})

test('breathing generation keeps fixed lower-body parts and their joint anchors coherent', async () => {
  const { source, pose } = createBreathingSourceAndPose()
  const originalSource = structuredClone(source)
  const originalPose = structuredClone(pose)
  const thumbnailCalls = []
  const animation = await createBreathingAnimation(source, pose, 7, 'character-1', breathingVariations[0], async (project, transforms) => {
    thumbnailCalls.push({ project, transforms })
    return `thumbnail-${thumbnailCalls.length}`
  })
  const [base, inhale, inhaleHold, returnToBase] = animation.frames

  assert.equal(animation.name, 'Respiração · Parado · Suave')
  assert.equal(animation.slot, 7)
  assert.equal(animation.characterId, 'character-1')
  assert.equal(animation.loopMode, 'loop')
  assert.equal(animation.frames.reduce((total, frame) => total + frame.durationMs, 0), breathingVariations[0].cycleMs)
  assert.notEqual(inhale.transforms.torso.height, base.transforms.torso.height)
  assert.notEqual(inhale.transforms.arm.y, base.transforms.arm.y)
  assert.deepEqual(inhale.transforms.thigh, base.transforms.thigh)
  assert.deepEqual(inhale.transforms.shin, base.transforms.shin)
  assert.deepEqual(inhale.transforms.foot, base.transforms.foot)
  assert.deepEqual(inhale.joints.find((joint) => joint.id === 'thigh-shin'), base.joints.find((joint) => joint.id === 'thigh-shin'))
  assert.deepEqual(inhale.joints.find((joint) => joint.id === 'shin-foot'), base.joints.find((joint) => joint.id === 'shin-foot'))

  const baseHipJoint = base.joints.find((joint) => joint.id === 'torso-thigh')
  const inhaleHipJoint = inhale.joints.find((joint) => joint.id === 'torso-thigh')
  assert.deepEqual(inhaleHipJoint.childAnchor, baseHipJoint.childAnchor, 'the thigh side of the hip joint remains attached to the pinned thigh')
  assert.deepEqual(inhaleHipJoint.pivot, {
    x: (inhaleHipJoint.parentAnchor.x + inhaleHipJoint.childAnchor.x) / 2,
    y: (inhaleHipJoint.parentAnchor.y + inhaleHipJoint.childAnchor.y) / 2
  })
  assert.deepEqual(inhaleHold.transforms, inhale.transforms)
  assert.deepEqual(returnToBase.transforms, base.transforms)
  assert.equal(thumbnailCalls.length, 4)
  assert.deepEqual(source, originalSource)
  assert.deepEqual(pose, originalPose)
})

test('breathing generation reports a missing torso before rendering frame assets', async () => {
  const { source, pose } = createBreathingSourceAndPose()
  pose.parts = pose.parts.filter((part) => part.id !== 'torso')
  let rendered = false

  await assert.rejects(
    createBreathingAnimation(source, pose, 1, null, breathingVariations[0], async () => { rendered = true; return '' }),
    /não possui uma peça de tronco identificável/
  )
  assert.equal(rendered, false)
})

test('thumbnail renderer preserves layer order and restores canvas state after a bad asset', async () => {
  const previousDocument = globalThis.document
  const events = []
  let saves = 0
  let restores = 0
  const context = {
    save() { saves += 1 },
    restore() { restores += 1 },
    translate(...values) { events.push(['translate', ...values]) },
    rotate(value) { events.push(['rotate', value]) },
    drawImage(image, ...values) {
      events.push(['draw', image.source, ...values])
      if (image.source === 'bad') throw new Error('invalid image')
    }
  }
  const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: (type) => `canvas:${type}` }
  globalThis.document = { createElement: () => canvas }
  const project = {
    width: 100,
    height: 100,
    parts: [
      { id: 'front', name: 'Frente', x: 0, y: 0, width: 10, height: 10, rotation: 0, dataUrl: 'front' },
      { id: 'hidden', name: 'Oculta', x: 0, y: 0, width: 10, height: 10, rotation: 0, dataUrl: 'hidden' },
      { id: 'back', name: 'Fundo', x: 0, y: 0, width: 10, height: 10, rotation: 0, dataUrl: 'back' },
      { id: 'bad', name: 'Asset inválido', x: 0, y: 0, width: 10, height: 10, rotation: 0, dataUrl: 'bad' }
    ],
    layerOrder: ['back', 'front', 'hidden', 'bad'],
    hiddenPartIds: ['hidden']
  }

  try {
    const result = await renderAnimatorThumbnail(project, { front: { x: 2, y: 3, width: 20, height: 10, rotation: 45 } }, async (source) => ({ source }))
    assert.equal(result, 'canvas:image/png')
    assert.deepEqual(events.filter(([kind]) => kind === 'draw').map(([, source]) => source), ['back', 'front', 'bad'])
    assert.equal(events.some((event) => event.includes('hidden')), false)
    const frontDrawIndex = events.findIndex(([kind, source]) => kind === 'draw' && source === 'front')
    assert.ok(Math.abs(events[frontDrawIndex - 2][1] - 14.4) < 1e-9)
    assert.ok(Math.abs(events[frontDrawIndex - 2][2] - 9.6) < 1e-9)
    assert.equal(saves, 3)
    assert.equal(restores, saves)
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})

test('animation serializers keep the persisted contract and omit source image data per part', () => {
  const animation = {
    schemaVersion: 1, slot: 3, name: 'Teste', sourceModelSlot: 1, sourceModelName: 'Modelo', sourceModelUpdatedAt: 'atualizado', sourceModelPartCount: 1,
    basePoseSlot: null, characterId: null, width: 10, height: 10,
    parts: [{ id: 'head', name: 'Cabeça', x: 0, y: 0, width: 10, height: 10, rotation: 0, dataUrl: 'data:image/png;base64,part' }],
    joints: [], layerOrder: ['head'], hiddenPartIds: [], frames: [], interpolation: 'stepped', loopMode: 'loop', speed: 1,
    thumbnailDataUrl: 'data:image/png;base64,thumbnail', updatedAt: 'now'
  }
  const serialized = serializeAnimation(animation)
  assert.equal(serialized.slot, 3)
  assert.equal('dataUrl' in serialized.parts[0], false)
  assert.equal(animation.parts[0].dataUrl, 'data:image/png;base64,part')

  const current = { animation, transforms: { head: { x: 1, y: 2, rotation: 3 } }, joints: [], frameId: 'frame-1' }
  const draft = serializeAnimatorDraft(animation, 3, current, true)
  assert.equal(draft.editingSlot, 3)
  assert.equal(draft.animation.slot, undefined)
  assert.equal('dataUrl' in draft.animation.parts[0], false)
  assert.equal(draft.selectedFrameId, 'frame-1')
  assert.equal(draft.dirtyFrame, true)
})

test('AnimatorWorkspace delegates frame geometry and keeps draft flush registration in the page', async () => {
  const page = await readFile('src/renderer/src/features/fabricator/AnimatorWorkspace.tsx', 'utf8')
  assert.match(page, /from '\.\/models\/animatorFrameModel'/)
  assert.match(page, /from '\.\/models\/animatorImageCache'/)
  assert.match(page, /from '\.\/models\/animatorThumbnail'/)
  assert.doesNotMatch(page, /new Map<string, Promise<HTMLImageElement>>/)
  assert.doesNotMatch(page, /function rotateFramePart\(/)
  assert.match(page, /registerPendingWriteFlusher\(\(\) => draftFlushRef\.current\(\)\)/)
})
