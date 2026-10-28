import { useEffect, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { CustomizerCharacter, CustomizerWardrobeGroup } from '../../../../shared/customizer'
import type { WardrobeSet } from '../../../../shared/fabricator'
import { matchesWardrobeComponent, updateWardrobeComponentGroups } from '../../../../shared/wardrobePlacementModel'
import { clothingCategories, type AdjustmentPreviewHighlight, type CatalogArtwork, type SelectedWardrobeComponent } from '../../characters/characterRenderer'
import type { CharacterPatch } from './useCustomizerCharacterCommands'

type WardrobeTransform = Pick<CustomizerWardrobeGroup, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY' | 'rotation'>

/** Owns the clothes adjustment draft and saves adjustments through character commands. */
export function useCustomizerWardrobeAdjustment(deps: {
  selectedCharacter: CustomizerCharacter | null
  selectedClothing: SelectedWardrobeComponent | null
  charactersRef: MutableRefObject<CustomizerCharacter[]>
  wardrobeDetails: Record<string, WardrobeSet>
  displayArtworkParts: CatalogArtwork['parts']
  anchorWardrobe: (groups: CustomizerWardrobeGroup[]) => CustomizerWardrobeGroup[]
  saveCharacterCustomization: (patch: CharacterPatch) => Promise<void>
  setAdjustmentPreviewHighlight: Dispatch<SetStateAction<AdjustmentPreviewHighlight | null>>
}) {
  const {
    selectedCharacter, selectedClothing, charactersRef, wardrobeDetails, displayArtworkParts,
    anchorWardrobe, saveCharacterCustomization, setAdjustmentPreviewHighlight
  } = deps
  const [wardrobeTransformDraft, setWardrobeTransformDraft] = useState<WardrobeTransform | null>(null)

  useEffect(() => {
    const group = selectedClothing
      ? selectedCharacter?.customization.wardrobeGroups?.find((item) => item.modelSlot === selectedClothing.modelSlot && item.setId === selectedClothing.setId && item.category === selectedClothing.category && (item.componentId === selectedClothing.componentId || !item.componentId))
      : undefined
    setWardrobeTransformDraft(group ? { offsetX: group.offsetX, offsetY: group.offsetY, scaleX: group.scaleX, scaleY: group.scaleY, rotation: group.rotation } : null)
  }, [selectedCharacter?.id, selectedCharacter?.customization.wardrobeGroups, selectedClothing?.modelSlot, selectedClothing?.setId, selectedClothing?.category, selectedClothing?.componentId])

  async function updateClothesAdjustComponent(operation: 'transform' | 'toggle-hidden', values?: Partial<WardrobeTransform>) {
    if (!selectedCharacter || !selectedClothing) return
    setAdjustmentPreviewHighlight(null)
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const originalGroups = current.customization.wardrobeGroups ?? []
    const groups = anchorWardrobe(originalGroups)
    const selectedSet = wardrobeDetails[`${selectedClothing.modelSlot}:${selectedClothing.setId}`]
    const sourceCategories = clothingCategories.Inferior.concat(clothingCategories.Superior).find((item) => item.id === selectedClothing.category)?.source ?? []
    const selection = { modelSlot: selectedClothing.modelSlot, setId: selectedClothing.setId, category: selectedClothing.category, componentId: selectedClothing.componentId }
    const nextGroups = updateWardrobeComponentGroups(groups, originalGroups, selection, operation, values, sourceCategories, selectedSet?.components, displayArtworkParts)
    const adjusted = nextGroups.find((group) => matchesWardrobeComponent(group, selection))
    if (values && adjusted) setWardrobeTransformDraft({ offsetX: adjusted.offsetX, offsetY: adjusted.offsetY, scaleX: adjusted.scaleX, scaleY: adjusted.scaleY, rotation: adjusted.rotation })
    await saveCharacterCustomization({ wardrobeGroups: nextGroups })
  }

  return { wardrobeTransformDraft, updateClothesAdjustComponent }
}
