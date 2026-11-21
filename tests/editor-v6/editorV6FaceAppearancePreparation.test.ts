import { describe, expect, it, vi } from 'vitest'
import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../src/shared/customizer'
import type { EditorV6Asset, EditorV6Element, EditorV6FaceRenderMode } from '../../src/shared/editorV6'
import type { FaceExpressionEffects } from '../../src/shared/fabricator'
import type { PreparedEditorV6FaceRenderer } from '../../src/renderer/src/features/editorV6/faceModeAssets'
import { prepareEditorV6FaceAppearance } from '../../src/renderer/src/features/editorV6/editorV6FaceAppearancePreparation'
import { createEditorV6InteractiveFaceBakes } from '../../src/renderer/src/features/editorV6/editorV6InteractiveFaceBakes'

const oldAppearance = { modelSlot: 1, setId: 'old' } as CustomizerFaceAppearance
const newAppearance = { modelSlot: 1, setId: 'new' } as CustomizerFaceAppearance
const faceEffect = { enabled: false, color: '#000000', opacity: 0, softness: 0, size: 0, offsetY: 0 }
const oldEffects: FaceExpressionEffects = { shadow: faceEffect, blush: faceEffect, mouthBlush: faceEffect }
const nextTransforms = {}

function character(): CustomizerCharacter {
  return { id: 'character-1', name: 'Hero', customization: { modelSlot: 1, faceAppearance: oldAppearance } } as CustomizerCharacter
}

function element(overrides: Partial<EditorV6Element> = {}): EditorV6Element {
  return {
    id: 'element-1', kind: 'character', characterId: 'character-1', assetId: 'asset-1', text: 'Hero',
    x: 0, y: 0, width: 100, height: 120, rotation: 0, zIndex: 0,
    faceAppearance: oldAppearance, faceTransforms: {}, activeExpressionEffects: oldEffects, activeFaceMode: 'blink',
    ...overrides
  }
}

function renderer(): PreparedEditorV6FaceRenderer {
  return {
    renderToCanvas: vi.fn()
      .mockResolvedValueOnce({ canvas: { width: 800, height: 600 } as HTMLCanvasElement, width: 800, height: 600 })
      .mockResolvedValueOnce({ canvas: { width: 810, height: 610 } as HTMLCanvasElement, width: 810, height: 610 }),
    dispose: vi.fn()
  } as unknown as PreparedEditorV6FaceRenderer
}

function dependencies(mode: EditorV6FaceRenderMode = 'talk') {
  return {
    interactiveBakes: createEditorV6InteractiveFaceBakes(),
    faceModeForElement: vi.fn(() => mode),
    measureCrop: vi.fn(async () => ({ width: 500, height: 400, left: 10, top: 20 })),
    bakeAssets: vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,new-face', crop: null, assetIds: {}, extraAssets: [] as EditorV6Asset[]
    }))
  }
}

describe('preparação de aparência facial do Editor V6', () => {
  it('reaproveita as variantes e o recorte de uma expressão já preparada, com IDs novos', async () => {
    const faceRenderer = renderer()
    vi.mocked(faceRenderer.renderToCanvas).mockResolvedValue({ canvas: {} as HTMLCanvasElement, width: 800, height: 600 })
    const deps = dependencies('blink')
    deps.bakeAssets.mockImplementation(async () => ({
      dataUrl: 'data:image/png;base64,new-face', crop: null, assetIds: { idle: 'idle' },
      extraAssets: [{ id: 'idle', category: 'character', name: 'Hero · idle', mimeType: 'image/png', dataUrl: 'data:image/png;base64,idle', timelineSnapshot: true }]
    }))
    const apply = (from: CustomizerFaceAppearance, to: CustomizerFaceAppearance) => prepareEditorV6FaceAppearance({
      character: character(), element: element({ faceAppearance: from }), appearance: to, faceTransforms: {}
    }, faceRenderer, deps)

    const first = await apply(oldAppearance, newAppearance)
    await apply(newAppearance, oldAppearance)
    const repeated = await apply(oldAppearance, newAppearance)

    expect(faceRenderer.renderToCanvas).toHaveBeenCalledTimes(3)
    expect(deps.measureCrop).toHaveBeenCalledOnce()
    expect(deps.bakeAssets).toHaveBeenCalledTimes(2)
    expect(repeated.previousCrop).toBeNull()
    expect(repeated.baked.dataUrl).toBe(first.baked.dataUrl)
    expect(repeated.baked.assetIds.idle).not.toBe(first.baked.assetIds.idle)
    expect(repeated.baked.extraAssets[0].id).toBe(repeated.baked.assetIds.idle)
  })

  it('renderiza a aparência anterior para preservar o crop e assa a nova usando a expressão atual', async () => {
    const faceRenderer = renderer()
    const deps = dependencies()
    const sourceElement = element()

    const prepared = await prepareEditorV6FaceAppearance({
      character: character(), element: sourceElement, appearance: newAppearance, faceTransforms: nextTransforms
    }, faceRenderer, deps)

    expect(faceRenderer.renderToCanvas).toHaveBeenNthCalledWith(1, oldAppearance, {}, oldEffects, 'blink')
    expect(faceRenderer.renderToCanvas).toHaveBeenNthCalledWith(2, newAppearance, nextTransforms, oldEffects, 'blink')
    expect(deps.faceModeForElement).not.toHaveBeenCalled()
    expect(deps.measureCrop).toHaveBeenCalledWith('Hero', faceRenderer, oldAppearance, {}, oldEffects, 'blink', expect.objectContaining({ width: 800, height: 600 }))
    expect(deps.bakeAssets).toHaveBeenCalledWith('Hero', faceRenderer, newAppearance, nextTransforms, oldEffects, 'blink', expect.objectContaining({ width: 810, height: 610 }))
    expect(prepared.baseMode).toBe('blink')
    expect(prepared.previousCrop?.width).toBe(500)
  })

  it('respeita propriedades de expressão explicitamente definidas como undefined', async () => {
    const faceRenderer = renderer()
    const deps = dependencies('talk-blink')

    await prepareEditorV6FaceAppearance({
      character: character(), element: element(), appearance: newAppearance, faceTransforms: nextTransforms,
      expressionState: { activeExpressionEffects: undefined, activeFaceMode: undefined }
    }, faceRenderer, deps)

    expect(faceRenderer.renderToCanvas).toHaveBeenNthCalledWith(2, newAppearance, nextTransforms, undefined, 'talk-blink')
    expect(deps.faceModeForElement).toHaveBeenCalledWith(expect.anything(), newAppearance)
    expect(deps.bakeAssets).toHaveBeenCalledWith('Hero', faceRenderer, newAppearance, nextTransforms, undefined, 'talk-blink', expect.anything())
  })
})
