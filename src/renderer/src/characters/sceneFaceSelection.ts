import type { CustomizerFaceAppearance } from '../../../shared/customizer'
import type { FaceSheetKind } from '../../../shared/fabricator'
import type { SceneFaceMode, SceneFaceTransform, SceneFaceTransforms } from '../../../shared/sceneFaceValidation'

export type SceneFaceCategory = 'eyes' | 'eyebrows' | 'nose' | 'mouth'
/** Editor V6 also passes its combined render mode; only explicit `talk` selects the open-mouth sheet. */
export type SceneFaceSelectionMode = SceneFaceMode | 'talk-blink'

export function sceneFaceSheetKind(category: SceneFaceCategory, mode: SceneFaceSelectionMode): FaceSheetKind {
  if (category !== 'mouth') return category
  return mode === 'talk' ? 'mouth-open' : 'mouth-closed'
}

export function sceneFaceCatalogItemId(
  category: SceneFaceCategory,
  mode: SceneFaceSelectionMode,
  appearance: CustomizerFaceAppearance | undefined,
  fallbackOpenMouthId?: string
): string | undefined {
  const kind = sceneFaceSheetKind(category, mode)
  if (kind === 'eyes') return appearance?.eyeCatalogId
  if (kind === 'eyebrows') return appearance?.eyebrowCatalogId
  if (kind === 'nose') return appearance?.noseCatalogId
  if (kind === 'mouth-open') return appearance?.mouthOpenCatalogId ?? fallbackOpenMouthId
  return appearance?.mouthClosedCatalogId
}

export function createDefaultSceneFaceTransform(): SceneFaceTransform {
  return { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
}

export function resolveSceneFaceTransform(
  category: SceneFaceCategory,
  sheetKind: FaceSheetKind,
  selectedItemId: string | undefined,
  appearance: CustomizerFaceAppearance | undefined,
  faceTransforms: SceneFaceTransforms | undefined
): { transformKey: string; transform: SceneFaceTransform } {
  const transformKey = category === 'mouth' ? 'mouth' : selectedItemId ? `${sheetKind}:${selectedItemId}` : category
  const legacyMouthTransform = appearance?.mouthClosedCatalogId
    ? faceTransforms?.[`mouth-closed:${appearance.mouthClosedCatalogId}`]
    : appearance?.mouthOpenCatalogId
      ? faceTransforms?.[`mouth-open:${appearance.mouthOpenCatalogId}`]
      : undefined
  const transform = faceTransforms?.[transformKey]
    ?? (category === 'mouth' ? (selectedItemId ? faceTransforms?.[`${sheetKind}:${selectedItemId}`] : undefined) ?? legacyMouthTransform : undefined)
    ?? faceTransforms?.[category]
    ?? createDefaultSceneFaceTransform()

  return { transformKey, transform }
}
