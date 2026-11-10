import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../src/shared/customizer'
import { createEditorV6Timeline, type EditorV6Asset, type EditorV6Document, type EditorV6Element, type EditorV6FaceRenderMode } from '../../src/shared/editorV6'
import type { PreparedEditorV6FaceRenderer } from '../../src/renderer/src/features/editorV6/faceModeAssets'
import { EDITOR_V6_FACE_RENDER_VERSION } from '../../src/renderer/src/features/editorV6/faceModeAssets'
import type { PreparedEditorV6FaceAppearance } from '../../src/renderer/src/features/editorV6/editorV6FaceAppearancePreparation'
import type { PreparedEditorV6PoseChange } from '../../src/renderer/src/features/editorV6/editorV6PosePreparation'
import { createEditorV6CharacterAppearanceCommands } from '../../src/renderer/src/features/editorV6/editorV6CharacterAppearanceCommands'

const originalAppearance = { modelSlot: 1, setId: 'face-original' } as CustomizerFaceAppearance
const nextAppearance = { modelSlot: 1, setId: 'face-next' } as CustomizerFaceAppearance

function character(): CustomizerCharacter {
  return {
    id: 'character-1', name: 'Hero', updatedAt: 'character-source-2',
    customization: { modelSlot: 1, poseSlot: 2, faceAppearance: originalAppearance, wardrobeGroups: [{ modelSlot: 1, setId: 'wardrobe-1' }] }
  } as CustomizerCharacter
}

function element(overrides: Partial<EditorV6Element> = {}): EditorV6Element {
  return {
    id: 'element-1', kind: 'character', characterId: 'character-1', assetId: 'asset-1', text: 'Hero',
    x: 20, y: 30, width: 100, height: 120, rotation: 0, zIndex: 1, poseSlot: 2,
    faceAppearance: originalAppearance, faceTransforms: { leftEye: { x: 2 } },
    ...overrides
  }
}

function project(actor = element()): EditorV6Document {
  const asset: EditorV6Asset = { id: 'asset-1', category: 'character', name: 'Hero', mimeType: 'image/png', dataUrl: 'data:image/png;base64,old' }
  return {
    schemaVersion: 1, id: 'project-1', title: 'Project', color: '#ffffff',
    createdAt: '2026-11-10T12:00:00.000Z', updatedAt: '2026-11-10T12:00:00.000Z',
    backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0,
    backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    elements: [actor], assets: [asset], timeline: createEditorV6Timeline([actor])
  }
}

function preparedFace(baseMode: EditorV6FaceRenderMode = 'blink'): PreparedEditorV6FaceAppearance {
  const extraAsset: EditorV6Asset = { id: 'asset-blink', category: 'character', name: 'Hero · blink', mimeType: 'image/png', dataUrl: 'data:image/png;base64,blink', timelineSnapshot: true }
  return {
    baseMode,
    rendered: { canvas: {} as HTMLCanvasElement, width: 800, height: 600 },
    baked: { dataUrl: 'data:image/png;base64,next', crop: { dataUrl: 'data:image/png;base64,crop', width: 600, height: 400, left: 20, top: 30, sourceWidth: 800, sourceHeight: 600 }, assetIds: { talk: 'asset-talk' }, extraAssets: [extraAsset] },
    previousCrop: { dataUrl: 'data:image/png;base64,previous', width: 500, height: 300, left: 10, top: 12, sourceWidth: 800, sourceHeight: 600 }
  }
}

function preparedPose(): PreparedEditorV6PoseChange {
  return {
    baseMode: 'idle',
    baked: { dataUrl: 'data:image/png;base64,pose', crop: null, assetIds: { blink: 'pose-blink' }, extraAssets: [] },
    geometry: { characterCanvasWidth: 240, width: 100, height: 140 }
  }
}

function setup(overrides: Partial<Parameters<typeof createEditorV6CharacterAppearanceCommands>[0]> = {}) {
  const initialProject = project()
  let currentProject = initialProject
  const changeScene = vi.fn((update: (project: EditorV6Document) => EditorV6Document) => { currentProject = update(currentProject) })
  const patchDocument = vi.fn((update: (project: EditorV6Document) => EditorV6Document) => { currentProject = update(currentProject) })
  const renderer = {} as PreparedEditorV6FaceRenderer
  const dependencies: Parameters<typeof createEditorV6CharacterAppearanceCommands>[0] = {
    activeProject: initialProject,
    selectedElement: initialProject.elements[0],
    selectedCharacter: character(),
    faceBusy: false,
    setFaceBusy: vi.fn(),
    facePreview: {
      withRenderer: async <T,>(_source, _poseRevision, _modelRevision, operation: (renderer: PreparedEditorV6FaceRenderer) => Promise<T>) => operation(renderer)
    },
    sceneRef: { current: { clientWidth: 1600, clientHeight: 900 } as HTMLDivElement },
    poseSourceSnapshot: {
      projectId: initialProject.id,
      revisions: { '1:5': 'pose-rev-5' },
      modelRevisions: {},
      wardrobeRevisions: { '1:wardrobe-1': 'wardrobe-rev-1' },
      hairRevisions: {}, headExtraRevisions: {}, eyeRevisions: {}
    },
    prepareFaceAppearance: async () => preparedFace(),
    preparePoseChange: async () => preparedPose(),
    changeScene,
    patchDocument,
    setError: vi.fn(),
    now: () => '2026-11-10T13:00:00.000Z',
    ...overrides
  }
  return { dependencies, changeScene, patchDocument, getProject: () => currentProject, initialProject }
}

