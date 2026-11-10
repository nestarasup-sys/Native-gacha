import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../src/shared/customizer'
import type { EditorV6Asset } from '../../src/shared/editorV6'
import type { PoseRevisionSnapshot } from '../../src/renderer/src/features/editorV6/editorV6CharacterSourceModel'
import type { PreparedEditorV6FaceRenderer } from '../../src/renderer/src/features/editorV6/faceModeAssets'
import type { editorV6CharacterStageReference } from '../../src/renderer/src/features/editorV6/editorV6CharacterStageReference'
import { prepareEditorV6CastSnapshots } from '../../src/renderer/src/features/editorV6/editorV6CastSnapshots'

type StageReference = Awaited<ReturnType<typeof editorV6CharacterStageReference>>
const appearance = { modelSlot: 1, setId: 'face-a' } as CustomizerFaceAppearance

function character(id: string, modelSlot: number, poseSlot?: number, faceAppearance?: CustomizerFaceAppearance): CustomizerCharacter {
  return {
    id, name: `Personagem ${id}`, updatedAt: `source-${id}`,
    customization: { modelSlot, poseSlot, ...(faceAppearance ? { faceAppearance } : {}) }
  } as CustomizerCharacter
}

function renderer(width: number, height: number): PreparedEditorV6FaceRenderer {
  return {
    renderToCanvas: vi.fn().mockResolvedValue({ canvas: { width, height } as HTMLCanvasElement, width, height }),
    dispose: vi.fn()
  } as unknown as PreparedEditorV6FaceRenderer
}

function baked(name: string) {
  return {
    dataUrl: `data:image/png;base64,${name}`,
    crop: { dataUrl: `data:image/png;base64,crop-${name}`, width: 300, height: 500, left: 0, top: 0, sourceWidth: 400, sourceHeight: 600 },
    assetIds: { blink: `blink-${name}` },
    extraAssets: [{ id: `extra-${name}`, category: 'character', name: `blink-${name}`, mimeType: 'image/png', dataUrl: `data:image/png;base64,extra-${name}`, timelineSnapshot: true } as EditorV6Asset]
  }
}

describe('snapshots de elenco do Editor V6', () => {
  it('reutiliza referência por modelo e preserva escala, poses, revisões e assets faciais', async () => {
    const renderers = [renderer(400, 600), renderer(420, 620), renderer(500, 700)]
    const references: StageReference[] = [
      { rendered: { width: 400, height: 600 }, crop: { width: 200, height: 500 } },
      { rendered: { width: 500, height: 700 }, crop: { width: 250, height: 600 } }
    ]
    const sourceSnapshot: PoseRevisionSnapshot = {
      projectId: 'project-1', revisions: { '1:2': 'pose-one' }, modelRevisions: { '1': 'model-one', '2': 'model-two' },
      wardrobeRevisions: {}, hairRevisions: {}, headExtraRevisions: {}, eyeRevisions: {}
    }
    let nextId = 0
    const deps = {
      prepareRenderer: vi.fn(async () => renderers.shift()!),
      bakeAssets: vi.fn(async (name: string) => baked(name)),
      getStageReference: vi.fn(async () => references.shift()!),
      fitToStage: vi.fn(() => ({ characterCanvasWidth: 240, width: 100, height: 150 })),
      createId: () => `created-${++nextId}`
    }

    const result = await prepareEditorV6CastSnapshots({
      characters: [character('a', 1, 2, appearance), character('b', 1, 2), character('c', 2)],
      startZIndex: 6, stageWidth: 1600, stageHeight: 900, sourceSnapshot
    }, deps)

    expect(result.elements.map((item) => item.zIndex)).toEqual([7, 8, 9])
    expect(result.elements.map((item) => item.id)).toEqual(['created-2', 'created-4', 'created-6'])
    expect(result.assets.filter((asset) => asset.category === 'character' && !asset.timelineSnapshot).map((asset) => asset.id))
      .toEqual(['created-1', 'created-3', 'created-5'])
    expect(result.assets).toHaveLength(6)
    expect(deps.getStageReference).toHaveBeenCalledTimes(2)
    expect(deps.fitToStage).toHaveBeenCalledTimes(3)
    expect(deps.fitToStage).toHaveBeenNthCalledWith(1,
      { width: 400, height: 600 }, { width: 200, height: 500 }, expect.objectContaining({ width: 400, height: 600 }),
      { width: 300, height: 500 }, 1600, 900)
    expect(result.elements[0]).toMatchObject({
      assetId: 'created-1', faceModeAssetIds: { blink: 'blink-Personagem a', idle: 'created-1' },
      characterSourceUpdatedAt: 'source-a', modelSourceRevision: 'model-one', poseSourceRevision: 'pose-one', characterCanvasWidth: 240
    })
    expect(result.elements[0].expressionBase?.appearance).toEqual(appearance)
    expect(result.elements[0].expressionBase?.appearance).not.toBe(appearance)
    expect(result.elements[2].modelSourceRevision).toBe('model-two')
    expect(result.elements[2].poseSourceRevision).toBeUndefined()
    expect(renderers).toHaveLength(0)
  })

  it('libera o renderer e não produz snapshots quando a renderização falha', async () => {
    const failingRenderer = renderer(400, 600)
    vi.mocked(failingRenderer.renderToCanvas).mockRejectedValue(new Error('falha sintética'))
    const deps = {
      prepareRenderer: vi.fn(async () => failingRenderer),
      bakeAssets: vi.fn(async (name: string) => baked(name)),
      getStageReference: vi.fn(async () => ({ rendered: { width: 400, height: 600 }, crop: { width: 200, height: 500 } })),
      fitToStage: vi.fn(() => ({ characterCanvasWidth: 240, width: 100, height: 150 })),
      createId: () => 'unused'
    }

    await expect(prepareEditorV6CastSnapshots({
      characters: [character('a', 1)], startZIndex: 0, stageWidth: 1000, stageHeight: 562, sourceSnapshot: null
    }, deps)).rejects.toThrow('falha sintética')

    expect(failingRenderer.dispose).toHaveBeenCalledOnce()
    expect(deps.getStageReference).not.toHaveBeenCalled()
  })
})
