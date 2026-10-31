import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import { attachEditorV6Motion, editorV6MotionPlans, missingEditorV6Motions, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { prepareExportMotions } from '../../electron/domains/editorV6/prepareMotions'
import { EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES, editorV6MouthLoopScaleAtFrame } from '../../src/shared/editorV6Export'
import { createMotionDiskCache, motionCacheKey } from '../../electron/domains/editorV6/motionCache'
import { createEditorV6MotionService } from '../../electron/domains/editorV6/motionIpc'
import { editorV6IpcChannels } from '../../src/shared/editorV6IpcChannels'
import { createCompletedMotionPreparation, hasCompletedMotionPreparation, indexMotionPreparationCharacters, rememberCompletedMotionPreparation } from '../../src/renderer/src/features/editorV6/motion/motionPreparationModel'

function fixture() {
  const stamp = '2026-10-26T12:00:00.000Z'
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', assetId: crypto.randomUUID(), text: 'Alice', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1, poseSlot: 1 }
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Test', color: '#ffffff', createdAt: stamp, updatedAt: stamp, backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor], assets: [{ id: actor.assetId!, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }], timeline: createEditorV6Timeline([actor]) }
  project.timeline.tracks.find((track) => track.kind === 'character')!.blocks = [1, 2, 1, 2].map((poseSlot, index) => ({ id: crypto.randomUUID(), elementId: actor.id, label: 'Pose', startFrame: index * 60, durationFrames: 60, state: { ...actor, poseSlot } }))
  const character: CustomizerCharacter = { id: 'alice', name: 'Alice', createdAt: stamp, updatedAt: stamp, hair: '#000000', outfit: '#000000', skin: '#000000', customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] } }
  const request: EditorV6MotionBakeRequest = { id: crypto.randomUUID(), plan: editorV6MotionPlans(project)[0], character }
  return { project, character, request }
}
function resultFor(request: EditorV6MotionBakeRequest): EditorV6MotionBakeResult {
  const id = crypto.randomUUID()
  return { asset: { id, category: 'character', mimeType: 'image/png', name: 'Atlas', dataUrl: 'data:image/png;base64,AA==' }, motion: { version: 1, key: request.plan.key, assetId: id, frames: request.plan.samples.map((sample, index) => ({ offset: sample.offset, sprite: { x: index, y: 0, width: 1, height: 1, atlasWidth: 7, atlasHeight: 1 }, x: 0, y: 0, width: 20, height: 30, rotation: 0, flipX: false })) }, metrics: { milliseconds: 1, samples: 7, preparedRigs: 9, atlasPixels: 7 } }
}

