import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
import { sceneFaceCatalogItemId, sceneFaceSheetKind, type SceneFaceCategory } from '../../characters/sceneFaceSelection'

export type EditorV6FaceCategory = SceneFaceCategory

export const editorV6FaceSheetKind = sceneFaceSheetKind

export function editorV6SelectedFaceCatalogItemId(
  category: EditorV6FaceCategory,
  mode: 'idle' | 'blink' | 'talk' | 'talk-blink',
  appearance: CustomizerFaceAppearance | undefined,
  fallbackOpenMouthId?: string
): string | undefined {
  return sceneFaceCatalogItemId(category, mode, appearance, fallbackOpenMouthId)
}

export function editorV6FaceDetailIds(selectedId?: string, openMouthId?: string): string[] {
  return [...new Set([selectedId, openMouthId].filter((id): id is string => Boolean(id)))]
}

export function editorV6FaceDetailsAreLoading(modelSlot: number | null, itemIds: readonly string[], loadingKeys: ReadonlySet<string>): boolean {
  return modelSlot !== null && itemIds.some((id) => loadingKeys.has(`${modelSlot}:${id}`))
}
