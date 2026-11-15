import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import { editorV6CharacterSnapshotIsCurrent } from '../../src/shared/editorV6CharacterSource.ts'
import { attachEditorV6Motion, editorV6MotionPlans, missingEditorV6Motions, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../src/shared/editorV6Motion'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import { editorV6MotionResultSchema } from '../../src/shared/editorV6Schema'
import { pruneEditorV6TimelineSnapshots, repairEditorV6DuplicateAssets, resolveEditorV6ElementsAtFrame } from '../../src/shared/editorV6Timeline'
import { editEditorV6DocumentAtBlock } from '../../src/shared/editorV6TimelineEdits'
import { prepareExportMotions } from '../../electron/domains/editorV6/prepareMotions'
import { editorV6MotionBakeLaneAssignments } from '../../electron/domains/editorV6/motionBakeSchedule'
import { createMotionDiskCache, motionCacheKey } from '../../electron/domains/editorV6/motionCache'
import { createEditorV6MotionService, editorV6MotionMemoryCacheKey } from '../../electron/domains/editorV6/motionIpc'
import { editorV6IpcChannels } from '../../src/shared/editorV6IpcChannels'
import { createCompletedMotionPreparation, hasCompletedMotionPreparation, indexMotionPreparationCharacters, rememberCompletedMotionPreparation } from '../../src/renderer/src/features/editorV6/motion/motionPreparationModel'
import { subscribeToCustomizerCharacterUpdates } from '../../src/renderer/src/features/editorV6/editorV6CharacterSourceEvents.ts'
import { invalidateIncompleteEditorV6Motions } from '../../src/shared/editorV6Motion'
import { createEditorV6DocumentPersistence } from '../../electron/domains/editorV6/documentPersistence'
import * as files from 'node:fs/promises'
import { recordEditorV6History, undoEditorV6History, redoEditorV6History } from '../../src/shared/editorV6History'

function fixture() {
  const stamp = '2026-10-26T12:00:00.000Z'
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', assetId: crypto.randomUUID(), text: 'Alice', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1, poseSlot: 1, characterSourceUpdatedAt: stamp }
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Test', color: '#ffffff', createdAt: stamp, updatedAt: stamp, backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor], assets: [{ id: actor.assetId!, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }], timeline: createEditorV6Timeline([actor]) }
  project.timeline.tracks.find((track) => track.kind === 'character')!.blocks = [1, 2, 1, 2].map((poseSlot, index) => ({ id: crypto.randomUUID(), elementId: actor.id, label: 'Pose', startFrame: index * 60, durationFrames: 60, state: { ...actor, poseSlot } }))
  const character: CustomizerCharacter = { id: 'alice', name: 'Alice', createdAt: stamp, updatedAt: stamp, hair: '#000000', outfit: '#000000', skin: '#000000', customization: { modelSlot: 1, poseSlot: null, partOverrides: {}, layerOrder: [] } }
  const request: EditorV6MotionBakeRequest = { id: crypto.randomUUID(), plan: editorV6MotionPlans(project)[0], character }
  return { project, character, request }
}
function addSecondCharacter(project: EditorV6Document, character: CustomizerCharacter): CustomizerCharacter {
  const bob: CustomizerCharacter = { ...character, id: 'bob', name: 'Bob' }
  const source = project.elements[0]
  const actor: EditorV6Element = { ...source, id: crypto.randomUUID(), characterId: bob.id, assetId: crypto.randomUUID(), text: bob.name }
  project.elements.push(actor)
  project.assets.push({ id: actor.assetId!, category: 'character', name: bob.name, mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' })
  const track = project.timeline.tracks.find((item) => item.kind === 'character')!
  track.blocks.push(...[1, 2].map((poseSlot, index) => ({ id: crypto.randomUUID(), elementId: actor.id, label: 'Pose', startFrame: 181 + index * 29, durationFrames: 29, state: { ...actor, poseSlot } })))
  project.timeline = { ...project.timeline, tracks: [...project.timeline.tracks] }
  return bob
}
function resultFor(request: EditorV6MotionBakeRequest): EditorV6MotionBakeResult {
  const id = crypto.randomUUID()
  return { asset: { id, category: 'character', mimeType: 'image/png', name: 'Atlas', dataUrl: 'data:image/png;base64,AA==' }, motion: { version: 1, key: request.plan.key, assetId: id, frames: request.plan.samples.map((sample, index) => ({ offset: sample.offset, sprite: { x: index, y: 0, width: 1, height: 1, atlasWidth: 7, atlasHeight: 1 }, x: 0, y: 0, width: 20, height: 30, rotation: 0, flipX: false })) }, metrics: { milliseconds: 1, samples: 7, preparedRigs: 9, atlasPixels: 7 } }
}
function resultWithFaceAsset(request: EditorV6MotionBakeRequest): EditorV6MotionBakeResult {
  const result = resultFor(request), id = crypto.randomUUID()
  return {
    ...result,
    asset: { ...result.asset, timelineSnapshot: true },
    faceAsset: { id, category: 'character', mimeType: 'image/png', name: 'Atlas facial', dataUrl: 'data:image/png;base64,AA==', timelineSnapshot: true },
    motion: {
      ...result.motion,
      faceAssetId: id,
      frames: result.motion.frames.map((frame) => ({
        ...frame,
        facePatch: { sprite: frame.sprite, x: .4, y: .35, width: .2, height: .15 }
      }))
    },
    metrics: { ...result.metrics, atlasPixels: result.metrics.atlasPixels * 2 }
  }
}
function staticMouthAtlasResultFor(request: EditorV6MotionBakeRequest): EditorV6MotionBakeResult {
  const result = resultFor(request)
  return {
    ...result,
    assetRole: 'face-atlas',
    motion: {
      ...result.motion,
      frames: result.motion.frames.map((frame) => ({
        ...frame,
        facePatch: {
          sprite: frame.sprite,
          x: 0.4,
          y: 0.4,
          width: 0.2,
          height: 0.2,
          replace: true,
          replaceBounds: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 }
        }
      }))
    }
  }
}

describe('transition preparation reuse', () => {
  it('assigns whole character sequences to stable parallel lanes while preserving order', () => {
    const grouped = [
      [{ characterId: 'beta' }], [{ characterId: 'alpha' }],
      [{ characterId: 'beta' }], [{ characterId: 'alpha' }],
      [{ characterId: 'alpha' }], [{ characterId: 'beta' }]
    ]
    const original = JSON.stringify(grouped)
    const lanes = editorV6MotionBakeLaneAssignments(grouped, 2)
    expect(lanes).toEqual([[1, 3, 4], [0, 2, 5]])
    for (const characterId of ['alpha', 'beta']) {
      expect(lanes.flatMap(lane => lane.filter(index => grouped[index][0].characterId === characterId)))
        .toEqual(grouped.map((group, index) => group[0].characterId === characterId ? index : -1).filter(index => index >= 0))
    }
    expect(JSON.stringify(grouped)).toBe(original)
    expect(editorV6MotionBakeLaneAssignments([], 2)).toEqual([[], []])
    expect(editorV6MotionBakeLaneAssignments([[{ characterId: 'single' }]], 1)).toEqual([[0]])
    expect(editorV6MotionBakeLaneAssignments([
      [{ characterId: 'alpha' }], [{ characterId: 'beta' }], [{ characterId: 'alpha' }],
      [{ characterId: 'gamma' }], [{ characterId: 'alpha' }], [{ characterId: 'beta' }]
    ], 2)).toEqual([[0, 2, 4], [1, 5, 3]])
    expect(editorV6MotionBakeLaneAssignments([
      [{ characterId: 'alpha' }], [{ characterId: 'beta' }], [{ characterId: 'gamma' }],
      [{ characterId: 'alpha' }], [{ characterId: 'beta' }], [{ characterId: 'gamma' }]
    ], 3)).toEqual([[0, 3], [1, 4], [2, 5]])
  })
  it('reports effective scheduler concurrency by independent character sequences', async () => {
    const single = fixture()
    let active = 0, peak = 0
    const bake = async (request: EditorV6MotionBakeRequest) => {
      active++; peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 8))
      active--
      return resultFor(request)
    }
    const oneCharacter = await prepareExportMotions(single.project, 0, 300, {
      signal: new AbortController().signal, characters: [single.character], bake, progress: () => {}, concurrency: 3, ignoreExistingMotions: true
    })
    expect(oneCharacter.stats).toMatchObject({ configuredConcurrency: 3, characterSequences: 1, assignedLanes: 1, maxConcurrentBakes: 1 })
    expect(peak).toBe(1)

    const multiple = fixture()
    const second = addSecondCharacter(multiple.project, multiple.character)
    const third = { ...multiple.character, id: 'cara', name: 'Cara' }
    const source = multiple.project.elements[0]
    const thirdActor: EditorV6Element = { ...source, id: crypto.randomUUID(), characterId: third.id, assetId: crypto.randomUUID(), text: third.name }
    multiple.project.elements.push(thirdActor)
    multiple.project.assets.push({ id: thirdActor.assetId!, category: 'character', name: third.name, mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' })
    const thirdTrack = createEditorV6Timeline([thirdActor]).tracks.find((track) => track.kind === 'character')!
    thirdTrack.blocks = [1, 2].map((poseSlot, index) => ({ id: crypto.randomUUID(), elementId: thirdActor.id, label: 'Pose', startFrame: 361 + index * 30, durationFrames: 30, state: { ...thirdActor, poseSlot } }))
    multiple.project.timeline = { ...multiple.project.timeline, tracks: [...multiple.project.timeline.tracks, thirdTrack] }
    active = 0; peak = 0
    const threeCharacters = await prepareExportMotions(multiple.project, 0, 500, {
      signal: new AbortController().signal, characters: [multiple.character, second, third], bake, progress: () => {}, concurrency: 3, ignoreExistingMotions: true
    })
    expect(threeCharacters.stats).toMatchObject({ configuredConcurrency: 3, characterSequences: 3, assignedLanes: 3, maxConcurrentBakes: 3 })
    expect(peak).toBe(3)
  })
  it('detecta edição do Customizador e não prepara atlas com corpo diferente do snapshot', async () => {
    const { project, character } = fixture()
    const changedCharacter = {
      ...character,
      updatedAt: '2026-10-31T18:56:39.903Z',
      customization: { ...character.customization, bodyDimensions: { thighsWidth: 112, thighsHeight: 100 } }
    }
    let bakes = 0

    expect(editorV6CharacterSnapshotIsCurrent(project.elements[0], changedCharacter)).toBe(false)
    await expect(prepareExportMotions(project, 0, 300, {
      signal: new AbortController().signal,
      characters: [changedCharacter],
      bake: async (request) => { bakes++; return resultFor(request) },
      progress: () => {}
    })).rejects.toThrow('está desatualizada em relação ao Customizador')
    expect(bakes).toBe(0)
  })

  it('mantém compatibilidade com snapshots legados sem revisão de origem', async () => {
    const { project, character } = fixture()
    for (const state of [
      ...project.elements,
      ...project.timeline.tracks.flatMap((track) => track.blocks.flatMap((block) => block.state ? [block.state] : []))
    ]) delete state.characterSourceUpdatedAt
    let bakes = 0

    const prepared = await prepareExportMotions(project, 0, 300, {
      signal: new AbortController().signal,
      characters: [character],
      bake: async (request) => { bakes++; return resultFor(request) },
      progress: () => {}
    })

    expect(bakes).toBeGreaterThan(0)
    expect(prepared.project).not.toBe(project)
  })

  it('atualiza a lista de personagens quando o Customizador salva na mesma janela', () => {
    const target = new EventTarget()
    let refreshes = 0
    const unsubscribe = subscribeToCustomizerCharacterUpdates(target, () => { refreshes++ })

    target.dispatchEvent(new Event('customizer:characters-updated'))
    expect(refreshes).toBe(1)
    unsubscribe()
    target.dispatchEvent(new Event('customizer:characters-updated'))
    expect(refreshes).toBe(1)
  })

  it('preserves a facial atlas through an unrelated edit, snapshot pruning, reload and export preparation', async () => {
    const { project, character } = fixture()
    const characterTrack = project.timeline.tracks.find((track) => track.kind === 'character')!
    characterTrack.blocks = characterTrack.blocks.slice(0, 2)
    const plan = editorV6MotionPlans(project)[0]
    const attached = attachEditorV6Motion(project, plan.blockId, resultWithFaceAsset({ id: crypto.randomUUID(), plan, character }))
    const motionBlock = attached.timeline.tracks.find((track) => track.kind === 'character')!.blocks[1]
    const faceAssetId = motionBlock.incomingMotion!.faceAssetId!

    const image: EditorV6Element = { id: crypto.randomUUID(), kind: 'image', assetId: crypto.randomUUID(), text: 'Objeto', x: 0, y: 0, width: 10, height: 10, rotation: 0, zIndex: 2 }
    const imageTrack = createEditorV6Timeline([image]).tracks.find((track) => track.kind === 'object')!
    let edited = {
      ...attached,
      elements: [...attached.elements, image],
      assets: [...attached.assets, { id: image.assetId!, category: 'object' as const, name: 'Objeto', mimeType: 'image/png' as const, dataUrl: 'data:image/png;base64,AA==' }],
      timeline: { ...attached.timeline, tracks: [...attached.timeline.tracks, imageTrack] }
    }
    edited = editEditorV6DocumentAtBlock(edited, imageTrack.blocks[0].id, (working) => ({
      ...working,
      elements: working.elements.map((element) => element.id === image.id ? { ...element, text: 'Objeto editado' } : element)
    }))
    expect(edited.assets.some((asset) => asset.id === faceAssetId)).toBe(true)
    const history = recordEditorV6History({ undo: [], redo: [] }, attached)
    const undone = undoEditorV6History(history, edited)!
    const redone = redoEditorV6History(undone.history, undone.document)!
    for (const replayed of [undone.document, redone.document]) {
      expect(replayed.assets.some(asset => asset.id === faceAssetId)).toBe(true)
      expect(replayed.timeline.tracks.find(track => track.kind === 'character')!.blocks[1].incomingMotion?.faceAssetId).toBe(faceAssetId)
    }

    const reloaded = editorV6DocumentSchema.parse(JSON.parse(JSON.stringify(edited))) as EditorV6Document
    const facialFrame = resolveEditorV6ElementsAtFrame(reloaded, plan.endFrame - 1).find((element) => element.id === plan.elementId)
    expect(facialFrame?.mouthPatch?.assetId).toBe(faceAssetId)
    expect(reloaded.assets.find((asset) => asset.id === facialFrame?.mouthPatch?.assetId)?.category).toBe('character')

    const prepared = await prepareExportMotions(reloaded, 0, reloaded.timeline.durationFrames, {
      signal: new AbortController().signal,
      characters: [character],
      bake: async () => { throw Error('Uma transição íntegra não deve ser refeita.') },
      progress: () => {}
    })
    expect(missingEditorV6Motions(prepared.project)).toHaveLength(0)
    expect(prepared.project.assets.some((asset) => asset.id === faceAssetId)).toBe(true)
  })

  it('marks a motion as missing when its facial atlas is required but absent', () => {
    const { project, character } = fixture()
    const track = project.timeline.tracks.find((track) => track.kind === 'character')!
    track.blocks = track.blocks.slice(0, 2)
    const plan = editorV6MotionPlans(project)[0]
    const ready = attachEditorV6Motion(project, plan.blockId, resultWithFaceAsset({ id: crypto.randomUUID(), plan, character }))
    const block = ready.timeline.tracks.find((track) => track.kind === 'character')!.blocks[1]
    const incomplete = { ...ready, assets: ready.assets.filter((asset) => asset.id !== block.incomingMotion?.faceAssetId) }
    expect(missingEditorV6Motions(incomplete)).toHaveLength(1)
  })

  it('rebakes a legacy motion with a dangling facial atlas and leaves unrelated snapshot assets collectible', async () => {
    const { project, character } = fixture()
    const track = project.timeline.tracks.find((track) => track.kind === 'character')!
    track.blocks = track.blocks.slice(0, 2)
    const plan = editorV6MotionPlans(project)[0]
    const ready = attachEditorV6Motion(project, plan.blockId, resultWithFaceAsset({ id: crypto.randomUUID(), plan, character }))
    const originalBlock = ready.timeline.tracks.find((lane) => lane.kind === 'character')!.blocks[1]
    const incomplete = { ...ready, assets: ready.assets.filter((asset) => asset.id !== originalBlock.incomingMotion?.faceAssetId) }
    expect(editorV6DocumentSchema.safeParse(incomplete).success).toBe(false)
    const reloaded = editorV6DocumentSchema.parse(invalidateIncompleteEditorV6Motions(JSON.parse(JSON.stringify(incomplete)))) as EditorV6Document
    const recovery = await prepareExportMotions(reloaded, 0, reloaded.timeline.durationFrames, {
      signal: new AbortController().signal,
      characters: [character],
      bake: async (request) => resultWithFaceAsset(request),
      progress: () => {}
    })
    const repairedBlock = recovery.project.timeline.tracks.find((lane) => lane.kind === 'character')!.blocks[1]
    expect(recovery.stats.requested).toBe(1)
    expect(repairedBlock.incomingMotion?.faceAssetId).toBeDefined()
    expect(recovery.project.assets.some((asset) => asset.id === repairedBlock.incomingMotion?.faceAssetId)).toBe(true)
    expect(missingEditorV6Motions(recovery.project)).toHaveLength(0)

    const bodyId = repairedBlock.incomingMotion!.assetId, faceId = repairedBlock.incomingMotion!.faceAssetId!
    const staleKey = { ...recovery.project, timeline: { ...recovery.project.timeline, tracks: recovery.project.timeline.tracks.map((lane) => lane.kind === 'character'
      ? { ...lane, blocks: lane.blocks.map((block) => block.id === repairedBlock.id ? { ...block, state: { ...block.state!, activeExpressionPresetId: 'new-expression-revision' } } : block) }
      : lane) } }
    const pruned = pruneEditorV6TimelineSnapshots(staleKey)
    expect(pruned.timeline.tracks.find((lane) => lane.kind === 'character')!.blocks[1].incomingMotion).toBeUndefined()
    expect(pruned.assets.some((asset) => asset.id === bodyId || asset.id === faceId)).toBe(false)
  })

  it('reopens a saved project with a missing derived facial PNG and retains its timeline for regeneration', async () => {
    const { project, character } = fixture()
    const track = project.timeline.tracks.find(track => track.kind === 'character')!
    track.blocks = track.blocks.slice(0, 2)
    const plan = editorV6MotionPlans(project)[0]
    const ready = attachEditorV6Motion(project, plan.blockId, resultWithFaceAsset({ id: crypto.randomUUID(), plan, character }))
    const faceId = ready.timeline.tracks.find(track => track.kind === 'character')!.blocks[1].incomingMotion!.faceAssetId!
    const root = await mkdtemp(join(tmpdir(), 'editor-v6-missing-face-'))
    try {
      const persistence = createEditorV6DocumentPersistence({ files, editorV6Path: id => join(root, `editorV6-${id}`), editorV6LibraryPath: () => root,
        validate: (value): value is EditorV6Document => editorV6DocumentSchema.safeParse(value).success,
        assertLibraryVideoReferencesAvailable: async () => {}, assertLibraryBackgroundReferencesAvailable: async () => {},
        assertLibraryMediaReferencesAvailable: async () => {}, coordinateLibraryReferenceChange: operation => operation(),
        decodeImage: url => Buffer.from(url.split(',')[1], 'base64'), normalizeImage: async bytes => ({ bytes }) })
      await persistence.writeEditorV6(ready)
      await rm(join(root, `editorV6-${ready.id}`, 'assets', 'characters', `${faceId}.png`))
      const reloaded = await persistence.readEditorV6(ready.id)
      expect(reloaded).not.toBeNull()
      expect(reloaded!.timeline.tracks.find(track => track.kind === 'character')!.blocks).toHaveLength(2)
      expect(missingEditorV6Motions(reloaded!)).toHaveLength(1)
      expect(reloaded!.assets.some(asset => asset.id === ready.elements[0].assetId)).toBe(true)
      const repaired = await prepareExportMotions(reloaded!, 0, 300, { signal: new AbortController().signal, characters: [character], bake: async request => resultWithFaceAsset(request), progress: () => {} })
      expect(missingEditorV6Motions(repaired.project)).toHaveLength(0)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('repairs duplicate facial atlas IDs to the character asset when another category collides', () => {
    const { project, character } = fixture()
    const track = project.timeline.tracks.find((track) => track.kind === 'character')!
    track.blocks = track.blocks.slice(0, 2)
    const plan = editorV6MotionPlans(project)[0]
    const ready = attachEditorV6Motion(project, plan.blockId, resultWithFaceAsset({ id: crypto.randomUUID(), plan, character }))
    const faceAsset = ready.assets.find((asset) => asset.id === ready.timeline.tracks.find((lane) => lane.kind === 'character')!.blocks[1].incomingMotion?.faceAssetId)!
    const withCollision = { ...ready, assets: [{ ...faceAsset, category: 'object' as const, name: 'ID duplicado' }, ...ready.assets] }
    const repaired = repairEditorV6DuplicateAssets(withCollision, null)
    const repairedFaceId = repaired.timeline.tracks.find((lane) => lane.kind === 'character')!.blocks[1].incomingMotion?.faceAssetId

    expect(repaired.assets.find((asset) => asset.id === repairedFaceId)?.category).toBe('character')
    expect(new Set(repaired.assets.map((asset) => asset.id)).size).toBe(repaired.assets.length)
  })

  it('rejects a prepared facial patch without its separate atlas', () => {
    const { request } = fixture()
    const result = resultWithFaceAsset(request)
    expect(editorV6MotionResultSchema.safeParse(result).success).toBe(true)
    expect(editorV6MotionResultSchema.safeParse({
      ...result,
      faceAsset: undefined,
      motion: { ...result.motion, faceAssetId: undefined }
    }).success).toBe(false)
  })

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
  it('forces fresh per-export bakes while sharing identical transitions inside that same run', async () => {
    const { project, character } = fixture()
    const previous = await prepareExportMotions(project, 0, 300, {
      signal: new AbortController().signal, characters: [character],
      bake: async request => resultFor(request), progress: () => {}
    })
    const previousIds = previous.project.timeline.tracks.find(track => track.kind === 'character')!.blocks
      .map(block => block.incomingMotion?.assetId).filter(Boolean)
    let bakes = 0
    const current = await prepareExportMotions(previous.project, 0, 300, {
      signal: new AbortController().signal, characters: [character],
      ignoreExistingMotions: true,
      bake: async request => { bakes++; return resultFor(request) }, progress: () => {}
    })
    const currentIds = current.project.timeline.tracks.find(track => track.kind === 'character')!.blocks
      .map(block => block.incomingMotion?.assetId).filter(Boolean)

    expect(previousIds).toHaveLength(3)
    expect(currentIds).toHaveLength(3)
    expect(bakes).toBe(2)
    expect(current.stats).toMatchObject({ total: 3, unique: 2, requested: 2, reused: 1 })
    expect(currentIds.every(id => !previousIds.includes(id))).toBe(true)
    expect(new Set(currentIds).size).toBe(2)
    expect(previous.project.timeline.tracks.find(track => track.kind === 'character')!.blocks
      .map(block => block.incomingMotion?.assetId).filter(Boolean)).toEqual(previousIds)
    expect(missingEditorV6Motions(current.project)).toHaveLength(0)
  })

  it('keeps character sequences on stable lanes and runs different characters concurrently', async () => {
    const { project, character } = fixture()
    const secondCharacter = addSecondCharacter(project, character)
    let active = 0, peak = 0
    const ready = await prepareExportMotions(project, 0, 300, {
      signal: new AbortController().signal, characters: [character, secondCharacter], concurrency: 2,
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
  it('reuses prepared speaking transitions and skips enlarged mouth samples during pose/expression motion', async () => {
    const { project: original, character } = fixture()
    const timeline = { ...original.timeline, tracks: original.timeline.tracks.map(track => track.kind === 'speech'
      ? { ...track, blocks: [{ id: crypto.randomUUID(), label: 'Fala durante a transição', characterId: character.id, startFrame: 173, durationFrames: 7 }] }
      : track) }
    const project = { ...original, timeline }
    const plan = editorV6MotionPlans(project).find(item => item.endFrame === 180)!
    const cached = attachEditorV6Motion(project, plan.blockId, resultFor({ id: crypto.randomUUID(), plan, character }))
    const requests: EditorV6MotionBakeRequest[] = []

    const ready = await prepareExportMotions(cached, 170, 184, {
      signal: new AbortController().signal, characters: [character],
      mouthLoop: { startFrame: 0, cycleFrames: 30 }, progress: () => {},
      bake: async request => { requests.push(request); return resultFor(request) }
    })
    expect(requests).toHaveLength(0)
    expect(ready.stats.requested).toBe(0)
    expect(missingEditorV6Motions(ready.project, 170, 184)).toHaveLength(0)

    const uncached = await prepareExportMotions(project, 170, 184, {
      signal: new AbortController().signal, characters: [character],
      mouthLoop: { startFrame: 0, cycleFrames: 30 }, progress: () => {},
      bake: async request => { requests.push(request); return resultFor(request) }
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].mouthScaleSamples).toBeUndefined()
    expect(requests[0].plan.samples.some(sample => sample.faceMode === 'talk')).toBe(true)
    expect(uncached.project.timeline.tracks.flatMap(track => track.blocks)
      .find(block => block.id === plan.blockId)?.incomingMotion?.frames.every(frame => !frame.facePatch)).toBe(true)
  })
  it('cancels and waits for a sibling lane after a transition fails', async () => {
    const { project, character } = fixture()
    const secondCharacter = addSecondCharacter(project, character)
    let calls = 0, siblingCancelled = false
    let startSibling!: () => void
    const siblingStarted = new Promise<void>((resolve) => { startSibling = resolve })
    await expect(prepareExportMotions(project, 0, 300, {
      signal: new AbortController().signal, characters: [character, secondCharacter], concurrency: 2,
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
      expect(motionCacheKey({ ...keyedRequest, cacheScope: crypto.randomUUID() })).not.toBe(motionCacheKey(keyedRequest))
      expect(editorV6MotionMemoryCacheKey({ ...keyedRequest, cacheScope: crypto.randomUUID() })).not.toBe(editorV6MotionMemoryCacheKey(keyedRequest))
      expect(editorV6MotionMemoryCacheKey({ ...keyedRequest, maxAtlasPixels: 100_000 })).not.toBe(editorV6MotionMemoryCacheKey({ ...keyedRequest, maxAtlasPixels: 200_000 }))
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
      const result = staticMouthAtlasResultFor(request)
      expect(editorV6MotionResultSchema.parse(result)).toEqual(result)
      const cache = createMotionDiskCache(folder)
      await cache.write(request, result)
      expect(await cache.read(request)).toEqual(result)
    } finally { await rm(folder, { recursive: true, force: true }) }
  })
  it('preserves mouth isolation mode through IPC and cache contracts', async () => {
    const { request: original } = fixture()
    const state = { ...original.plan.from, activeFaceMode: 'talk' as const }
    const samples = original.plan.samples.map((sample) => ({ ...sample, faceMode: 'talk' as const }))
    const request: EditorV6MotionBakeRequest = {
      ...original,
      mouthScaleSamples: [1, 1.05, 1.1, 1.05, 1, 1.05, 1],
      plan: { ...original.plan, from: state, to: { ...state }, samples }
    }
    const base = staticMouthAtlasResultFor(request)
    const legacy = { ...base, mouthIsolationMode: 'legacy-patch' as const }
    expect(editorV6MotionResultSchema.parse(legacy).mouthIsolationMode).toBe('legacy-patch')

    const isolated = {
      ...base,
      mouthIsolationMode: 'isolated-piece' as const,
      mouthlessBaseAssets: (['talk', 'talk-blink'] as const).map((faceMode) => ({
        faceMode,
        asset: { id: crypto.randomUUID(), category: 'character' as const, mimeType: 'image/png' as const, name: `Base sem boca · ${faceMode}`, dataUrl: 'data:image/png;base64,AA==', timelineSnapshot: true }
      })),
      motion: {
        ...base.motion,
        frames: base.motion.frames.map((frame) => ({
          ...frame,
          facePatch: { ...frame.facePatch!, replace: undefined, replaceBounds: undefined }
        }))
      }
    }
    expect(editorV6MotionResultSchema.parse(isolated).mouthIsolationMode).toBe('isolated-piece')
    expect(editorV6MotionResultSchema.safeParse({ ...isolated, mouthlessBaseAssets: isolated.mouthlessBaseAssets.slice(0, 1) }).success).toBe(false)
    const folder = await mkdtemp(join(tmpdir(), 'v6-motion-isolated-mouth-cache-'))
    try {
      const cache = createMotionDiskCache(folder)
      await cache.write(request, isolated)
      await expect(cache.read(request)).resolves.toEqual(isolated)
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
