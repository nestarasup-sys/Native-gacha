/** Restabelece as roupas vinculadas a um personagem sem apagar referências legadas. */
import { useEffect, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { WardrobeSet } from '../../../../shared/fabricator'
import { anchorWardrobeAdjustments } from '../../../../shared/wardrobeAdjustment'
import { wardrobeGroupCategoryForSource } from '../../../../shared/wardrobePlacementModel'
import { applyCharacterBodyShape } from '../../../../shared/bodyShape'
import { getCharacterBodyDimensions, getCharacterProportions } from '../../../../shared/customizer'
import { clothingCategories, wardrobeComponentsForGroup, withCharacterHeadSize } from '../../characters/characterRenderer'
import { loadCustomizerArtworkSource } from './customizerArtworkSource'
import { renderWardrobeThumbnail } from './wardrobePanelModel'

export function useCustomizerWardrobeHydration(deps: {
  selectedCharacter: CustomizerCharacter | null
  charactersRef: MutableRefObject<CustomizerCharacter[]>
  saveCharacter: (character: CustomizerCharacter) => Promise<void>
  wardrobeThumbnails: Record<string, string>
  setWardrobeDetails: Dispatch<SetStateAction<Record<string, WardrobeSet>>>
  setWardrobeThumbnails: Dispatch<SetStateAction<Record<string, string>>>
  setCatalogError: Dispatch<SetStateAction<string>>
}) {
  const {
    selectedCharacter, charactersRef, saveCharacter, wardrobeThumbnails,
    setWardrobeDetails, setWardrobeThumbnails, setCatalogError
  } = deps
  const [unavailableWardrobeSetKeys, setUnavailableWardrobeSetKeys] = useState<string[]>([])
  const [repairingWardrobeLinks, setRepairingWardrobeLinks] = useState(false)
  const wardrobeGroups = selectedCharacter?.customization.wardrobeGroups ?? []
  const hydrationKey = wardrobeGroups
    .map((group) => `${group.modelSlot}:${group.setId}:${group.category}:${group.componentId ?? ''}`)
    .sort()
    .join('|')

  useEffect(() => {
    setUnavailableWardrobeSetKeys([])
    if (!selectedCharacter || !wardrobeGroups.length) return
    let cancelled = false
    const groupsToRestore = [...wardrobeGroups]
    void (async () => {
      // Keep legacy references intact if their source vanished; this must not become a recurring global catalog error.
      const restored = await Promise.all(groupsToRestore.map(async (group) => {
        const key = `${group.modelSlot}:${group.setId}`
        const set = await window.desktop.loadWardrobeSet(group.modelSlot, group.setId)
        return { group, key, set }
      }))
      if (cancelled) return
      setUnavailableWardrobeSetKeys(Array.from(new Set(restored.filter(({ set }) => !set).map(({ key }) => key))))
      setWardrobeDetails((current) => {
        const next = { ...current }
        for (const { key, set } of restored) if (set) next[key] = set
        return next
      })
      const setsByKey = new Map<string, WardrobeSet>()
      for (const { key, set } of restored) if (set) setsByKey.set(key, set)
      let migratedGroups = groupsToRestore.map((group) => {
        const component = group.componentId
          ? setsByKey.get(`${group.modelSlot}:${group.setId}`)?.components.find((entry) => entry.id === group.componentId)
          : undefined
        if (!component) return group
        const category = wardrobeGroupCategoryForSource(component.category, group.category)
        return category === group.category ? group : { ...group, category }
      })
      if (migratedGroups.some((group) => !group.adjustmentReference && setsByKey.has(`${group.modelSlot}:${group.setId}`))) {
        const modelSlot = selectedCharacter.customization.modelSlot ?? 1
        const poseSlot = selectedCharacter.customization.poseSlot
        const source = await loadCustomizerArtworkSource(modelSlot, poseSlot, {
          loadModel: window.desktop.loadFabricatorSlot,
          loadPose: window.desktop.loadFabricatorPose
        })
        if (source.status === 'ready') {
          const { artwork } = source
          const shaped = applyCharacterBodyShape(withCharacterHeadSize(artwork, getCharacterProportions(selectedCharacter.customization)), getCharacterBodyDimensions(selectedCharacter.customization))
          const details = Object.fromEntries(restored.filter((entry): entry is typeof entry & { set: WardrobeSet } => !!entry.set).map(({ key, set }) => [key, set]))
          migratedGroups = anchorWardrobeAdjustments(migratedGroups, modelSlot, shaped.parts, (group) => wardrobeComponentsForGroup(group, details))
        }
      }
      if (cancelled) return
      if (JSON.stringify(migratedGroups) !== JSON.stringify(groupsToRestore)) {
        const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
        // Hydration must not overwrite an edit made while assets were loading.
        if (JSON.stringify(current.customization.wardrobeGroups) === JSON.stringify(groupsToRestore)) {
          await saveCharacter({ ...current, customization: { ...current.customization, wardrobeGroups: migratedGroups }, updatedAt: new Date().toISOString() })
        }
      }
      for (const { group, set } of restored) {
        if (!set) continue
        const category = Object.values(clothingCategories).flat().find((definition) => definition.id === group.category)
        if (!category) continue
        const thumbnailKey = `${group.modelSlot}:${group.setId}:${group.category}`
        if (wardrobeThumbnails[thumbnailKey]) continue
        const thumbnail = await renderWardrobeThumbnail(set, category.source)
        if (cancelled) return
        if (thumbnail) setWardrobeThumbnails((current) => ({ ...current, [thumbnailKey]: thumbnail }))
      }
    })().catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível restaurar as roupas deste personagem.')
    })
    return () => { cancelled = true }
  }, [selectedCharacter?.id, hydrationKey])

  async function removeUnavailableWardrobeLinks() {
    if (!selectedCharacter || !unavailableWardrobeSetKeys.length || repairingWardrobeLinks) return
    if (!window.confirm(`Este personagem tem roupa(s) cuja fonte não existe mais. Remover somente os vínculos indisponíveis? As outras roupas e configurações serão mantidas.`)) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const unavailable = new Set(unavailableWardrobeSetKeys)
    const wardrobeGroups = (current.customization.wardrobeGroups ?? []).filter((group) => !unavailable.has(`${group.modelSlot}:${group.setId}`))
    if (wardrobeGroups.length === (current.customization.wardrobeGroups ?? []).length) {
      setUnavailableWardrobeSetKeys([])
      return
    }
    setRepairingWardrobeLinks(true)
    try {
      await saveCharacter({ ...current, customization: { ...current.customization, wardrobeGroups }, updatedAt: new Date().toISOString() })
      const latest = charactersRef.current.find((character) => character.id === current.id)
      if (!latest?.customization.wardrobeGroups?.some((group) => unavailable.has(`${group.modelSlot}:${group.setId}`))) setUnavailableWardrobeSetKeys([])
    } finally {
      setRepairingWardrobeLinks(false)
    }
  }

  return { unavailableWardrobeSetKeys, repairingWardrobeLinks, removeUnavailableWardrobeLinks }
}
