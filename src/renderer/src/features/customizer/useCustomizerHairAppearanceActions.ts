/** Ações de aparência do cabelo; alterações ficam na instância do personagem. */
import type { MutableRefObject } from 'react'
import { normalizeCharacterHairColorOverrides, setCharacterHairColorRole } from '../../../../shared/customizer'
import type { CharacterColorOverrides, CharacterPaletteOverrides, CharacterPaletteRole, CustomizerCharacter, HairPartId } from '../../../../shared/customizer'
import type { CharacterPatch } from './useCustomizerCharacterCommands'
import { customizerHairParts } from '../../characters/characterRenderer'
import type { HairStyleSummary } from '../../../../shared/fabricator'

export function useCustomizerHairAppearanceActions(deps: {
  selectedCharacter: CustomizerCharacter | null
  selectedModelSlot: number | null
  charactersRef: MutableRefObject<CustomizerCharacter[]>
  saveCharacterCustomization: (patch: CharacterPatch) => Promise<void>
}) {
  const { selectedCharacter, selectedModelSlot, charactersRef, saveCharacterCustomization } = deps

  async function chooseHairPartStyle(part: HairPartId, summary: HairStyleSummary | null) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    const sameModel = previous?.modelSlot === selectedModelSlot
    const previousParts = sameModel ? previous?.parts : undefined
    const parts = { ...(previousParts ?? {}), ...(part === 'frontHair' && previousParts?.frontHair && !previousParts.rearHair ? { rearHair: previousParts.frontHair } : {}), [part]: summary?.id ?? null }
    await saveCharacterCustomization({ hairAppearance: { ...(sameModel ? previous : undefined), modelSlot: selectedModelSlot, parts } })
  }

  async function setHairColor(role: CharacterPaletteRole, value: string) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    const sameModel = previous?.modelSlot === selectedModelSlot
    const partColors = { ...(sameModel ? previous?.partColors : undefined) }
    for (const part of customizerHairParts) {
      const existing = partColors[part.id]
      const legacyRole = role === 'shadow' ? 'fade' : role === 'light' ? 'highlight' : role
      if (!existing || (!(role in existing) && !(legacyRole in existing))) continue
      const next = { ...existing } as Record<string, string>
      delete next[role]
      delete next[legacyRole]
      if (Object.keys(next).length) partColors[part.id] = next as CharacterColorOverrides
      else delete partColors[part.id]
    }
    await saveCharacterCustomization({ hairAppearance: {
      ...(sameModel ? previous : undefined),
      modelSlot: selectedModelSlot,
      colors: setCharacterHairColorRole(sameModel ? previous?.colors : undefined, role, value),
      partColors
    } })
  }

  async function setHairPartColor(part: HairPartId, role: CharacterPaletteRole, value: string) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    const sameModel = previous?.modelSlot === selectedModelSlot
    const partColors = { ...(sameModel ? previous?.partColors : undefined) }
    partColors[part] = setCharacterHairColorRole(partColors[part], role, value)
    await saveCharacterCustomization({ hairAppearance: { ...(sameModel ? previous : undefined), modelSlot: selectedModelSlot, partColors } })
  }

  async function applyHairPartPalette(part: HairPartId, colors: CharacterPaletteOverrides) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    const sameModel = previous?.modelSlot === selectedModelSlot
    await saveCharacterCustomization({ hairAppearance: {
      ...(sameModel ? previous : undefined), modelSlot: selectedModelSlot,
      partColors: { ...(sameModel ? previous?.partColors : undefined), [part]: normalizeCharacterHairColorOverrides(colors) }
    } })
  }

  async function resetHairPartColors(part: HairPartId) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    if (!previous || previous.modelSlot !== selectedModelSlot) return
    const partColors = { ...previous.partColors }
    delete partColors[part]
    await saveCharacterCustomization({ hairAppearance: { ...previous, partColors } })
  }

  async function applyHairPalette(colors: CharacterPaletteOverrides) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    const sameModel = previous?.modelSlot === selectedModelSlot
    await saveCharacterCustomization({ hairAppearance: { ...(sameModel ? previous : undefined), modelSlot: selectedModelSlot, colors: normalizeCharacterHairColorOverrides(colors), partColors: {} } })
  }

  async function restoreHairColors() {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    if (!previous || previous.modelSlot !== selectedModelSlot) return
    await saveCharacterCustomization({ hairAppearance: { ...previous, colors: undefined, partColors: undefined } })
  }

  return { chooseHairPartStyle, setHairColor, setHairPartColor, applyHairPartPalette, resetHairPartColors, applyHairPalette, restoreHairColors }
}
