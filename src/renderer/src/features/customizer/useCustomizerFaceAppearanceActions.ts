/** Seleção de assets e paletas faciais do catálogo, sempre na cópia do personagem. */
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { CustomizerCharacter, CustomizerFaceAppearance, FacePalettePartId, HairColorOverrides, HairColorRole } from '../../../../shared/customizer'
import type { FaceCatalogItem, FaceCatalogItemSummary, FaceComponentAsset, FaceComponentAssetSummary, FaceDetailKind, FaceSheetKind } from '../../../../shared/fabricator'
import type { CharacterPatch } from './useCustomizerCharacterCommands'
import { customizerFaceParts, facePartSourceId, hasSelectedFaceAsset, sameFaceAssetPair } from './customizerFaceCatalogModel'
import { customizerFaceAppearanceForModel, customizerMouthBlushAppearance } from './customizerFaceAppearanceModel'
import type { FaceLibraryPartId } from './customizerFaceCatalogModel'
import { isRightFaceAsset } from '../../characters/characterRenderer'

export function useCustomizerFaceAppearanceActions(deps: {
  selectedCharacter: CustomizerCharacter | null
  selectedModelSlot: number | null
  charactersRef: MutableRefObject<CustomizerCharacter[]>
  saveCharacterCustomization: (patch: CharacterPatch) => Promise<void>
  selectHeadTab: (tab: 'eyes' | 'face') => void
  faceCatalogItems: FaceCatalogItemSummary[]
  faceCatalogDetails: Record<string, FaceCatalogItem>
  setFaceCatalogDetails: Dispatch<SetStateAction<Record<string, FaceCatalogItem>>>
  faceComponentAssets: FaceComponentAssetSummary[]
  faceComponentDetails: Record<string, FaceComponentAsset>
  setFaceComponentDetails: Dispatch<SetStateAction<Record<string, FaceComponentAsset>>>
}) {
  const {
    selectedCharacter, selectedModelSlot, charactersRef, saveCharacterCustomization, selectHeadTab,
    faceCatalogItems, faceCatalogDetails, setFaceCatalogDetails,
    faceComponentAssets, faceComponentDetails, setFaceComponentDetails
  } = deps

  async function chooseFaceCatalogItem(summary: FaceCatalogItemSummary, variantIndex?: number) {
    const item = faceCatalogDetails[`${summary.modelSlot}:${summary.id}`] ?? await window.desktop.fabricator.loadFaceCatalogItem(summary.modelSlot, summary.id)
    if (!item || !selectedCharacter) return
    setFaceCatalogDetails((current) => ({ ...current, [`${summary.modelSlot}:${summary.id}`]: item }))
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const field: Record<FaceSheetKind, keyof CustomizerFaceAppearance> = {
      eyes: 'eyeCatalogId', eyebrows: 'eyebrowCatalogId', nose: 'noseCatalogId',
      'mouth-closed': 'mouthClosedCatalogId', 'mouth-open': 'mouthOpenCatalogId'
    }
    const sameModel = previous?.modelSlot === item.modelSlot
    const migrated: Partial<Pick<CustomizerFaceAppearance, 'eyeCatalogId' | 'eyebrowCatalogId' | 'noseCatalogId' | 'mouthClosedCatalogId' | 'mouthOpenCatalogId'>> = {}
    if (sameModel && previous?.setId) {
      const legacySet = await window.desktop.fabricator.loadFaceSet(previous.modelSlot, previous.setId)
      for (const kind of Object.keys(field) as FaceSheetKind[]) {
        if (!legacySet?.sheets[kind]) continue
        const legacyItemId = `legacy_${legacySet.id}_${kind}`
        if (!faceCatalogItems.some((entry) => entry.id === legacyItemId)) continue
        if (kind === 'eyes') migrated.eyeCatalogId = legacyItemId
        else if (kind === 'eyebrows') migrated.eyebrowCatalogId = legacyItemId
        else if (kind === 'nose') migrated.noseCatalogId = legacyItemId
        else if (kind === 'mouth-closed') migrated.mouthClosedCatalogId = legacyItemId
        else migrated.mouthOpenCatalogId = legacyItemId
      }
    }
    const appearance: CustomizerFaceAppearance = {
      ...customizerFaceAppearanceForModel(previous, item.modelSlot),
      ...migrated,
      modelSlot: item.modelSlot,
      setId: undefined,
      [field[item.category]]: item.id,
      eyeState: sameModel ? previous.eyeState : 0,
      eyebrows: sameModel ? previous.eyebrows : true,
      noseIndex: item.category === 'nose' ? variantIndex ?? item.selectedNose : sameModel ? previous.noseIndex : item.selectedNose,
      expressionIndex: item.category.startsWith('mouth') ? variantIndex ?? item.selectedExpression : sameModel ? previous.expressionIndex : item.selectedExpression,
      mouthOpen: item.category === 'mouth-open' ? true : item.category === 'mouth-closed' ? false : sameModel ? previous.mouthOpen : false
    }
    selectHeadTab(item.category === 'eyes' || item.category === 'eyebrows' ? 'eyes' : 'face')
    await saveCharacterCustomization({ faceAppearance: appearance })
  }

  async function chooseFacePartCatalogItem(partId: FaceLibraryPartId, summary: FaceComponentAssetSummary) {
    const part = customizerFaceParts.find((entry) => entry.id === partId)
    if (!part || !selectedCharacter) return
    const categoryParts = customizerFaceParts.filter((candidate) => candidate.category === part.category)
    const leftPart = categoryParts.find((candidate) => candidate.side === 'left')
    const rightPart = categoryParts.find((candidate) => candidate.side === 'right')
    const leftSummary = isRightFaceAsset(summary)
      ? faceComponentAssets.find((candidate) => !isRightFaceAsset(candidate) && sameFaceAssetPair(candidate, summary, faceComponentDetails)) ?? summary
      : summary
    const rightSummary = isRightFaceAsset(leftSummary)
      ? leftSummary
      : faceComponentAssets.find((candidate) => sameFaceAssetPair(leftSummary, candidate, faceComponentDetails)) ?? leftSummary
    const selectedAssets = new Map<string, FaceComponentAsset>()
    for (const candidate of new Set([leftSummary, rightSummary])) {
      const asset = faceComponentDetails[candidate.id] ?? await window.desktop.fabricator.loadFaceComponentAsset(candidate.modelSlot, candidate.id)
      if (asset) selectedAssets.set(candidate.id, asset)
    }
    const item = selectedAssets.get((part.side === 'right' ? rightSummary : leftSummary).id)
    if (!item || !leftPart || !rightPart) return
    setFaceComponentDetails((current) => ({ ...current, ...Object.fromEntries(selectedAssets) }))
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const appearanceBase = customizerFaceAppearanceForModel(previous, item.modelSlot)
    const linkedSides = { ...appearanceBase.linkedSides, [part.category]: false }
    const previousComponents = appearanceBase.components
    const appearance: CustomizerFaceAppearance = {
      ...appearanceBase, setId: undefined, linkedSides,
      components: {
        ...(previousComponents ?? {}),
        [leftPart.id]: { ...previousComponents?.[leftPart.id], assetId: leftSummary.id, transform: undefined },
        [rightPart.id]: { ...previousComponents?.[rightPart.id], assetId: rightSummary.id, transform: undefined }
      }
    }
    await saveCharacterCustomization({ faceAppearance: appearance })
  }

  async function setFacePartColor(part: FaceLibraryPartId, role: HairColorRole, value: string) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const appearanceBase = customizerFaceAppearanceForModel(previous, selectedModelSlot)
    const partDefinition = customizerFaceParts.find((entry) => entry.id === part)!
    const targetPart = facePartSourceId(partDefinition)
    const components = { ...appearanceBase.components }
    const manualColorRoles = [...new Set([...(components[targetPart]?.manualColorRoles ?? []), role])]
    components[targetPart] = { ...(components[targetPart] ?? { assetId: null }), colors: { ...components[targetPart]?.colors, [role]: value }, manualColorRoles }
    const appearance: CustomizerFaceAppearance = { ...appearanceBase, components }
    await saveCharacterCustomization({ faceAppearance: appearance })
  }

  async function applyFacePartPalette(part: FaceLibraryPartId, colors: HairColorOverrides) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const appearanceBase = customizerFaceAppearanceForModel(previous, selectedModelSlot)
    const components = { ...appearanceBase.components }
    components[part] = { ...(components[part] ?? { assetId: null }), colors, manualColorRoles: [] }
    await saveCharacterCustomization({ faceAppearance: {
      ...appearanceBase, components
    } })
  }

  async function resetFacePartColors(part: FaceLibraryPartId) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    if (!previous || previous.modelSlot !== selectedModelSlot) return
    const partDefinition = customizerFaceParts.find((entry) => entry.id === part)!
    const targetPart = facePartSourceId(partDefinition)
    const components = { ...previous.components }
    if (components[targetPart]) components[targetPart] = { ...components[targetPart]!, colors: undefined }
    await saveCharacterCustomization({ faceAppearance: { ...previous, components } })
  }

  async function clearFacePartSelection(partId: FaceLibraryPartId) {
    const part = customizerFaceParts.find((entry) => entry.id === partId)
    if (!part || !selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    if (!previous || previous.modelSlot !== selectedModelSlot) return
    const pair = customizerFaceParts.filter((candidate) => candidate.category === part.category)
    const components = { ...previous.components }
    for (const targetPart of pair) {
      components[targetPart.id] = { ...(previous.components?.[targetPart.id] ?? { assetId: null }), assetId: null }
    }
    const appearance = { ...previous, components }
    await saveCharacterCustomization({ faceAppearance: hasSelectedFaceAsset(appearance) ? appearance : undefined })
  }

  async function setFaceCatalogVariant(patch: Partial<CustomizerFaceAppearance>) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const old = current.customization.faceAppearance
    const appearance: CustomizerFaceAppearance = {
      ...customizerFaceAppearanceForModel(old, selectedModelSlot), ...patch
    }
    await saveCharacterCustomization({ faceAppearance: hasSelectedFaceAsset(appearance) ? appearance : undefined })
  }

  async function applyFaceCatalogPalette(part: FacePalettePartId, colors: HairColorOverrides) {
    const current = selectedCharacter && (charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter)
    if (!current || selectedModelSlot === null) return
    const previous = current.customization.faceAppearance
    const base = customizerFaceAppearanceForModel(previous, selectedModelSlot)
    const facePalettes = { ...base.facePalettes, [part]: colors }
    const facePaletteManualRoles = { ...base.facePaletteManualRoles, [part]: [] }
    await saveCharacterCustomization({ faceAppearance: { ...base, facePalettes, facePaletteManualRoles } })
  }

  async function setFaceCatalogPartColor(part: FacePalettePartId, role: HairColorRole, value: string) {
    const current = selectedCharacter && (charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter)
    if (!current || selectedModelSlot === null) return
    const previous = current.customization.faceAppearance
    const base = customizerFaceAppearanceForModel(previous, selectedModelSlot)
    const facePalettes = { ...base.facePalettes, [part]: { ...base.facePalettes?.[part], [role]: value } }
    const facePaletteManualRoles = { ...base.facePaletteManualRoles, [part]: [...new Set([...(base.facePaletteManualRoles?.[part] ?? []), role])] }
    await saveCharacterCustomization({ faceAppearance: { ...base, facePalettes, facePaletteManualRoles } })
  }

  async function chooseFaceDetailCatalogItem(kind: FaceDetailKind, summary: FaceComponentAssetSummary) {
    if (!selectedCharacter || selectedModelSlot === null || summary.modelSlot !== selectedModelSlot) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const details = { ...(previous?.modelSlot === selectedModelSlot ? previous.faceDetails : undefined), [kind]: summary.id }
    await setFaceCatalogVariant({ faceDetails: details })
  }

  async function clearFaceCatalogPart(part: 'nose' | 'mouth' | FaceDetailKind) {
    if (!selectedCharacter || selectedModelSlot === null) return
    if (part !== 'nose' && part !== 'mouth') {
      const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
      const previous = current.customization.faceAppearance
      const details = { ...(previous?.modelSlot === selectedModelSlot ? previous.faceDetails : undefined), [part]: null }
      await setFaceCatalogVariant({ faceDetails: details })
      return
    }
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const base = customizerFaceAppearanceForModel(previous, selectedModelSlot)
    const faceAppearance = part === 'nose'
      ? { ...base, noseCatalogId: undefined, noseIndex: 0 }
      : { ...base, mouthClosedCatalogId: undefined, mouthOpenCatalogId: undefined, expressionIndex: 0 }
    await saveCharacterCustomization({ faceAppearance: hasSelectedFaceAsset(faceAppearance) ? faceAppearance : undefined })
  }

  async function setMouthBlush(patch: Partial<Pick<CustomizerFaceAppearance, 'mouthBlushEnabled' | 'mouthBlushColor' | 'mouthBlushOpacity'>>) {
    if (!selectedCharacter || selectedModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const faceAppearance = customizerMouthBlushAppearance(current.customization.faceAppearance, selectedModelSlot, patch)
    await saveCharacterCustomization({ faceAppearance })
  }

  return {
    chooseFaceCatalogItem, chooseFacePartCatalogItem, setFacePartColor, applyFacePartPalette,
    resetFacePartColors, clearFacePartSelection, setFaceCatalogVariant, applyFaceCatalogPalette,
    setFaceCatalogPartColor, chooseFaceDetailCatalogItem, clearFaceCatalogPart, setMouthBlush
  }
}
