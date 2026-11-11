import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Document } from '../../src/shared/editorV6'
import type { EditorV6ExportOptions } from '../../src/shared/editorV6Export'
import type { EditorV6MotionPlan } from '../../src/shared/editorV6Motion'
import type { EditorV6HairMotionRig } from '../../src/shared/editorV6HairMotion'
import { createEditorV6HairMotionBundleAssets } from '../../src/renderer/src/features/editorV6/editorV6HairMotionBundleAssets'
import { editorV6HairMotionCanvasDataUrl } from '../../src/renderer/src/features/editorV6/editorV6HairMotionCanvas'
import { prepareEditorV6HairMotionTransitions } from '../../src/renderer/src/features/editorV6/editorV6HairMotionTransitions'

const state = vi.hoisted(() => ({
  plans: [] as unknown[],
  bake: undefined as ((...args: any[]) => Promise<any>) | undefined,
  createSession: vi.fn()
}))

vi.mock('../../src/shared/editorV6Motion', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/shared/editorV6Motion')>()
  return { ...actual, editorV6MotionPlans: vi.fn(() => state.plans) }
})

vi.mock('../../src/renderer/src/features/editorV6/motion/bakeMotion', () => ({
  bakeEditorV6Motion: (...args: any[]) => state.bake!(...args),
  createEditorV6BakeSession: (...args: any[]) => state.createSession(...args)
}))

function motionPlan(overrides: Partial<EditorV6MotionPlan> & { blockId: string; key: string; characterId: string; elementId: string; from: any; to: any }): EditorV6MotionPlan {
  return {
    startFrame: 0, endFrame: 10, samples: [{ offset: -2, progress: 0.5, faceMode: 'talk' }], ...overrides
  } as EditorV6MotionPlan
}

function endpoint(assetId: string, poseSlot: number) {
  return { assetId, text: assetId, poseSlot, x: 0, y: 0, width: 100, height: 100, rotation: 0 }
}

function canvas(dataUrl: string) {
  return { width: 1, height: 1, toDataURL: () => dataUrl } as HTMLCanvasElement
}

function fixture(plans: EditorV6MotionPlan[], blocks: any[] = plans.map(plan => ({ id: plan.blockId, incomingMotion: { key: plan.key } }))) {
  const character: CustomizerCharacter = {
    id: 'character-1', name: 'Ayla', hair: '', outfit: '', skin: '', createdAt: '', updatedAt: 'revision-1',
    customization: { hairAppearance: { modelSlot: 1 } }
  } as unknown as CustomizerCharacter
  const rigs: EditorV6HairMotionRig[] = plans.flatMap(plan => [plan.from, plan.to].map(endpoint => ({
    elementId: plan.elementId,
    assetId: endpoint.assetId,
    sourceCrop: { left: 0, top: 0, width: 10, height: 10 },
    outputWidth: 10,
    outputHeight: 10
  } as unknown as EditorV6HairMotionRig)))
  const project = { timeline: { tracks: [{ blocks }] } } as unknown as EditorV6Document
  const assets = createEditorV6HairMotionBundleAssets()
  const fabricator = {} as typeof window.desktop.fabricator
  const session = { materials: new Map() }
  state.plans = plans
  state.createSession.mockReturnValue(session)
  state.bake = vi.fn(async (_request, _fabricator, _session, captureLayers) => {
    captureLayers({
      frames: [{ offset: -2 }],
      behindFace: canvas('data:behind'),
      face: canvas('data:face'),
      eyesAboveRearHair: canvas('data:raised-eyes'),
      inFrontOfFace: null
    })
    return { faceAsset: null }
  })
  return { project, character, rigs, assets, fabricator, session }
}

const exportOptions = { startFrame: 0, endFrame: 30, width: 1280, height: 720, mouthLoop: true, mouthLoopCycleFrames: 30 } as EditorV6ExportOptions

beforeEach(() => {
  state.plans = []
  state.bake = undefined
  state.createSession.mockReset()
})

