/** Resolução compartilhada e não-mutante de modelo/pose do personagem.
 * Fabricador fornece fontes permanentes; Customizador aplica somente overrides
 * em memória; Os fluxos do Studio e do Customizador compartilham a geometria.
 */
import type { FabricatorProject } from '../../../shared/fabricator'
import { applyCurrentModelSkinContours } from '../../../shared/fabricatorModelViews'
import type { CustomizerCharacter } from '../../../shared/customizer'
import { getCharacterBodyDimensions, getCharacterProportions, type CharacterProportions } from '../../../shared/customizer'
import { applyCharacterBodyShape } from '../../../shared/bodyShape'
import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'
import { isTorsoPart } from '../../../shared/modelRig'

export type CatalogArtwork = Pick<FabricatorProject, 'width' | 'height' | 'parts' | 'layerOrder' | 'hiddenPartIds'> & Partial<Pick<FabricatorProject, 'joints'>>

export function withCharacterHeadSize(artwork: CatalogArtwork, proportions: CharacterProportions): CatalogArtwork {
  const scaleX = proportions.head * proportions.headWidth / 10000
  const scaleY = proportions.head * proportions.headHeight / 10000
  if (scaleX === 1 && scaleY === 1) return artwork
  const head = artwork.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  if (!head) return artwork
  return {
    ...artwork,
    parts: artwork.parts.map((part) => part.id === head.id ? {
      ...part,
      x: part.x - (part.width * scaleX - part.width) / 2,
      y: part.y - (part.height * scaleY - part.height),
      width: part.width * scaleX,
      height: part.height * scaleY
    } : part)
  }
}

export function characterShapeScale(proportions: CharacterProportions): { x: number; y: number } {
  return { x: proportions.scale * proportions.width / 10000, y: proportions.scale * proportions.height / 10000 }
}

export function withCharacterGenderTorso(artwork: CatalogArtwork, source: FabricatorProject, gender: CustomizerCharacter['customization']['gender']): CatalogArtwork {
  if (gender !== 'male' || !source.maleTorso) return artwork
  const sourceTorso = source.parts.find(isTorsoPart)
  const targetTorso = artwork.parts.find(isTorsoPart)
  if (!sourceTorso || !targetTorso) return artwork
  const scaleX = sourceTorso.width > 0 ? source.maleTorso.width / sourceTorso.width : 1
  const scaleY = sourceTorso.height > 0 ? source.maleTorso.height / sourceTorso.height : 1
  return {
    ...artwork,
    parts: artwork.parts.map((part) => part.id === targetTorso.id ? {
      ...part,
      dataUrl: source.maleTorso!.dataUrl,
      x: part.x + source.maleTorso!.x - sourceTorso.x,
      y: part.y + source.maleTorso!.y - sourceTorso.y,
      width: part.width * scaleX,
      height: part.height * scaleY,
      rotation: part.rotation + source.maleTorso!.rotation - sourceTorso.rotation,
      fakeSkinContours: source.maleTorso!.fakeSkinContours
    } : part)
  }
}


export async function resolveSavedCharacterSource(
  character: CustomizerCharacter,
  renderSource?: { artwork: CatalogArtwork; source: FabricatorProject; assetProvider?: CharacterRenderAssetProvider }
): Promise<{ modelSlot: number; assetProvider: CharacterRenderAssetProvider; source: FabricatorProject; sourceArtwork: CatalogArtwork; artwork: CatalogArtwork }> {
  const modelSlot = character.customization.modelSlot ?? 1
  const assetProvider = renderSource?.assetProvider ?? window.desktop.fabricator
  // Cached snapshots can outlive a character's model selection. Never pair a
  // pose/source from another slot with this character's wardrobe references.
  const renderSourceMatchesModel = renderSource?.source.slot === modelSlot
  const source = renderSourceMatchesModel ? renderSource.source : await assetProvider.loadFabricatorSlot(modelSlot)
  if (!source) throw new Error(`O modelo de ${character.name} não está disponível.`)
  const pose = renderSourceMatchesModel ? renderSource.artwork
    : character.customization.poseSlot === null ? null : await assetProvider.loadFabricatorPose(modelSlot, character.customization.poseSlot)
  const proportions = getCharacterProportions(character.customization)
  const sourceArtwork = pose ?? source
  const artworkWithModelContours = {
    ...sourceArtwork,
    parts: applyCurrentModelSkinContours(sourceArtwork.parts, source.parts)
  }
  const genderArtwork = withCharacterGenderTorso(artworkWithModelContours, source, character.customization.gender)
  const artwork = applyCharacterBodyShape(withCharacterHeadSize(genderArtwork, proportions), getCharacterBodyDimensions(character.customization))
  // Keep the unshaped model/pose available to renderer preparation. Passing
  // `artwork` back into this resolver would apply the character's dimensions a
  // second time, which made refreshed Editor V6 snapshots wider than preview.
  return { modelSlot, assetProvider, source, sourceArtwork, artwork }
}