describe('comandos de aparência de personagem no Editor V6', () => {
  it('aplica uma aparência facial preparada ao snapshot, assets e versão do renderer', async () => {
    const prepared = preparedFace()
    const context = setup({ prepareFaceAppearance: async () => prepared })
    const commands = createEditorV6CharacterAppearanceCommands(context.dependencies)

    await commands.applyFaceAppearance(nextAppearance)

    const saved = context.getProject()
    expect(context.changeScene).toHaveBeenCalledOnce()
    expect(context.patchDocument).not.toHaveBeenCalled()
    expect(saved.elements[0]).toMatchObject({
      faceAppearance: nextAppearance,
      faceTransforms: { leftEye: { x: 2 } },
      faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION,
      faceModeAssetIds: { talk: 'asset-talk', blink: 'asset-1' },
      characterSourceUpdatedAt: 'character-source-2'
    })
    expect(saved.assets.find((asset) => asset.id === 'asset-1')?.dataUrl).toBe('data:image/png;base64,next')
    expect(saved.assets.some((asset) => asset.id === 'asset-blink')).toBe(true)
    expect(saved.updatedAt).toBe('2026-11-10T13:00:00.000Z')
    expect(context.dependencies.setFaceBusy).toHaveBeenNthCalledWith(1, true)
    expect(context.dependencies.setFaceBusy).toHaveBeenLastCalledWith(false)
    expect(context.dependencies.setError).toHaveBeenLastCalledWith(null)
  })

  it('usa patch sem histórico e preserva overrides de expressão explicitamente undefined', async () => {
    const context = setup({ prepareFaceAppearance: async () => preparedFace('talk') })
    const commands = createEditorV6CharacterAppearanceCommands(context.dependencies)

    await commands.applyFaceAppearance(nextAppearance, {}, false, { activeFaceMode: undefined, activeExpressionEffects: undefined })

    expect(context.changeScene).not.toHaveBeenCalled()
    expect(context.patchDocument).toHaveBeenCalledOnce()
    expect(Object.hasOwn(context.getProject().elements[0], 'activeFaceMode')).toBe(true)
    expect(context.getProject().elements[0].activeFaceMode).toBeUndefined()
    expect(context.getProject().elements[0].activeExpressionEffects).toBeUndefined()
    expect(context.getProject().elements[0].faceModeAssetIds?.talk).toBe('asset-1')
  })

  it('aplica nova pose e recalcula revisões da pose e das roupas', async () => {
    const prepared = preparedPose()
    const preparePoseChange = vi.fn(async () => prepared)
    const context = setup({ preparePoseChange })
    const commands = createEditorV6CharacterAppearanceCommands(context.dependencies)

    await commands.applyPose(5)

    const saved = context.getProject()
    expect(context.dependencies.preparePoseChange).toHaveBeenCalledWith({ character: context.dependencies.selectedCharacter, element: context.dependencies.selectedElement, poseSlot: 5 })
    expect(saved.elements[0]).toMatchObject({
      poseSlot: 5,
      poseSourceRevision: 'pose-rev-5',
      wardrobeSourceRevision: expect.stringMatching(/^wardrobe-v1:/),
      characterCanvasWidth: 240,
      width: 100,
      height: 140,
      faceModeAssetIds: { blink: 'pose-blink', idle: 'asset-1' },
      characterSourceUpdatedAt: 'character-source-2'
    })
    expect(saved.assets.find((asset) => asset.id === 'asset-1')?.dataUrl).toBe('data:image/png;base64,pose')
    expect(context.changeScene).toHaveBeenCalledOnce()
    expect(context.patchDocument).not.toHaveBeenCalled()
    expect(context.dependencies.setFaceBusy).toHaveBeenLastCalledWith(false)
  })

  it('converte falha da preparação em erro visível e libera o estado ocupado', async () => {
    const context = setup({ preparePoseChange: async () => { throw new Error('falha sintética de pose') } })
    const commands = createEditorV6CharacterAppearanceCommands(context.dependencies)

    await expect(commands.applyPose(5)).resolves.toBeUndefined()

    expect(context.dependencies.setError).toHaveBeenCalledWith('falha sintética de pose')
    expect(context.dependencies.setFaceBusy).toHaveBeenLastCalledWith(false)
    expect(context.changeScene).not.toHaveBeenCalled()
  })
})
