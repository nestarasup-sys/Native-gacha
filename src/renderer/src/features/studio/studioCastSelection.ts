import type { CustomizerCharacter } from '../../../../shared/customizer.ts'
import { fitStudioCharacterToStage } from '../../../../shared/studioCharacterGeometry.ts'
import type { StudioAsset, StudioDocument, StudioElement } from '../../../../shared/studio.ts'
import { trimTransparentImage } from '../../characters/characterGeometry.ts'

type StudioArtwork = { dataUrl: string; width: number; height: number }
type StudioArtworkCrop = Pick<StudioArtwork, 'dataUrl' | 'width' | 'height'>

type PrepareStudioCastSelectionOptions = {
  studio: StudioDocument
  selectedCharacterIds: readonly string[]
  availableCharacters: readonly CustomizerCharacter[]
  stageWidth: number
  stageHeight: number
  faceRendererVersion: number
  renderCharacter?: (character: CustomizerCharacter) => Promise<StudioArtwork>
  cropArtwork?: (dataUrl: string) => Promise<StudioArtworkCrop | null>
  createId?: () => string
}

export type PreparedStudioCastSelection = {
  elements: StudioElement[]
  addedElements: StudioElement[]
  addedAssets: StudioAsset[]
  removedCharacterAssetIds: Set<string>
  retainedAssetIds: Set<string>
}

/** Prepares scene membership and rendered assets without mutating the saved Studio. */
export async function prepareStudioCastSelection({
  studio,
  selectedCharacterIds,
  availableCharacters,
  stageWidth,
  stageHeight,
  faceRendererVersion,
  cropArtwork = trimTransparentImage,
  createId = () => crypto.randomUUID(),
  renderCharacter: suppliedRenderer
}: PrepareStudioCastSelectionOptions): Promise<PreparedStudioCastSelection> {
  const selectedIds = new Set(selectedCharacterIds)
  const retainedElements = studio.elements.filter((element) =>
    element.kind !== 'character' || !element.characterId || selectedIds.has(element.characterId)
  )
  const removedCharacterAssetIds = new Set(studio.elements
    .filter((element) => element.kind === 'character' && element.characterId && !selectedIds.has(element.characterId))
    .map((element) => element.assetId)
    .filter((id): id is string => Boolean(id)))
  const retainedAssetIds = new Set(retainedElements.map((element) => element.assetId).filter((id): id is string => Boolean(id)))
  const retainedCharacters = new Set(retainedElements
    .filter((element) => element.kind === 'character')
    .map((element) => element.characterId))
  const additions = availableCharacters.filter((character) => selectedIds.has(character.id) && !retainedCharacters.has(character.id))

  let renderCharacter = suppliedRenderer
  if (!renderCharacter && additions.length) {
    const { renderSavedCharacter } = await import('../../characters/characterRenderer.ts')
    renderCharacter = (character) => renderSavedCharacter(character, undefined, undefined, 'idle')
  }

  const addedAssets: StudioAsset[] = []
  const addedElements: StudioElement[] = []
  let zIndex = Math.max(0, ...retainedElements.map((element) => element.zIndex))

  for (const character of additions) {
    const rendered = await renderCharacter!(character)
    const crop = await cropArtwork(rendered.dataUrl)
    const imageData = crop?.dataUrl ?? rendered.dataUrl
    const imageWidth = crop?.width ?? rendered.width
    const imageHeight = crop?.height ?? rendered.height
    const referenceCharacter = character.customization.poseSlot === null
      ? character
      : { ...character, customization: { ...character.customization, poseSlot: null } }
    const referenceRendered = referenceCharacter === character ? rendered : await renderCharacter!(referenceCharacter)
    const referenceCrop = referenceCharacter === character ? crop : await cropArtwork(referenceRendered.dataUrl)
    const referenceWidth = referenceCrop?.width ?? referenceRendered.width
    const referenceHeight = referenceCrop?.height ?? referenceRendered.height
    const asset: StudioAsset = {
      id: createId(), category: 'character', name: character.name, mimeType: 'image/png', dataUrl: imageData
    }
    const { width, height, characterCanvasWidth } = fitStudioCharacterToStage(
      referenceRendered,
      { width: referenceWidth, height: referenceHeight },
      rendered,
      { width: imageWidth, height: imageHeight },
      stageWidth,
      stageHeight
    )
    addedAssets.push(asset)
    addedElements.push({
      id: createId(), kind: 'character', assetId: asset.id, characterId: character.id,
      characterSourceUpdatedAt: character.updatedAt, faceRendererVersion,
      activeExpressionCollectionId: 'standard', activeExpressionPresetId: null,
      activeFaceMode: 'idle', characterScale: 100, characterWidthScale: 100, characterHeightScale: 100,
      ...(character.customization.faceAppearance
        ? { expressionBase: { appearance: structuredClone(character.customization.faceAppearance), transforms: {} } }
        : {}),
      characterCanvasWidth, text: character.name, x: 0, y: 0, width, height, rotation: 0, zIndex: ++zIndex
    })
  }

  return {
    elements: [...retainedElements, ...addedElements],
    addedElements,
    addedAssets,
    removedCharacterAssetIds,
    retainedAssetIds
  }
}
