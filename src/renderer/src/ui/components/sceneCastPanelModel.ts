import type { CustomizerCharacter } from '../../../../shared/customizer'

export type SceneCastElement = { id: string; characterId?: string; text: string }
export type SceneCastCharacter = Pick<CustomizerCharacter, 'id' | 'name' | 'hair' | 'outfit' | 'skin'>

export type SceneCastItem<Element extends SceneCastElement> = {
  element: Element
  character: SceneCastCharacter | null
  firstName: string
}

/** Indexa o catálogo uma vez e preserva a precedência da primeira ficha duplicada. */
export function projectSceneCastItems<Element extends SceneCastElement>(
  elements: readonly Element[],
  characters: readonly SceneCastCharacter[]
): SceneCastItem<Element>[] {
  const charactersById = new Map<string, SceneCastCharacter>()
  for (const character of characters) {
    if (!charactersById.has(character.id)) charactersById.set(character.id, character)
  }

  return elements.map((element) => {
    const character = element.characterId ? charactersById.get(element.characterId) ?? null : null
    const firstName = (character?.name ?? element.text).trim().split(/\s+/)[0] || element.text
    return { element, character, firstName }
  })
}
