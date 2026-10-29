import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { FaceSheetKind } from '../../../../shared/fabricator'

export type EditorV6FaceCategory = 'eyes' | 'eyebrows' | 'nose' | 'mouth'

export function editorV6FaceSheetKind(category: EditorV6FaceCategory, mode: 'idle' | 'blink' | 'talk' | 'talk-blink'): FaceSheetKind {
  if (category !== 'mouth') return category
  return mode === 'talk' ? 'mouth-open' : 'mouth-closed'
}

export function editorV6SelectedFaceCatalogItemId(
  category: EditorV6FaceCategory,
  mode: 'idle' | 'blink' | 'talk' | 'talk-blink',
  appearance: CustomizerFaceAppearance | undefined,
  fallbackOpenMouthId?: string
): string | undefined {
  const kind = editorV6FaceSheetKind(category, mode)
  if (kind === 'eyes') return appearance?.eyeCatalogId
  if (kind === 'eyebrows') return appearance?.eyebrowCatalogId
  if (kind === 'nose') return appearance?.noseCatalogId
  if (kind === 'mouth-open') return appearance?.mouthOpenCatalogId ?? fallbackOpenMouthId
  return appearance?.mouthClosedCatalogId
}

export function editorV6FaceDetailIds(selectedId?: string, openMouthId?: string): string[] {
  return [...new Set([selectedId, openMouthId].filter((id): id is string => Boolean(id)))]
}

export function editorV6FaceDetailsAreLoading(modelSlot: number | null, itemIds: readonly string[], loadingKeys: ReadonlySet<string>): boolean {
  return modelSlot !== null && itemIds.some((id) => loadingKeys.has(`${modelSlot}:${id}`))
}
