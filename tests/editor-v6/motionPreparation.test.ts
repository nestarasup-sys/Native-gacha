import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import { editorV6MotionPlans, missingEditorV6Motions, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { prepareExportMotions } from '../../electron/domains/editorV6/prepareMotions'
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
