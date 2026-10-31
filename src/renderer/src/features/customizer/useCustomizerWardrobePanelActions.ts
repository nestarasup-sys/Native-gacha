import type { MutableRefObject, Dispatch, SetStateAction } from 'react'
import { normalizeCharacterColorOverrides } from '../../../../shared/customizer'
import type { CharacterPaletteOverrides, CharacterPaletteRole, CustomizerCharacter } from '../../../../shared/customizer'
import type { WardrobeSet, WardrobeSetSummary } from '../../../../shared/fabricator'
import { recolorWardrobeComponents, selectWardrobePanelComponents } from '../../../../shared/wardrobePlacementModel'
import type { ClothingGroupCategory, SelectedWardrobeComponent } from '../../characters/characterRenderer'
import { customizerFaceAppearanceForModel } from './customizerFaceAppearanceModel'
import { hasSelectedFaceAsset } from './customizerFaceCatalogModel'
import { wardrobeComponentMatchesPanel } from './wardrobePanelModel'
import type { WardrobePanel, WardrobePanelCandidate } from './wardrobePanelModel'
import type { CharacterPatch } from './useCustomizerCharacterCommands'

/** Applies catalog clothing choices and colors to a character instance. */
export function useCustomizerWardrobePanelActions(deps: {
  selectedCharacter: CustomizerCharacter | null
  selectedModelSlot: number | null
  selectedClothing: SelectedWardrobeComponent | null
  setSelectedClothing: Dispatch<SetStateAction<SelectedWardrobeComponent | null>>
  charactersRef: MutableRefObject<CustomizerCharacter[]>
  wardrobeSets: WardrobeSetSummary[]
  wardrobeDetails: Record<string, WardrobeSet>
  saveCharacterCustomization: (patch: CharacterPatch) => Promise<void>
}) {
  const {
    selectedCharacter, selectedModelSlot, selectedClothing, setSelectedClothing,
    charactersRef, wardrobeSets, wardrobeDetails, saveCharacterCustomization
  } = deps

  async function applyWardrobePanel(panel: WardrobePanel, candidate: WardrobePanelCandidate | null) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const before = current.customization.wardrobeGroups ?? []
    if (panel.id === 'glasses') {
      const currentAppearance = current.customization.faceAppearance
      const selectedHeadExtraId = currentAppearance?.modelSlot === selectedModelSlot ? currentAppearance.headExtras?.glasses : undefined
      if (candidate?.headExtraAsset || !candidate && selectedHeadExtraId) {
        const after = before.filter((group) => group.modelSlot !== selectedModelSlot || group.category !== panel.category)
        const base = customizerFaceAppearanceForModel(currentAppearance, selectedModelSlot)
        const headExtras = { ...base.headExtras }
        if (candidate?.headExtraAsset) headExtras.glasses = candidate.headExtraAsset.id
        else delete headExtras.glasses
        const faceAppearance = { ...base, headExtras }
        setSelectedClothing(null)
        await saveCharacterCustomization({ wardrobeGroups: after, faceAppearance: hasSelectedFaceAsset(faceAppearance) ? faceAppearance : undefined })
        return
      }
    }

    const replacesSelectedHeadExtra = panel.id === 'glasses' && current.customization.faceAppearance?.modelSlot === selectedModelSlot && Boolean(current.customization.faceAppearance.headExtras?.glasses)
    const existingCandidate = candidate && !replacesSelectedHeadExtra && candidate.components.every((component) => before.some((group) => group.modelSlot === candidate.summary.modelSlot && group.setId === candidate.summary.id && group.category === panel.category && group.componentId === component.id))
    if (existingCandidate) {
      setSelectedClothing({ modelSlot: candidate.summary.modelSlot, setId: candidate.summary.id, category: panel.category, componentId: candidate.component.id })
      return
    }

    const panelComponentKeys = new Set(wardrobeSets.flatMap((summary) => {
      const set = wardrobeDetails[`${summary.modelSlot}:${summary.id}`]
      return set ? set.components.filter((component) => wardrobeComponentMatchesPanel(component, panel)).map((component) => `${summary.modelSlot}:${summary.id}:${component.id}`) : []
    }))
    const matchingGroups = before.filter((group) => group.modelSlot === selectedModelSlot && group.category === panel.category && (!group.componentId || panelComponentKeys.has(`${group.modelSlot}:${group.setId}:${group.componentId}`)))
    if (!candidate && !matchingGroups.length) return

    const palette = current.customization.wardrobePalettes?.[panel.id]
    const after = selectWardrobePanelComponents(before, selectedModelSlot, panel.category, [...panelComponentKeys],
      candidate ? { modelSlot: candidate.summary.modelSlot, setId: candidate.summary.id, componentIds: candidate.components.map((component) => component.id), colors: palette } : null)
    if (candidate) {
      setSelectedClothing({ modelSlot: candidate.summary.modelSlot, setId: candidate.summary.id, category: panel.category, componentId: candidate.component.id })
    } else if (selectedClothing?.category === panel.category && panelComponentKeys.has(`${selectedModelSlot}:${selectedClothing.setId}:${selectedClothing.componentId}`)) {
      setSelectedClothing(null)
    }

    if (panel.id === 'glasses') {
      const currentAppearance = current.customization.faceAppearance
      if (currentAppearance?.modelSlot === selectedModelSlot && currentAppearance.headExtras?.glasses) {
        const headExtras = { ...currentAppearance.headExtras }
        delete headExtras.glasses
        const faceAppearance = { ...currentAppearance, headExtras }
        await saveCharacterCustomization({ wardrobeGroups: after, faceAppearance: hasSelectedFaceAsset(faceAppearance) ? faceAppearance : undefined })
        return
      }
    }
    await saveCharacterCustomization({ wardrobeGroups: after })
  }

  async function applyWardrobePalette(panel: WardrobePanel, candidate: WardrobePanelCandidate, colors: CharacterPaletteOverrides) {
    if (!selectedCharacter) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const wardrobeGroups = recolorWardrobeComponents(current.customization.wardrobeGroups ?? [],
      candidate.summary.modelSlot, candidate.summary.id, panel.category, candidate.components.map((component) => component.id),
      { kind: 'replace', colors: normalizeCharacterColorOverrides(colors) })
    await saveCharacterCustomization({
      wardrobePalettes: { ...current.customization.wardrobePalettes, [panel.id]: normalizeCharacterColorOverrides(colors) },
      wardrobeGroups
    })
  }

  async function setWardrobePieceColor(setId: string, category: ClothingGroupCategory, componentIds: string[], role: CharacterPaletteRole, value: string) {
    if (selectedModelSlot === null || !selectedCharacter) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const wardrobeGroups = recolorWardrobeComponents(current.customization.wardrobeGroups ?? [],
      selectedModelSlot, setId, category, componentIds, { kind: 'role', role, value })
    await saveCharacterCustomization({ wardrobeGroups })
  }

  async function resetWardrobePieceColors(panel: WardrobePanel, setId: string, componentIds: string[]) {
    if (selectedModelSlot === null || !selectedCharacter) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const after = recolorWardrobeComponents(current.customization.wardrobeGroups ?? [],
      selectedModelSlot, setId, panel.category, componentIds, { kind: 'clear' })
    const wardrobePalettes = { ...current.customization.wardrobePalettes }
    delete wardrobePalettes[panel.id]
    await saveCharacterCustomization({ wardrobeGroups: after, wardrobePalettes })
  }

  return { applyWardrobePanel, applyWardrobePalette, setWardrobePieceColor, resetWardrobePieceColors }
}
