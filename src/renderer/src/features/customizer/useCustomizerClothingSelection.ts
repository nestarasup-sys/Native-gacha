import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { WardrobeSet } from '../../../../shared/fabricator'
import { clothingCategories, type SelectedWardrobeComponent } from '../../characters/characterRenderer'
import { clothesAdjustmentDefinitions } from './customizerNavigation'
import {
  resolveAdjustedCustomizerClothingSelection,
  resolveDefaultCustomizerClothingSelection
} from './customizerClothingSelectionModel'

const allClothingCategoryDefinitions = Object.values(clothingCategories).flat()

type Dependencies = {
  selectedCharacter: CustomizerCharacter | null
  activeModule: string | null
  clothesPanelTab: string
  clothesCategorySelection: Exclude<Parameters<typeof clothesAdjustmentDefinitions>[0], 'adjust'>
  wardrobeDetails: Record<string, WardrobeSet>
  selectedClothing: SelectedWardrobeComponent | null
  setSelectedClothing: Dispatch<SetStateAction<SelectedWardrobeComponent | null>>
}

export function useCustomizerClothingSelection({
  selectedCharacter,
  activeModule,
  clothesPanelTab,
  clothesCategorySelection,
  wardrobeDetails,
  selectedClothing,
  setSelectedClothing
}: Dependencies) {
  useEffect(() => {
    setSelectedClothing(null)
  }, [selectedCharacter?.id])

  useEffect(() => {
    const nextSelection = resolveDefaultCustomizerClothingSelection({
      hasCharacter: selectedCharacter !== null,
      activeModule,
      clothesPanelTab,
      selectedClothing,
      wardrobeGroups: selectedCharacter?.customization.wardrobeGroups,
      wardrobeDetails,
      categoryDefinitions: allClothingCategoryDefinitions
    })
    if (nextSelection !== undefined) setSelectedClothing(nextSelection)
  }, [activeModule, clothesPanelTab, selectedCharacter?.id, selectedCharacter?.customization.wardrobeGroups, selectedClothing, wardrobeDetails])

  useEffect(() => {
    const nextSelection = resolveAdjustedCustomizerClothingSelection({
      hasCharacter: selectedCharacter !== null,
      isAdjustmentView: activeModule === 'Roupas' && clothesPanelTab === 'adjust',
      wardrobeGroups: selectedCharacter?.customization.wardrobeGroups,
      selectedClothing,
      wardrobeDetails,
      categoryDefinitions: clothesAdjustmentDefinitions(clothesCategorySelection)
    })
    if (nextSelection !== undefined) setSelectedClothing(nextSelection)
  }, [activeModule, clothesPanelTab, clothesCategorySelection, selectedCharacter?.id, selectedCharacter?.customization.wardrobeGroups, selectedClothing?.modelSlot, selectedClothing?.setId, selectedClothing?.category, selectedClothing?.componentId, wardrobeDetails])
}
