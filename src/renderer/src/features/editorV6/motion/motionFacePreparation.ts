import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'
import type { CharacterCustomization, FaceComponentPartId } from '../../../../../shared/customizer'
import type { FaceElementKind, FaceTransform } from '../../../../../shared/fabricator'
import type { EditorV6Element, EditorV6FaceTransform } from '../../../../../shared/editorV6'
import { interpolateEditorV6Face } from '../../../../../shared/editorV6MotionInterpolation'
import { loadStandardExpressionEffects } from '../../../characters/editorV6CharacterRenderer'

type MotionFaceCustomization = Pick<CharacterCustomization, 'modelSlot' | 'faceAppearance'>
type InterpolatedFace = Awaited<ReturnType<typeof interpolateEditorV6Face>>

const neutralFaceTransform = (): EditorV6FaceTransform => ({ x: 0, y: 0, width: 100, height: 100, rotation: 0 })

/** Scales only the interpolated mouth placement used by export samples. */
export function scaleEditorV6MotionMouth(face: InterpolatedFace, factor: number): InterpolatedFace {
  if (factor === 1) return face
  const appearance = face.appearance
  const transforms = { ...face.transforms }
  const source = transforms.mouth
    ?? (appearance?.mouthClosedCatalogId ? transforms[`mouth-closed:${appearance.mouthClosedCatalogId}`] : undefined)
    ?? (appearance?.mouthOpenCatalogId ? transforms[`mouth-open:${appearance.mouthOpenCatalogId}`] : undefined)
    ?? transforms['mouth-open']
    ?? transforms['mouth-closed']
    ?? neutralFaceTransform()
  transforms.mouth = { ...source, width: source.width * factor, height: source.height * factor }
  return { ...face, transforms }
}

/** Resolves missing catalog transforms and calibrates both endpoints before interpolation. */
export async function prepareEditorV6MotionFacePair(
  fromState: EditorV6Element,
  toState: EditorV6Element,
  customization: MotionFaceCustomization,
  provider: CharacterRenderAssetProvider
): Promise<[EditorV6Element, EditorV6Element]> {
  const [from, to] = await Promise.all([
    prepareFace(structuredClone(fromState), customization, provider),
    prepareFace(structuredClone(toState), customization, provider)
  ])
  calibratePair(from, to)
  return [from, to]
}

async function prepareFace(state: EditorV6Element, customization: MotionFaceCustomization, provider: CharacterRenderAssetProvider): Promise<EditorV6Element> {
  const appearance = structuredClone(state.faceAppearance ?? customization.faceAppearance)
  if (!appearance) return state
  const slot = customization.modelSlot ?? 1
  appearance.transforms = { ...appearance.transforms }
  appearance.components = { ...appearance.components }
  const ids: Partial<Record<FaceElementKind, string>> = {
    'eye-left': appearance.eyeLeftCatalogId ?? appearance.eyeCatalogId,
    'eye-right': appearance.eyeRightCatalogId ?? appearance.eyeCatalogId,
    'brow-left': appearance.eyebrowLeftCatalogId ?? appearance.eyebrowCatalogId,
    'brow-right': appearance.eyebrowRightCatalogId ?? appearance.eyebrowCatalogId,
    nose: appearance.noseCatalogId,
    mouth: appearance.mouthClosedCatalogId ?? appearance.mouthOpenCatalogId
  }
  for (const [part, id] of Object.entries(ids)) if (id && !appearance.transforms[part as FaceElementKind]) {
    const item = await provider.loadFaceCatalogItem(slot, id)
    const transform = item?.transforms[part as FaceElementKind]
    if (transform) appearance.transforms[part as FaceElementKind] = transform
  }
  for (const [key, selected] of Object.entries(appearance.components)) if (selected?.assetId && !selected.transform) {
    const component = await provider.loadFaceComponentAsset(slot, selected.assetId)
    if (component) appearance.components[key as FaceComponentPartId] = { ...selected, transform: component.defaultTransform }
  }
  const effects = state.activeExpressionEffects ?? (await loadStandardExpressionEffects(slot, provider))[appearance.expressionIndex]
  return { ...state, faceAppearance: appearance, faceTransforms: { ...state.faceTransforms }, activeExpressionEffects: effects }
}

function calibratePair(from: EditorV6Element, to: EditorV6Element) {
  const keys = new Set([...Object.keys(from.faceTransforms ?? {}), ...Object.keys(to.faceTransforms ?? {})])
  for (const state of [from, to]) for (const key of keys) {
    if (!key.startsWith('expression')) continue
    const existing = state.faceTransforms?.[key]
    if (existing?.sourceTransformOverride) continue
    let baseline: FaceTransform | undefined
    if (key.startsWith('expression-component:')) baseline = state.faceAppearance?.components?.[key.split(':')[1] as FaceComponentPartId]?.transform
    else { const part = key.split(':')[1]; baseline = state.faceAppearance?.transforms?.[(part.startsWith('mouth') ? 'mouth' : part) as FaceElementKind] }
    if (baseline) { state.faceTransforms ??= {}; state.faceTransforms[key] = { ...(existing ?? neutralFaceTransform()), sourceTransformOverride: baseline } }
  }
}
