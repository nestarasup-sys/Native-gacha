import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { EditorV6Asset, EditorV6Element } from '../../src/shared/editorV6'
import type { PreparedEditorV6FaceRenderer } from '../../src/renderer/src/features/editorV6/faceModeAssets'
import { prepareEditorV6PoseChange } from '../../src/renderer/src/features/editorV6/editorV6PosePreparation'

function character(): CustomizerCharacter {
  return { id: 'character-1', name: 'Hero', updatedAt: 'source-1', customization: { modelSlot: 1, poseSlot: 2 } } as CustomizerCharacter
}

function element(overrides: Partial<EditorV6Element> = {}): EditorV6Element {
  return {
    id: 'element-1', kind: 'character', assetId: 'asset-1', characterId: 'character-1', text: 'Hero',
    x: 10, y: 20, width: 120, height: 180, rotation: 0, zIndex: 1, poseSlot: 2,
    activeFaceMode: 'idle', faceTransforms: {}, activeExpressionEffects: {}, ...overrides
  }
}

function renderer(width: number, height: number) {
  return {
    renderToCanvas: vi.fn().mockResolvedValue({ canvas: { width, height } as HTMLCanvasElement, width, height }),
    dispose: vi.fn()
  } as unknown as PreparedEditorV6FaceRenderer
}

function dependencies(renderers: PreparedEditorV6FaceRenderer[]) {
  return {
    prepareRenderer: vi.fn(async () => renderers.shift()!),
    bakeAssets: vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,baked', crop: null, assetIds: {}, extraAssets: [] as EditorV6Asset[]
    })),
    trimCanvas: vi.fn(() => ({ dataUrl: 'data:image/png;base64,crop', width: 400, height: 300, left: 10, top: 10, sourceWidth: 800, sourceHeight: 600 })),
    faceModeForElement: vi.fn(() => 'idle' as const),
    getStageSize: vi.fn(() => ({ width: 1600, height: 900 })),
    faceRenderGeometry: vi.fn((input: EditorV6Element) => ({
      characterCanvasWidth: input.characterCanvasWidth!, width: input.width, height: input.height
    }))
  }
}

describe('preparação de pose do Editor V6', () => {
  it('mantém a largura visual ao medir o canvas legado e libera ambos os renderers', async () => {
    const currentRenderer = renderer(800, 600)
    const poseRenderer = renderer(900, 700)
    const deps = dependencies([currentRenderer, poseRenderer])

    const result = await prepareEditorV6PoseChange({
      character: character(), element: element(), poseSlot: 5
    }, deps)

    expect(deps.prepareRenderer).toHaveBeenCalledTimes(2)
    expect(deps.prepareRenderer.mock.calls[0][0].customization.poseSlot).toBe(2)
    expect(deps.prepareRenderer.mock.calls[1][0].customization.poseSlot).toBe(5)
    expect(currentRenderer.renderToCanvas).toHaveBeenCalledWith(undefined, {}, {}, 'idle')
    expect(deps.bakeAssets).toHaveBeenCalledWith('Hero', poseRenderer, undefined, {}, {}, 'idle', expect.objectContaining({ width: 900, height: 700 }))
    expect(deps.faceRenderGeometry).toHaveBeenCalledWith(expect.objectContaining({ characterCanvasWidth: 240 }), expect.objectContaining({ width: 900, height: 700 }), null, 1600, 900)
    expect(result.geometry.characterCanvasWidth).toBe(240)
    expect(currentRenderer.dispose).toHaveBeenCalledOnce()
    expect(poseRenderer.dispose).toHaveBeenCalledOnce()
  })

  it('pula a medição anterior quando o projeto já tem largura-base salva', async () => {
    const poseRenderer = renderer(900, 700)
    const deps = dependencies([poseRenderer])

    await prepareEditorV6PoseChange({
      character: character(), element: element({ characterCanvasWidth: 260 }), poseSlot: null
    }, deps)

    expect(deps.prepareRenderer).toHaveBeenCalledOnce()
    expect(deps.trimCanvas).not.toHaveBeenCalled()
    expect(deps.faceRenderGeometry).toHaveBeenCalledWith(expect.objectContaining({ characterCanvasWidth: 260 }), expect.anything(), null, 1600, 900)
    expect(deps.getStageSize).toHaveBeenCalledOnce()
    expect(poseRenderer.dispose).toHaveBeenCalledOnce()
  })

  it('libera o renderer se a preparação das imagens da pose falhar', async () => {
    const poseRenderer = renderer(900, 700)
    const deps = dependencies([poseRenderer])
    deps.bakeAssets.mockRejectedValue(new Error('falha sintética'))

    await expect(prepareEditorV6PoseChange({
      character: character(), element: element({ characterCanvasWidth: 260 }), poseSlot: 5
    }, deps)).rejects.toThrow('falha sintética')

    expect(poseRenderer.dispose).toHaveBeenCalledOnce()
  })
})