describe('preparação de transições sem cabelo do Editor V6', () => {
  it('bakes only geometry changes and transitions lacking a complete face atlas, then serializes each layer', async () => {
    const geometryPlan = motionPlan({
      blockId: 'geometry-block', key: 'geometry-key', characterId: 'character-1', elementId: 'actor-1',
      from: endpoint('pose-a', 1), to: endpoint('pose-b', 2)
    })
    const completeFacePlan = motionPlan({
      blockId: 'complete-face-block', key: 'complete-face-key', characterId: 'character-1', elementId: 'actor-2',
      from: endpoint('same-a', 1), to: endpoint('same-b', 1)
    })
    const missingFacePlan = motionPlan({
      blockId: 'missing-face-block', key: 'missing-face-key', characterId: 'character-1', elementId: 'actor-3',
      from: endpoint('same-c', 1), to: endpoint('same-d', 1)
    })
    const { project, character, rigs, assets, fabricator, session } = fixture(
      [geometryPlan, completeFacePlan, missingFacePlan],
      [
        { id: geometryPlan.blockId, incomingMotion: { key: geometryPlan.key } },
        { id: completeFacePlan.blockId, incomingMotion: { key: completeFacePlan.key, faceAssetId: 'face-atlas', frames: [{ offset: -2, facePatch: {} }] } },
        { id: missingFacePlan.blockId, incomingMotion: { key: missingFacePlan.key, faceAssetId: 'face-atlas', frames: [{ offset: -2 }] } }
      ]
    )
    const recordStage = vi.fn()

    await prepareEditorV6HairMotionTransitions({
      project, rigs, characterById: new Map([[character.id, character]]), exportOptions,
      isCancelled: () => false, fabricator, recordStage, captureTransitionLayers: assets.captureTransitionLayers
    })

    expect(state.bake).toHaveBeenCalledTimes(2)
    expect(assets.motionTransitions.map(transition => transition.key)).toEqual(['geometry-key', 'missing-face-key'])
    expect(assets.motionTransitions.every(transition => transition.eyesAboveRearHairSurfaceId !== null)).toBe(true)
    expect(assets.surfaces.map(surface => surface.dataUrl)).toContain('data:behind')
    expect(recordStage).toHaveBeenCalledTimes(2)
    expect(state.createSession).toHaveBeenCalledWith(fabricator)
    expect(session.materials.size).toBe(0)
  })

  it('skips lazy bake setup in posterior-only mode and clears transition caches when already cancelled', async () => {
    const plan = motionPlan({ blockId: 'block', key: 'key', characterId: 'character-1', elementId: 'actor', from: endpoint('a', 1), to: endpoint('b', 2) })
    const clean = fixture([plan])

    await prepareEditorV6HairMotionTransitions({
      project: clean.project, rigs: clean.rigs, characterById: new Map([[clean.character.id, clean.character]]),
      exportOptions: { ...exportOptions, hairPoseReactionOnly: true }, isCancelled: () => false,
      fabricator: clean.fabricator, recordStage: vi.fn(), captureTransitionLayers: clean.assets.captureTransitionLayers
    })
    expect(state.createSession).not.toHaveBeenCalled()
    expect(state.bake).not.toHaveBeenCalled()

    const cancelled = fixture([plan])
    await expect(prepareEditorV6HairMotionTransitions({
      project: cancelled.project, rigs: cancelled.rigs, characterById: new Map([[cancelled.character.id, cancelled.character]]),
      exportOptions, isCancelled: () => true, fabricator: cancelled.fabricator,
      recordStage: vi.fn(), captureTransitionLayers: cancelled.assets.captureTransitionLayers
    })).resolves.toBeUndefined()
    expect(cancelled.session.materials.size).toBe(0)
  })

  it('rejects empty layer canvases before they enter the bundle', () => {
    expect(() => editorV6HairMotionCanvasDataUrl({ width: 0, height: 1 } as HTMLCanvasElement)).toThrow('Uma camada do personagem ficou vazia')
  })
})
