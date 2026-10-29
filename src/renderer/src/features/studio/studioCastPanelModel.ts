import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { StudioElement } from '../../../../shared/studio'

export type StudioCastCharacter = Pick<CustomizerCharacter, 'id' | 'name' | 'hair' | 'outfit' | 'skin'>

export type StudioCastItem = {
  element: StudioElement
  character: StudioCastCharacter | null
  firstName: string
}

/** Indexa o catálogo uma vez e preserva a precedência do primeiro ID duplicado. */
export function projectStudioCastItems(
  elements: readonly StudioElement[],
  characters: readonly StudioCastCharacter[]
): StudioCastItem[] {
  const charactersById = new Map<string, StudioCastCharacter>()
  for (const character of characters) {
    if (!charactersById.has(character.id)) charactersById.set(character.id, character)
  }

  return elements.map((element) => {
    const character = element.characterId ? charactersById.get(element.characterId) ?? null : null
    const firstName = (character?.name ?? element.text).trim().split(/\s+/)[0] || element.text
    return { element, character, firstName }
  })
}
