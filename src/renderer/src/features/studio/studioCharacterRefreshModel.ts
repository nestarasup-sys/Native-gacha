import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { StudioDocument, StudioElement } from '../../../../shared/studio'

export type StudioCharacterRefreshCandidate = {
  element: StudioElement
  character: CustomizerCharacter
  shouldRecomposeExpression: boolean
  assetRevisionKey: string
  assetsChanged: boolean
}

/** Selects Studio characters whose cached artwork is out of date with its sources. */
export function selectStudioCharacterRefreshCandidates({
  studio,
  availableCharacters,
  expressionPresetVersions,
  assetLibraryRevision,
  appliedAssetRevisions,
  faceRendererVersion
}: {
  studio: StudioDocument
  availableCharacters: CustomizerCharacter[]
  expressionPresetVersions: Record<string, string | undefined>
  assetLibraryRevision: number
  appliedAssetRevisions: ReadonlyMap<string, number>
  faceRendererVersion: number
}): StudioCharacterRefreshCandidate[] {
  const charactersById = new Map(availableCharacters.map((character) => [character.id, character]))

  return studio.elements.flatMap((element) => {
    if (element.kind !== 'character' || !element.characterId || !element.assetId) return []
    const character = charactersById.get(element.characterId)
    if (!character) return []

    const modelSlot = character.customization.modelSlot ?? 1
    const latestPresetVersion = element.activeExpressionPresetId
      ? expressionPresetVersions[`${modelSlot}:${element.activeExpressionPresetId}`]
      : undefined
    const presetChanged = Boolean(latestPresetVersion && latestPresetVersion !== element.activeExpressionPresetUpdatedAt)
    const characterChanged = element.characterSourceUpdatedAt !== character.updatedAt
    const rendererChanged = element.faceRendererVersion !== faceRendererVersion
    const assetRevisionKey = `${studio.id}:${element.id}`
    const assetsChanged = assetLibraryRevision > (appliedAssetRevisions.get(assetRevisionKey) ?? 0)

    return characterChanged || presetChanged || rendererChanged || assetsChanged
      ? [{ element, character, shouldRecomposeExpression: characterChanged || presetChanged, assetRevisionKey, assetsChanged }]
      : []
  })
}
