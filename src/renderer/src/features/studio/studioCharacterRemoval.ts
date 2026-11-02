import type { StudioDocument, StudioElement } from '../../../../shared/studio'

/** Removes a character from its scene and drops its render asset only after the scene releases every reference. */
export function removeStudioCharacterElement(
  studio: StudioDocument,
  element: StudioElement,
  updatedAt: string
): StudioDocument {
  const elements = studio.elements.filter((item) => item.id !== element.id)
  const referencedAssetIds = new Set(elements.map((item) => item.assetId).filter((id): id is string => Boolean(id)))
  if (studio.backgroundAssetId) referencedAssetIds.add(studio.backgroundAssetId)

  return {
    ...studio,
    elements,
    assets: studio.assets.filter((asset) => asset.id !== element.assetId || referencedAssetIds.has(asset.id)),
    updatedAt
  }
}
