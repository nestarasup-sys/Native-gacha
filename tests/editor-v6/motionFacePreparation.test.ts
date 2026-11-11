import { describe, expect, it, vi } from 'vitest'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import type { CharacterCustomization, CustomizerFaceAppearance } from '../../src/shared/customizer'
import type { EditorV6Element } from '../../src/shared/editorV6'
import { cacheEditorV6MotionAssetProvider } from '../../src/renderer/src/features/editorV6/motion/motionAssetProviderCache'
import { prepareEditorV6MotionFacePair, scaleEditorV6MotionMouth } from '../../src/renderer/src/features/editorV6/motion/motionFacePreparation'
import { interpolateEditorV6Face } from '../../src/shared/editorV6MotionInterpolation'

const transform = { x: 11, y: 12, scaleX: 1.1, scaleY: 1.2, rotation: 13 }
const defaultEffects = { shadow: { enabled: true }, blush: { enabled: true }, mouthBlush: { enabled: true } } as never
const appearance = (overrides: Partial<CustomizerFaceAppearance> = {}): CustomizerFaceAppearance => ({
  modelSlot: 1, eyeCatalogId: 'eye-sheet', components: { nose: { assetId: 'nose-component' } },
  eyeState: 0, eyebrows: true, noseIndex: 0, expressionIndex: 4, mouthOpen: false,
  ...overrides
})
const element = (overrides: Partial<EditorV6Element> = {}): EditorV6Element => ({
  id: 'actor', kind: 'character', text: 'actor', x: 0, y: 0, width: 100, height: 200, rotation: 0, zIndex: 1,
  ...overrides
})
const provider = (overrides: Record<string, unknown> = {}) => {
  const methods = {
    loadFabricatorSlot: vi.fn(async () => null),
    loadFabricatorPose: vi.fn(async () => null),
    loadHairStyle: vi.fn(async () => null),
    loadWardrobeSet: vi.fn(async () => null),
    loadFaceSet: vi.fn(async () => null),
    listFaceComponentAssets: vi.fn(async () => []),
    loadFaceComponentAsset: vi.fn(async () => null),
    listFaceCatalog: vi.fn(async () => []),
    loadFaceCatalogItem: vi.fn(async () => null),
    listFaceExpressionPresets: vi.fn(async () => []),
    loadFaceExpressionPreset: vi.fn(async () => null),
    ...overrides
  }
  return { assetProvider: cacheEditorV6MotionAssetProvider(methods as unknown as CharacterRenderAssetProvider), methods }
}

describe('Editor V6 motion face preparation', () => {
  it('leaves endpoints without face appearance intact and avoids catalog reads', async () => {
    const from = element({ id: 'from' }), to = element({ id: 'to' })
    const { assetProvider, methods } = provider()
    const pair = await prepareEditorV6MotionFacePair(from, to, {}, assetProvider)

    expect(pair).toEqual([from, to])
    expect(methods.loadFaceCatalogItem).not.toHaveBeenCalled()
    expect(methods.loadFaceComponentAsset).not.toHaveBeenCalled()
  })

  it('loads missing defaults, clones endpoint data and preserves authored expression overrides', async () => {
    const selectedAppearance = appearance()
    const from = element({ faceTransforms: { 'expression:eye-left': { x: 1, y: 2, width: 3, height: 4, rotation: 5 } }, activeExpressionEffects: defaultEffects })
    const authoredOverride = { x: 9, y: 8, scaleX: 0.7, scaleY: 0.6, rotation: 4 }
    const to = element({ faceTransforms: { 'expression-component:nose': { x: 6, y: 7, width: 8, height: 9, rotation: 10, sourceTransformOverride: authoredOverride } }, activeExpressionEffects: defaultEffects })
    const catalogRead = vi.fn(async () => ({ transforms: { 'eye-left': transform, 'eye-right': transform } }))
    const componentRead = vi.fn(async () => ({ defaultTransform: authoredOverride }))
    const { assetProvider } = provider({ loadFaceCatalogItem: catalogRead, loadFaceComponentAsset: componentRead })

    const customization = { modelSlot: 3, faceAppearance: selectedAppearance } as Pick<CharacterCustomization, 'modelSlot' | 'faceAppearance'>
    const [preparedFrom, preparedTo] = await prepareEditorV6MotionFacePair(from, to, customization, assetProvider)

    expect(catalogRead).toHaveBeenCalledOnce()
    expect(catalogRead).toHaveBeenCalledWith(3, 'eye-sheet')
    expect(componentRead).toHaveBeenCalledOnce()
    expect(preparedFrom.faceAppearance?.transforms?.['eye-left']).toEqual(transform)
    expect(preparedFrom.faceAppearance?.components?.nose?.transform).toEqual(authoredOverride)
    expect(preparedFrom.faceTransforms?.['expression:eye-left']?.sourceTransformOverride).toEqual(transform)
    expect(preparedTo.faceTransforms?.['expression:eye-left']?.sourceTransformOverride).toEqual(transform)
    expect(preparedTo.faceTransforms?.['expression-component:nose']?.sourceTransformOverride).toEqual(authoredOverride)
    expect(preparedFrom.activeExpressionEffects).toEqual(defaultEffects)
    expect(from.faceAppearance).toBeUndefined()
    expect(from.faceTransforms?.['expression:eye-left']?.sourceTransformOverride).toBeUndefined()
  })

  it('loads standard expression effects when the endpoint has no saved effect state', async () => {
    const effect = { enabled: true, color: '#ff0000', opacity: 0.5, softness: 0.25, size: 10, offsetY: 2 }
    const sourceEffects = { shadow: effect, blush: effect, mouthBlush: effect }
    const presetList = vi.fn(async () => [{ id: 'standard-4', expressionIndex: 4 }])
    const loadPreset = vi.fn(async () => ({ id: 'standard-4', expressionIndex: 4, effects: sourceEffects }))
    const { assetProvider } = provider({ listFaceExpressionPresets: presetList, loadFaceExpressionPreset: loadPreset })
    const state = element({ faceAppearance: appearance({ components: {}, eyeCatalogId: undefined }) })

    const [from, to] = await prepareEditorV6MotionFacePair(state, state, { modelSlot: 2 }, assetProvider)

    expect(from.activeExpressionEffects).toEqual({
      shadow: { ...effect, enabled: false }, blush: { ...effect, enabled: false }, mouthBlush: effect
    })
    expect(to.activeExpressionEffects).toEqual(from.activeExpressionEffects)
    expect(presetList).toHaveBeenCalledOnce()
    expect(loadPreset).toHaveBeenCalledOnce()
  })

  it('scales only the exported mouth transform and preserves identity for a neutral scale', () => {
    const face = {
      appearance: appearance({ mouthClosedCatalogId: 'closed' }),
      transforms: { 'mouth-closed:closed': { x: 30, y: 40, width: 50, height: 60, rotation: 7 } },
      effects: defaultEffects,
      mode: 'talk'
    } as unknown as Awaited<ReturnType<typeof interpolateEditorV6Face>>

    expect(scaleEditorV6MotionMouth(face, 1)).toBe(face)
    const scaled = scaleEditorV6MotionMouth(face, 0.5)
    expect(scaled.transforms.mouth).toEqual({ x: 30, y: 40, width: 25, height: 30, rotation: 7 })
    expect(face.transforms.mouth).toBeUndefined()
  })
})
