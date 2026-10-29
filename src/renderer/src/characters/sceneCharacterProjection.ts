type SceneCharacterProjectionElement = {
  id: string
  kind: string
  characterId?: string
  activeExpressionCollectionId?: string
  activeExpressionPresetId?: string | null
}

/** Builds stable character projections and the expression-only autosave key in one pass. */
export function projectSceneCharacters<T extends SceneCharacterProjectionElement>(elements: readonly T[]) {
  const characters: T[] = []
  const expressionSelections: Array<[string, string | undefined, string | null | undefined]> = []
  for (const element of elements) {
    if (element.kind !== 'character') continue
    characters.push(element)
    expressionSelections.push([element.id, element.activeExpressionCollectionId, element.activeExpressionPresetId])
  }
  return { characters, autosaveSignature: JSON.stringify(expressionSelections) }
}

/** Signature used by Studio to refresh the catalog revisions referenced by its scene. */
export function sceneExpressionPresetSignature(elements: readonly SceneCharacterProjectionElement[]): string {
  return JSON.stringify(elements
    .filter((element) => element.kind === 'character' && element.characterId && element.activeExpressionPresetId)
    .map((element) => [element.characterId, element.activeExpressionPresetId]))
}