describe('transition preparation reuse', () => {
  it('indexes the first character once and shares its full-content fingerprint across plans', () => {
    const { character } = fixture()
    let serializations = 0
    Object.assign(character, { toJSON: () => { serializations++; return { id: character.id, updatedAt: character.updatedAt } } })
    const duplicate = { ...character, name: 'Duplicate' }
    const index = indexMotionPreparationCharacters([character, duplicate])
    const firstPlan = index.get(character.id)!
    const secondPlan = index.get(character.id)!

    expect(firstPlan.character).toBe(character)
    expect(secondPlan).toBe(firstPlan)
    expect(index.get('missing')).toBeUndefined()
    expect(serializations).toBe(1)
  })

  it('reuses only the matching character revision and keeps a bounded FIFO completion map', () => {
    const { character } = fixture()
    const initial = indexMotionPreparationCharacters([character]).get(character.id)!
    const completed = createCompletedMotionPreparation()
    expect(hasCompletedMotionPreparation(completed, 'plan-1', initial)).toBe(false)
    rememberCompletedMotionPreparation(completed, 'plan-1', initial, 2)
    expect(hasCompletedMotionPreparation(completed, 'plan-1', initial)).toBe(true)
    expect(completed.byPlan.get('plan-1')).toEqual([{ characterId: character.id, fingerprint: initial.fingerprint }])

    const changed = indexMotionPreparationCharacters([{ ...character, updatedAt: 'new-revision' }]).get(character.id)!
    expect(hasCompletedMotionPreparation(completed, 'plan-1', changed)).toBe(false)
    rememberCompletedMotionPreparation(completed, 'plan-2', initial, 2)
    rememberCompletedMotionPreparation(completed, 'plan-3', initial, 2)
    expect(completed.byPlan.has('plan-1')).toBe(false)
    expect([...completed.byPlan.keys()]).toEqual(['plan-2', 'plan-3'])
  })

  it('keeps older completed revisions until the FIFO bound evicts them', () => {
    const { character } = fixture()
    const initial = indexMotionPreparationCharacters([character]).get(character.id)!
    const changed = indexMotionPreparationCharacters([{ ...character, updatedAt: 'new-revision' }]).get(character.id)!
    const completed = createCompletedMotionPreparation()
    rememberCompletedMotionPreparation(completed, 'plan-1', initial, 3)
    rememberCompletedMotionPreparation(completed, 'plan-1', changed, 3)

    expect(hasCompletedMotionPreparation(completed, 'plan-1', initial)).toBe(true)
    expect(hasCompletedMotionPreparation(completed, 'plan-1', changed)).toBe(true)
  })

  it('treats a superseded background preparation as a normal cancellation', async () => {
    const { request } = fixture()
    const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: any[]) => any>()
    const service = createEditorV6MotionService({
      ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener) } },
      assertTrustedSender: () => {}, html: 'unused.html', preload: 'unused.cjs'
    })
    const event = {
      sender: { id: 7, isDestroyed: () => false, once: () => {}, removeListener: () => {} },
      senderFrame: {}
    } as unknown as IpcMainInvokeEvent
    const prepare = handlers.get(editorV6IpcChannels.prepareEditorV6Motion)!
    const cancel = handlers.get(editorV6IpcChannels.cancelEditorV6Motion)!
    const pending = prepare(event, request)
    await cancel(event, request.id)
    await expect(pending).resolves.toBeUndefined()
    await service.drain()
  })

  it('bakes identical transitions once, shares the atlas and preserves all blocks', async () => {
    const { project, character } = fixture()
    let calls = 0
    const ready = await prepareExportMotions(project, 0, 300, { signal: new AbortController().signal, characters: [character], bake: async (request) => { calls++; return resultFor(request) }, progress: () => {} })
    expect(calls).toBe(2)
    expect(ready.stats).toMatchObject({ total: 3, unique: 2, reused: 1 })
    expect(missingEditorV6Motions(ready.project)).toHaveLength(0)
    expect(ready.project.assets).toHaveLength(3)
    expect(ready.project.timeline.tracks.find((track) => track.kind === 'character')!.blocks).toHaveLength(4)
  })
  it('prepares distinct transitions with the configured concurrency limit', async () => {
    const { project, character } = fixture()
    let active = 0, peak = 0
    const ready = await prepareExportMotions(project, 0, 300, {
      signal: new AbortController().signal, characters: [character], concurrency: 2,
      bake: async (request) => {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 10))
        active--
        return resultFor(request)
      },
      progress: () => {}
    })
    expect(peak).toBe(2)
    expect(ready.stats.maxConcurrentBakes).toBe(2)
    expect(missingEditorV6Motions(ready.project)).toHaveLength(0)
  })
  it('rebuilds a speaking transition with localized mouth patches aligned to the export cycle', async () => {
    const { project: original, character } = fixture()
    const timeline = { ...original.timeline, tracks: original.timeline.tracks.map((track) => track.kind === 'speech'
      ? { ...track, blocks: [{ id: crypto.randomUUID(), label: 'Fala durante a transição', characterId: character.id, startFrame: 173, durationFrames: 7 }] }
      : track) }
    const project = { ...original, timeline }
    const plan = editorV6MotionPlans(project).find((item) => item.endFrame === 180)!
    const oldRequest = { id: crypto.randomUUID(), plan, character }
    const old = attachEditorV6Motion(project, plan.blockId, resultFor(oldRequest))
    let requestWithMouth: EditorV6MotionBakeRequest | undefined
    const prepared = await prepareExportMotions(old, 0, 300, {
      signal: new AbortController().signal, characters: [character], mouthLoop: { startFrame: 0, cycleFrames: 30 }, progress: () => {},
      bake: async (request) => {
        if (request.mouthScaleSamples) requestWithMouth = request
        const faceId = crypto.randomUUID()
        const frames = request.plan.samples.map((sample, index) => {
          const scale = request.mouthScaleSamples?.[index] ?? 1
          return { offset: sample.offset, sprite: { x: index, y: 0, width: 1, height: 1, atlasWidth: 7, atlasHeight: 1 }, x: 0, y: 0, width: 20, height: 30, rotation: 0, flipX: false, ...(scale > 1 ? { facePatch: { sprite: { x: index, y: 0, width: 1, height: 1, atlasWidth: 7, atlasHeight: 1 }, x: .4, y: .4, width: .2, height: .2 } } : {}) }
        })
        const result = resultFor(request)
        return request.mouthScaleSamples
          ? { ...result, faceAsset: { id: faceId, category: 'character', name: 'Local mouth', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }, motion: { ...result.motion, faceAssetId: faceId, frames } }
          : result
      }
    })
    expect(requestWithMouth?.mouthScaleSamples).toHaveLength(plan.samples.length)
    expect(requestWithMouth?.mouthScaleSamples).toEqual(plan.samples.map((sample) => sample.faceMode === 'talk'
      ? editorV6MouthLoopScaleAtFrame(plan.endFrame + sample.offset, 0, 30)
      : EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES[0]))
    const readyTransition = prepared.project.timeline.tracks.flatMap((track) => track.blocks).find((block) => block.id === plan.blockId)!.incomingMotion!
    expect(readyTransition.faceAssetId).toBeDefined()
    expect(prepared.project.assets.some((asset) => asset.id === readyTransition.faceAssetId)).toBe(true)
    expect(readyTransition.frames.some((frame) => Boolean(frame.facePatch))).toBe(true)
  })
  it('cancels and waits for sibling bakes after a transition fails', async () => {
    const { project, character } = fixture()
    let calls = 0, siblingCancelled = false
    let startSibling!: () => void
    const siblingStarted = new Promise<void>((resolve) => { startSibling = resolve })
    await expect(prepareExportMotions(project, 0, 300, {
      signal: new AbortController().signal, characters: [character], concurrency: 2,
      bake: async (_request, signal) => {
        calls++
        if (calls === 1) {
          await siblingStarted
          throw Error('falha de bake')
        }
        startSibling()
        return new Promise((_resolve, reject) => {
          const abort = () => { siblingCancelled = true; reject(signal.reason) }
          signal.addEventListener('abort', abort, { once: true })
          if (signal.aborted) abort()
        })
      },
      progress: () => {}
    })).rejects.toThrow('falha de bake')
    expect(calls).toBe(2)
    expect(siblingCancelled).toBe(true)
  })
  it('stops before publishing an aborted bake', async () => {
    const { project, character } = fixture(), controller = new AbortController()
    await expect(prepareExportMotions(project, 0, 300, { signal: controller.signal, characters: [character], bake: async (request) => { controller.abort(); return resultFor(request) }, progress: () => {} })).rejects.toThrow()
    expect(project.assets).toHaveLength(1)
  })
  it('survives service restart and invalidates character/source changes; damaged files miss safely', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'v6-motion-cache-'))
    try {
      const { request } = fixture(), result = resultFor(request)
      const cache = createMotionDiskCache(folder)
      await cache.write(request, result)
      expect(await cache.read(request)).toEqual(result)
      const keyedRequest = { ...request, mouthScaleSamples: Array(request.plan.samples.length).fill(1) }
      await cache.write(keyedRequest, result)
      const tighterBudget = { ...keyedRequest, maxAtlasPixels: 6 }
      expect(motionCacheKey({ ...keyedRequest, maxAtlasPixels: 100_000 })).toBe(motionCacheKey({ ...keyedRequest, maxAtlasPixels: 200_000 }))
      await expect(cache.read(tighterBudget)).resolves.toBeUndefined()
      await expect(cache.write(request, { ...result, motion: { ...result.motion, key: 'another-transition' } })).rejects.toThrow('não corresponde à requisição')
      const changedCharacter = { ...request, character: { ...request.character, updatedAt: '2026-10-27T12:00:00.000Z' } }
      expect(await createMotionDiskCache(folder).read(changedCharacter)).toBeUndefined()
      expect(motionCacheKey(changedCharacter)).not.toBe(motionCacheKey(request))
      expect(motionCacheKey({ ...request, plan: { ...request.plan, key: request.plan.key + 'pose-revision' } })).not.toBe(motionCacheKey(request))
      await writeFile(join(folder, motionCacheKey(request) + '.json'), '{broken')
      expect(await createMotionDiskCache(folder).read(request)).toBeUndefined()
      expect((await readdir(folder)).some((name) => name.endsWith('.tmp'))).toBe(false)
    } finally { await rm(folder, { recursive: true, force: true }) }
  })
  it('retains static localized mouth atlases without requiring a second face asset', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'v6-motion-static-mouth-cache-'))
    try {
      const { request: original } = fixture()
      const state = { ...original.plan.from, activeFaceMode: 'talk' as const }
      const samples = original.plan.samples.map((sample) => ({ ...sample, faceMode: 'talk' as const }))
      const scales = [1, 1.05, 1.1, 1.05, 1]
      const request: EditorV6MotionBakeRequest = {
        ...original,
        mouthScaleSamples: samples.map((_, index) => scales[index % scales.length]),
        plan: { ...original.plan, from: state, to: { ...state }, samples }
      }
      const result = resultFor(request)
      result.motion.frames = result.motion.frames.map((frame) => ({ ...frame, facePatch: { sprite: frame.sprite, x: 0.4, y: 0.4, width: 0.2, height: 0.2 } }))
      const cache = createMotionDiskCache(folder)
      await cache.write(request, result)
      expect(await cache.read(request)).toEqual(result)
    } finally { await rm(folder, { recursive: true, force: true }) }
  })
  it('rejects modified payloads and bounds retained disk bytes', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'v6-motion-cache-limits-'))
    try {
      const { request } = fixture(), result = resultFor(request), normal = createMotionDiskCache(folder)
      await normal.write(request, result)
      const target = join(folder, motionCacheKey(request) + '.json')
      const envelope = JSON.parse(await readFile(target, 'utf8'))
      envelope.payload = envelope.payload.replace('Atlas', 'Wrong')
      await writeFile(target, JSON.stringify(envelope))
      expect(await normal.read(request)).toBeUndefined()
      const limit = 2 * (await stat(target)).size + 100, bounded = createMotionDiskCache(folder, limit)
      for (let index = 0; index < 6; index++) {
        const next = { ...request, character: { ...request.character, name: 'Alice ' + index } }
        await bounded.write(next, result)
      }
      const entries = (await readdir(folder)).filter((name) => name.endsWith('.json'))
      const bytes = (await Promise.all(entries.map(async (name) => (await stat(join(folder, name))).size))).reduce((sum, size) => sum + size, 0)
      expect(bytes).toBeLessThanOrEqual(limit)
      expect(entries.length).toBeLessThan(6)
    } finally { await rm(folder, { recursive: true, force: true }) }
  })
  it('does not load an oversized cache entry into memory', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'v6-motion-cache-entry-limit-'))
    try {
      const { request } = fixture()
      await writeFile(join(folder, motionCacheKey(request) + '.json'), Buffer.alloc(32 * 1024 * 1024 + 1))
      expect(await createMotionDiskCache(folder).read(request)).toBeUndefined()
    } finally { await rm(folder, { recursive: true, force: true }) }
  })
})
