import type { CustomizerCharacter } from '../../../../../shared/customizer'

export type IndexedMotionPreparationCharacter = {
  character: CustomizerCharacter
  fingerprint: string
}

export type MotionPreparationCharacterIndex = {
  get(characterId: string): IndexedMotionPreparationCharacter | undefined
}

/** Indexes the first character for each ID, matching Array.find, and fingerprints lazily once per object. */
export function indexMotionPreparationCharacters(characters: CustomizerCharacter[]): MotionPreparationCharacterIndex {
  const byId = new Map<string, CustomizerCharacter>()
  for (const character of characters) if (!byId.has(character.id)) byId.set(character.id, character)
  const indexedByObject = new WeakMap<CustomizerCharacter, IndexedMotionPreparationCharacter>()
  return {
    get(characterId) {
      const character = byId.get(characterId)
      if (!character) return undefined
      let indexed = indexedByObject.get(character)
      if (!indexed) {
        indexed = { character, fingerprint: JSON.stringify(character) }
        indexedByObject.set(character, indexed)
      }
      return indexed
    }
  }
}

type CompletedCharacterFingerprint = { characterId: string; fingerprint: string }
export type CompletedMotionPreparation = {
  byPlan: Map<string, CompletedCharacterFingerprint[]>
  oldestFirst: Array<{ planKey: string; character: CompletedCharacterFingerprint }>
}

export function createCompletedMotionPreparation(): CompletedMotionPreparation {
  return { byPlan: new Map(), oldestFirst: [] }
}

export function hasCompletedMotionPreparation(
  completed: CompletedMotionPreparation,
  planKey: string,
  character: IndexedMotionPreparationCharacter
): boolean {
  return completed.byPlan.get(planKey)?.some((previous) =>
    previous.characterId === character.character.id && previous.fingerprint === character.fingerprint
  ) ?? false
}

/** Stores only a reference to the per-character fingerprint and retains the existing FIFO bound. */
export function rememberCompletedMotionPreparation(
  completed: CompletedMotionPreparation,
  planKey: string,
  character: IndexedMotionPreparationCharacter,
  maximumEntries = 256
): void {
  if (hasCompletedMotionPreparation(completed, planKey, character)) return
  const fingerprint: CompletedCharacterFingerprint = {
    characterId: character.character.id,
    fingerprint: character.fingerprint
  }
  const versions = completed.byPlan.get(planKey) ?? []
  versions.push(fingerprint)
  completed.byPlan.set(planKey, versions)
  completed.oldestFirst.push({ planKey, character: fingerprint })
  while (completed.oldestFirst.length > maximumEntries) {
    const oldest = completed.oldestFirst.shift()!
    const retained = completed.byPlan.get(oldest.planKey)?.filter((entry) => entry !== oldest.character) ?? []
    if (retained.length) completed.byPlan.set(oldest.planKey, retained)
    else completed.byPlan.delete(oldest.planKey)
  }
}
