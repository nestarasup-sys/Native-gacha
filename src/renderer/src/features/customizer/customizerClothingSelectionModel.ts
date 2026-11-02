import type { CustomizerWardrobeGroup } from '../../../../shared/customizer'
import type { WardrobeSet } from '../../../../shared/fabricator'
import type { SelectedWardrobeComponent } from '../../characters/characterRenderer'

export type CustomizerClothingCategoryDefinition = { id: string; source: readonly string[] }

type ResolveDefaultSelectionInput = {
  hasCharacter: boolean
  activeModule: string | null
  clothesPanelTab: string
  selectedClothing: SelectedWardrobeComponent | null
  wardrobeGroups: CustomizerWardrobeGroup[] | undefined
  wardrobeDetails: Record<string, WardrobeSet>
  categoryDefinitions: readonly CustomizerClothingCategoryDefinition[]
}

export function resolveDefaultCustomizerClothingSelection({
  hasCharacter,
  activeModule,
  clothesPanelTab,
  selectedClothing,
  wardrobeGroups,
  wardrobeDetails,
  categoryDefinitions
}: ResolveDefaultSelectionInput): SelectedWardrobeComponent | null | undefined {
  if (!hasCharacter || selectedClothing || activeModule === 'Roupas' && clothesPanelTab === 'adjust') return undefined

  const firstGroup = wardrobeGroups?.[0]
  const firstSet = firstGroup ? wardrobeDetails[`${firstGroup.modelSlot}:${firstGroup.setId}`] : undefined
  const firstDefinition = firstGroup ? categoryDefinitions.find((item) => item.id === firstGroup.category) : undefined
  const firstComponent = firstGroup && firstSet
    ? firstGroup.componentId
      ? firstSet.components.find((component) => component.id === firstGroup.componentId)
      : firstSet.components.find((component) => firstDefinition?.source.includes(component.category))
    : undefined

  return firstGroup && firstComponent
    ? { modelSlot: firstGroup.modelSlot, setId: firstGroup.setId, category: firstGroup.category, componentId: firstComponent.id }
    : null
}

type ResolveAdjustmentSelectionInput = {
  hasCharacter: boolean
  isAdjustmentView: boolean
  wardrobeGroups: CustomizerWardrobeGroup[] | undefined
  selectedClothing: SelectedWardrobeComponent | null
  wardrobeDetails: Record<string, WardrobeSet>
  categoryDefinitions: readonly CustomizerClothingCategoryDefinition[]
}

export function resolveAdjustedCustomizerClothingSelection({
  hasCharacter,
  isAdjustmentView,
  wardrobeGroups,
  selectedClothing,
  wardrobeDetails,
  categoryDefinitions
}: ResolveAdjustmentSelectionInput): SelectedWardrobeComponent | null | undefined {
  if (!hasCharacter || !isAdjustmentView) return undefined

  const categoryIds = new Set(categoryDefinitions.map((item) => item.id))
  const groups = (wardrobeGroups ?? []).filter((group) => categoryIds.has(group.category))
  if (!groups.length) return null

  const currentSelectionStillInScope = selectedClothing && groups.some((group) => (
    group.modelSlot === selectedClothing.modelSlot
    && group.setId === selectedClothing.setId
    && group.category === selectedClothing.category
    && (group.componentId === selectedClothing.componentId || !group.componentId)
  ))
  if (currentSelectionStillInScope) return undefined

  const firstGroup = groups[0]
  const set = wardrobeDetails[`${firstGroup.modelSlot}:${firstGroup.setId}`]
  const definition = categoryDefinitions.find((item) => item.id === firstGroup.category)
  const component = set && (firstGroup.componentId
    ? set.components.find((piece) => piece.id === firstGroup.componentId)
    : set.components.find((piece) => definition?.source.includes(piece.category)))

  return firstGroup.componentId || component
    ? {
      modelSlot: firstGroup.modelSlot,
      setId: firstGroup.setId,
      category: firstGroup.category,
      componentId: component?.id ?? firstGroup.componentId!
    }
    : undefined
}
