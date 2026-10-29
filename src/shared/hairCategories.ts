import type { CustomizerCharacter, HairPartId } from './customizer'
import type { HairStyle, HairStyleSummary } from './fabricator'

export type HairAssetSide = 'front' | 'back' | 'fringe'
export type HairCatalogSide = Exclude<HairAssetSide, 'fringe'>

type HairAppearance = NonNullable<CustomizerCharacter['customization']['hairAppearance']>

const legacyCategoryBySide: Record<HairAssetSide, HairPartId> = {
  front: 'rearHair',
  back: 'backHair',
  fringe: 'frontHair'
}

export const hairCategories: ReadonlyArray<{ id: HairPartId; label: string; side: HairAssetSide }> = [
  { id: 'backHair', label: 'Cabelo traseiro', side: 'back' },
  { id: 'rearHair', label: 'Cabelo posterior', side: 'front' },
  { id: 'ponytail', label: 'Rabo de cavalo', side: 'back' },
  { id: 'frontHair', label: 'Franja frontal', side: 'fringe' },
  { id: 'ahoge', label: 'Ahoge', side: 'fringe' }
]

/** Resolve the legacy front/back fields with the same fallback used by character renderers. */
export function hairAppearanceStyleId(appearance: HairAppearance | undefined, side: HairCatalogSide): string | null {
  if (!appearance) return null
  const key = side === 'front' ? 'frontStyleId' : 'backStyleId'
  return key in appearance ? appearance[key] ?? null : appearance.styleId ?? null
}

/** Resolve exactly the style IDs rendered for a saved appearance, including legacy aliases. */
export function hairAppearanceStyleIds(
  appearance: HairAppearance | undefined,
  side?: HairAssetSide
): Array<{ id: string; part: HairPartId; side: HairAssetSide }> {
  return hairCategories.filter((part) => !side || part.side === side).flatMap((part) => {
    const hasPartOverride = Boolean(appearance?.parts && Object.prototype.hasOwnProperty.call(appearance.parts, part.id))
    const legacyFrontPart = part.id === 'rearHair' && appearance?.parts && Object.prototype.hasOwnProperty.call(appearance.parts, 'frontHair')
      ? appearance.parts.frontHair
      : null
    const id = hasPartOverride
      ? appearance?.parts?.[part.id] ?? null
      : part.id === 'backHair'
        ? hairAppearanceStyleId(appearance, 'back')
        : part.id === 'rearHair'
          ? legacyFrontPart ?? hairAppearanceStyleId(appearance, 'front')
          : null
    return id ? [{ id, part: part.id, side: part.side }] : []
  })
}

/** Catalog assets referenced by a character, deduplicated by model slot and style ID. */
export function collectCustomizerHairStyleReferences(
  character: Pick<CustomizerCharacter, 'customization'>
): Array<{ modelSlot: number; id: string }> {
  const appearance = character.customization.hairAppearance
  if (!appearance) return []
  return [...new Set(hairAppearanceStyleIds(appearance).map(({ id }) => id))]
    .map((id) => ({ modelSlot: appearance.modelSlot, id }))
}

export function hairStyleSupportsCategory(style: HairStyle | HairStyleSummary, category: HairPartId): boolean {
  const side = hairCategories.find((item) => item.id === category)?.side
  if (!side || !style[side]) return false
  const assignedCategory = style.categoryBySide?.[side]
  if (assignedCategory) return assignedCategory === category
  return style.category ? style.category === category : legacyCategoryBySide[side] === category
}
