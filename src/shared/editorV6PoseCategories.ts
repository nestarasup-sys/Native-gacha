import type { CustomizerCharacter } from './customizer'
import type { EditorV6Document } from './editorV6'
import { poseCategoryLabel, resolvePoseCategory, type FabricatorPoseSummary } from './fabricator'

export type EditorV6PoseCategoryIndex = ReadonlyMap<string, ReadonlyMap<number, string>>

function exportedCharacterIds(document: EditorV6Document): Set<string> {
  return new Set(document.elements.filter(element => element.kind === 'character' && element.characterId && element.visible !== false)
    .map(element => element.characterId!))
}

/** Normalizes the historical “Parado” label to the category shown in the UI. */
export function editorV6PoseCategoryKey(value: string): string {
  const key = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')
  return key === 'parado' || key === 'em pe' ? 'em pe' : key
}

/** Collects pose slots actually referenced by authored states and Intro blocks. */
export function collectEditorV6PoseReferences(document: EditorV6Document): Map<string, Set<number>> {
  const references = new Map<string, Set<number>>()
  const exportedCharacters = exportedCharacterIds(document)
  const add = (characterId: string | undefined, poseSlot: number | null | undefined) => {
    if (!characterId || !exportedCharacters.has(characterId) || typeof poseSlot !== 'number') return
    const slots = references.get(characterId) ?? new Set<number>()
    slots.add(poseSlot)
    references.set(characterId, slots)
  }
  for (const element of document.elements) if (element.kind === 'character' && element.visible !== false) add(element.characterId, element.poseSlot)
  for (const track of document.timeline.tracks) if (!track.hidden && !track.muted) for (const block of track.blocks) {
    if (track.kind === 'character' && block.state?.kind === 'character') add(block.state.characterId, block.state.poseSlot)
    if (track.kind === 'intro' && block.intro?.kind === 'character') add(block.intro.characterId, block.intro.poseSlot)
  }
  return references
}

/** Categories and numeric slots cannot be mixed for one character in V14.5. */
export function editorV6PoseCharactersRequiringNumericSlots(
  document: EditorV6Document,
  categories: EditorV6PoseCategoryIndex
): Set<string> {
  const result = new Set<string>()
  const exportedCharacters = exportedCharacterIds(document)
  const check = (characterId: string | undefined, poseSlot: number | null | undefined) => {
    if (!characterId || !exportedCharacters.has(characterId) || poseSlot === undefined) return
    if (poseSlot === null || !categories.get(characterId)?.has(poseSlot)) result.add(characterId)
  }
  for (const element of document.elements) if (element.kind === 'character' && element.visible !== false) check(element.characterId, element.poseSlot)
  for (const track of document.timeline.tracks) if (!track.hidden && !track.muted) for (const block of track.blocks) {
    if (track.kind === 'character' && block.state?.kind === 'character') check(block.state.characterId, block.state.poseSlot)
    if (track.kind === 'intro' && block.intro?.kind === 'character') check(block.intro.characterId, block.intro.poseSlot)
  }
  return result
}

/** Exposes categories only when the current export-pose selection can import them. */
export function buildEditorV6PoseCategoryIndex(
  document: EditorV6Document,
  characters: readonly CustomizerCharacter[],
  summariesByModel: ReadonlyMap<number, readonly (FabricatorPoseSummary | null)[]>,
  selectedSlotsByModel: ReadonlyMap<number, readonly number[] | null>
): EditorV6PoseCategoryIndex {
  const charactersById = new Map(characters.map(character => [character.id, character]))
  const result = new Map<string, ReadonlyMap<number, string>>()
  for (const [characterId, referencedSlots] of collectEditorV6PoseReferences(document)) {
    const character = charactersById.get(characterId)
    if (!character) continue
    const modelSlot = character.customization.modelSlot ?? 1
    const summaries = (summariesByModel.get(modelSlot) ?? []).filter((pose): pose is NonNullable<typeof pose> => Boolean(pose))
    const posesBySlot = new Map(summaries.map(pose => [pose.slot, pose]))
    // With no saved export selection, the roteiro importer exposes the full
    // pose catalog. Only a persisted five-slot selection narrows availability.
    const selected = selectedSlotsByModel.get(modelSlot) ?? summaries.map(pose => pose.slot)
    const selectedCategories = new Set(selected.flatMap(slot => {
      const pose = posesBySlot.get(slot)
      return pose ? [editorV6PoseCategoryKey(resolvePoseCategory(pose))] : []
    }))
    const categories = new Map<number, string>()
    for (const slot of referencedSlots) {
      const pose = posesBySlot.get(slot)
      if (!pose) continue
      const category = poseCategoryLabel(resolvePoseCategory(pose))
      if (category.length <= 32 && selectedCategories.has(editorV6PoseCategoryKey(category))) categories.set(slot, category)
    }
    if (categories.size) result.set(characterId, categories)
  }
  return result
}
