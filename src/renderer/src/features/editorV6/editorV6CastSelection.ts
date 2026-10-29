import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Asset, EditorV6Element } from '../../../../shared/editorV6'

export type EditorV6CastSelectionPlan = {
  retainedElements: EditorV6Element[]
  charactersToAdd: CustomizerCharacter[]
  removedCharacterAssetIds: ReadonlySet<string>
  retainedElementAssetIds: ReadonlySet<string>
}

/** Plans cast membership and preserves assets still referenced by the scene. */
export function planEditorV6CastSelection(
  elements: EditorV6Element[],
  availableCharacters: CustomizerCharacter[],
  selectedCharacterIds: string[]
): EditorV6CastSelectionPlan {
  const selectedIds = new Set(selectedCharacterIds)
  const retainedElements = elements.filter((element) =>
    element.kind !== 'character' || !element.characterId || selectedIds.has(element.characterId)
  )
  const retainedCharacters = new Set(
    retainedElements.filter((element) => element.kind === 'character').map((element) => element.characterId)
  )
  const charactersToAdd = availableCharacters.filter((character) =>
    selectedIds.has(character.id) && !retainedCharacters.has(character.id)
  )
  const removedCharacterAssetIds = new Set(
    elements
      .filter((element) => element.kind === 'character' && element.characterId && !selectedIds.has(element.characterId))
      .map((element) => element.assetId)
      .filter((assetId): assetId is string => Boolean(assetId))
  )
  const retainedElementAssetIds = new Set(
    retainedElements.map((element) => element.assetId).filter((assetId): assetId is string => Boolean(assetId))
  )
  return { retainedElements, charactersToAdd, removedCharacterAssetIds, retainedElementAssetIds }
}

/** Applies a cast plan to the latest asset list so writes made during rendering survive. */
export function retainEditorV6CastAssets(assets: EditorV6Asset[], plan: EditorV6CastSelectionPlan): EditorV6Asset[] {
  return assets.filter((asset) =>
    !plan.removedCharacterAssetIds.has(asset.id) || plan.retainedElementAssetIds.has(asset.id)
  )
}
