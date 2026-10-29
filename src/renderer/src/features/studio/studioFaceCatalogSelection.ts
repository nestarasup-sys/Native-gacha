import type { CustomizerFaceAppearance } from '../../../../shared/customizer'

/** Sheet images needed to render the currently selected character face. */
export function studioFaceCatalogSelectionIds(
  appearance: CustomizerFaceAppearance | undefined,
  fallbackOpenMouthId?: string
): string[] {
  if (!appearance) return []

  return Array.from(new Set([
    appearance.eyeCatalogId,
    appearance.eyebrowCatalogId,
    appearance.noseCatalogId,
    appearance.mouthClosedCatalogId,
    appearance.mouthOpenCatalogId ?? fallbackOpenMouthId
  ].filter((id): id is string => typeof id === 'string' && id.length > 0)))
}
