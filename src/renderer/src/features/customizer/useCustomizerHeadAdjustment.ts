import { useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { CustomizerCharacter, CustomizerWardrobeGroup } from '../../../../shared/customizer'
import { editWardrobeAdjustment } from '../../../../shared/wardrobeAdjustment'
import { toggleWardrobeVisibility } from '../../../../shared/wardrobePlacementModel'
import type { AdjustmentPreviewHighlight, CatalogArtwork } from '../../characters/characterRenderer'
import type { CharacterPatch } from './useCustomizerCharacterCommands'

type HeadTransform = { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number }

/** Owns head adjustment selection and persists head or head accessory changes. */
export function useCustomizerHeadAdjustment(deps: {
  selectedCharacter: CustomizerCharacter | null
  charactersRef: MutableRefObject<CustomizerCharacter[]>
  displayArtworkParts: CatalogArtwork['parts']
  anchorWardrobe: (groups: CustomizerWardrobeGroup[]) => CustomizerWardrobeGroup[]
  saveCharacterCustomization: (patch: CharacterPatch) => Promise<void>
  setAdjustmentPreviewHighlight: Dispatch<SetStateAction<AdjustmentPreviewHighlight | null>>
}) {
  const {
    selectedCharacter, charactersRef, displayArtworkParts, anchorWardrobe,
    saveCharacterCustomization, setAdjustmentPreviewHighlight
  } = deps
  const [headAdjustSelection, setHeadAdjustSelection] = useState<string | null>(null)

  async function updateHeadAdjustment(operation: 'transform' | 'toggle-hidden', values?: HeadTransform) {
    if (!selectedCharacter || !headAdjustSelection) return
    setAdjustmentPreviewHighlight(null)
    const wardrobeCategory = headAdjustSelection === 'oculos' || headAdjustSelection === 'acessorio-cabeca' ? headAdjustSelection : null
    const currentCharacter = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const originalGroups = currentCharacter.customization.wardrobeGroups ?? []
    const anchoredGroups = anchorWardrobe(originalGroups)
    const wardrobeGroup = wardrobeCategory ? [...anchoredGroups].reverse().find((group) => group.category === wardrobeCategory) : undefined
    if (wardrobeGroup) {
      const displayed = [...originalGroups].reverse().find((group) => group.category === wardrobeCategory) ?? wardrobeGroup
      const wardrobeGroups = anchoredGroups.map((group) => {
        if (group !== wardrobeGroup) return group
        if (operation === 'transform') return editWardrobeAdjustment(group,
          displayArtworkParts.find((bone) => bone.id === group.adjustmentReference?.boneId),
          { offsetX: values?.x, offsetY: values?.y, scaleX: values?.scaleX, scaleY: values?.scaleY, rotation: values?.rotation }, displayed)
        return toggleWardrobeVisibility(group)
      })
      await saveCharacterCustomization({ wardrobeGroups })
      return
    }

    const key = `head:${headAdjustSelection}`
    await saveCharacterCustomization((current) => {
      const existing = current.partOverrides?.[key] ?? {}
      const next = { ...existing }
      if (operation === 'transform' && values) Object.assign(next, values)
      else {
        next.hidden = !existing.hidden
        if (!next.hidden) delete next.opacity
      }
      return { partOverrides: { ...current.partOverrides, [key]: next } }
    })
  }

  return { headAdjustSelection, setHeadAdjustSelection, updateHeadAdjustment }
}
