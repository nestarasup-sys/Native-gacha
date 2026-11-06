import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { editorV6BlinkChangeFrames, isEditorV6BlinkFrame } from '../../src/shared/editorV6FaceSchedule'
import { editorV6MotionPlans } from '../../src/shared/editorV6Motion'
import { addEditorV6ElementAtFrame } from '../../src/shared/editorV6TimelineCore'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { compileEditorV6ScenePlan } from '../../src/shared/editorV6ScenePlan'

function fixture(): EditorV6Document {
  const assetId = crypto.randomUUID()
  const actor: EditorV6Element = { id: crypto.randomUUID(), kind: 'character', characterId: 'alice', assetId, text: 'Alice', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
  return { schemaVersion: 1, id: crypto.randomUUID(), title: 'Plano', color: '#d7b5cd', createdAt: '2026-11-06T12:00:00.000Z', updatedAt: '2026-11-06T12:00:00.000Z', backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor], assets: [{ id: assetId, category: 'character', name: 'Alice', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }], timeline: createEditorV6Timeline([actor]) }
}

describe('compiled Editor V6 scene plan', () => {
  it('takes ownership of the worker snapshot and resolves frozen asset references by ID without copying payloads', () => {
    const document = fixture()
    const assetData = document.assets[0].dataUrl
    const plan = compileEditorV6ScenePlan(document, { width: 1920, height: 1080 })

    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.assetIds)).toBe(true)
    expect(plan).toMatchObject({ version: 1, projectId: document.id, projectRevision: document.updatedAt, fps: 30, frameCount: document.timeline.durationFrames, width: 1920, height: 1080 })
    expect(plan.assetIds).toEqual([document.assets[0].id])
    expect(plan.resolveAsset(document.assets[0].id)).toBe(document.assets[0])
    expect(plan.resolveAsset(document.assets[0].id)?.dataUrl).toBe(assetData)
    expect(Object.isFrozen(document)).toBe(true)
    expect(Object.isFrozen(document.timeline.tracks[0])).toBe(true)
    expect(Object.isFrozen(document.assets[0])).toBe(true)
    expect(plan.resolveAsset('missing')).toBeUndefined()
    expect(() => { document.backgroundColor = '#000000' }).toThrow()
  })

  it('evaluates deterministic integer frames with resolved-scene parity against the current resolver', () => {
    const document = fixture()
    const plan = compileEditorV6ScenePlan(document, { width: 1920, height: 1080 })

    for (const frame of [0, 29, 30, 120, document.timeline.durationFrames - 1]) {
      expect(plan.evaluateFrame(frame)).toEqual(resolveEditorV6SceneAtFrame(document, frame))
      expect(plan.evaluateFrame(frame)).toEqual(plan.evaluateFrame(frame))
    }
  })

  it('compiles read-only motion schedules and matches the resolver across a pose boundary', () => {
    const document = fixture()
    const actor = document.elements[0]
    const changedPose = { ...actor, poseSlot: 1, y: 12 }
    document.timeline = addEditorV6ElementAtFrame(document, changedPose, 30).timeline
    const plan = compileEditorV6ScenePlan(document, { width: 1920, height: 1080 })

    expect(plan.motionPlans).toHaveLength(1)
    expect(Object.isFrozen(plan.motionPlans[0])).toBe(true)
    expect(Object.isFrozen(plan.motionPlans[0].samples)).toBe(true)
    for (const frame of [0, 22, 23, 24, 29, 30, 31, plan.frameCount - 1]) {
      expect(plan.evaluateFrame(frame)).toEqual(resolveEditorV6SceneAtFrame(document, frame))
    }
  })

  it('rejects invalid dimensions, duplicate asset IDs, fractional frames and out-of-range frames', () => {
    const document = fixture()
    expect(() => compileEditorV6ScenePlan(document, { width: 0, height: 1080 })).toThrow('horizontal')
    expect(() => compileEditorV6ScenePlan(document, { width: 1920.5, height: 1080 })).toThrow('horizontal')
    expect(() => compileEditorV6ScenePlan({ ...document, assets: [...document.assets, document.assets[0]] }, { width: 1920, height: 1080 })).toThrow('duplicado')
    const plan = compileEditorV6ScenePlan(document, { width: 1920, height: 1080 })
    expect(() => plan.evaluateFrame(1.25)).toThrow('fora do plano')
    expect(() => plan.evaluateFrame(-1)).toThrow('fora do plano')
    expect(() => plan.evaluateFrame(document.timeline.durationFrames)).toThrow('fora do plano')
    expect(() => plan.frameIndex.segmentAt(1.25)).toThrow('fora do índice')
    expect(() => plan.frameIndex.segmentAt(document.timeline.durationFrames)).toThrow('fora do índice')
  })

  it('indexes every timeline, speech, motion-atlas, and blink boundary before reusing resolved scene data', () => {
    let document = fixture()
    const actor = document.elements[0]
    const blinkAssetId = crypto.randomUUID()
    const motionAssetId = crypto.randomUUID()
    actor.faceModeAssetIds = { blink: blinkAssetId }
    document.assets.push(
      { id: blinkAssetId, category: 'character', name: 'Alice blink', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' },
      { id: motionAssetId, category: 'character', name: 'Motion atlas', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }
    )
    document = addEditorV6ElementAtFrame(document, { ...actor, poseSlot: 1, y: 12 }, 45)
    const balloon: EditorV6Element = { id: crypto.randomUUID(), kind: 'speech', characterId: 'alice', attachedCharacterElementId: actor.id, text: 'Olá!', x: 20, y: 10, width: 25, height: 12, rotation: 0, zIndex: 2 }
    document = addEditorV6ElementAtFrame(document, balloon, 81)
    const [motionPlan] = editorV6MotionPlans(document)
    const sprite = { x: 0, y: 0, width: 20, height: 40, atlasWidth: 20, atlasHeight: 40 }
    const characterTrack = document.timeline.tracks.find(track => track.kind === 'character')!
    const targetBlock = characterTrack.blocks.find(block => block.id === motionPlan.blockId)!
    targetBlock.incomingMotion = {
      version: 1,
      key: motionPlan.key,
      assetId: motionAssetId,
      frames: motionPlan.samples.map(sample => ({ offset: sample.offset, sprite, x: sample.progress, y: 0, width: 20, height: 40, rotation: 0, flipX: false }))
    }
    const videoId = crypto.randomUUID()
    document.media = [{ id: videoId, name: 'Fundo', fileName: 'video.mp4', kind: 'video', mimeType: 'video/mp4', sourceFrames: 300, hasAudio: true, width: 1280, height: 720, sizeBytes: 10 }]
    const videoTrack = document.timeline.tracks.find(track => track.kind === 'video')!
    videoTrack.blocks.push(
      { id: crypto.randomUUID(), label: 'Fundo roxo', startFrame: 60, durationFrames: 300, background: { backgroundColor: '#52364a', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 } },
      { id: crypto.randomUUID(), label: 'Vídeo', startFrame: 132, durationFrames: 42, mediaId: videoId, mediaInFrame: 12, mediaLayout: { x: 15, y: -10, width: 62, height: 44, rotation: 13 }, audioEnabled: false, gain: 0.5 }
    )

    const plan = compileEditorV6ScenePlan(document, { width: 1920, height: 1080 })
    expect(plan.frameIndex.exact).toBe(true)
    expect(plan.frameIndex.boundaries).toContain(45)
    expect(plan.frameIndex.boundaries).toContain(81)
    expect(plan.frameIndex.boundaries).toContain(132)
    expect(plan.frameIndex.boundaries).toEqual([...plan.frameIndex.boundaries].sort((a, b) => a - b))
    for (let frame = 0; frame < plan.frameCount; frame += 1) {
      expect(plan.evaluateFrame(frame)).toEqual(resolveEditorV6SceneAtFrame(document, frame))
    }
    expect(plan.evaluateFrame(132).mediaVideo).toMatchObject({ mediaId: videoId, sourceInFrame: 12, audioEnabled: false, gain: 0.5 })

    const stableFrame = plan.frameIndex.boundaries.find(frame => frame < plan.frameCount - 1 && plan.frameIndex.segmentAt(frame).endFrameExclusive > frame + 1)!
    expect(plan.evaluateFrame(stableFrame).elements).toBe(plan.evaluateFrame(stableFrame + 1).elements)
    expect(plan.evaluateFrame(44).elements).not.toBe(plan.evaluateFrame(45).elements)
  })

  it('indexes blink boundaries exactly without scanning or storing every frame', () => {
    const changes = editorV6BlinkChangeFrames('project', 'alice', 2400)
    const changeSet = new Set(changes)
    for (let frame = 1; frame < 2400; frame += 1) {
      expect(changeSet.has(frame)).toBe(isEditorV6BlinkFrame('project', 'alice', frame) !== isEditorV6BlinkFrame('project', 'alice', frame - 1))
    }
    expect(changes.length).toBeLessThan(200)
  })

  it('falls back to direct frame resolution when a very long timeline would exceed the sparse-index memory bound', () => {
    let document = fixture()
    const secondActor: EditorV6Element = { ...document.elements[0], id: crypto.randomUUID(), characterId: 'bob', text: 'Bob' }
    document = addEditorV6ElementAtFrame(document, secondActor, 0)
    document.timeline.durationFrames = 1_000_000

    const plan = compileEditorV6ScenePlan(document, { width: 1920, height: 1080 })
    expect(plan.frameIndex.exact).toBe(false)
    expect(plan.frameIndex.boundaries).toEqual([0, 1_000_000])
    for (const frame of [0, 299, 999_999]) expect(plan.evaluateFrame(frame)).toEqual(resolveEditorV6SceneAtFrame(document, frame))
  })
})
