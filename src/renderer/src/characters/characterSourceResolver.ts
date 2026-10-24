/** Resolução compartilhada e não-mutante de modelo/pose do personagem.
 * Fabricador fornece fontes permanentes; Customizador aplica somente overrides
 * em memória; Os fluxos do Studio e do Customizador compartilham a geometria.
 */
import type { FabricatorProject } from '../../../shared/fabricator'
import type { CustomizerCharacter } from '../../../shared/customizer'
import { getCharacterBodyDimensions, getCharacterProportions, type CharacterProportions } from '../../../shared/customizer'
import { applyCharacterBodyShape } from '../../../shared/bodyShape'
import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'

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


export async function resolveSavedCharacterSource(
  character: CustomizerCharacter,
  renderSource?: { artwork: CatalogArtwork; source: FabricatorProject; assetProvider?: CharacterRenderAssetProvider }
): Promise<{ modelSlot: number; assetProvider: CharacterRenderAssetProvider; source: FabricatorProject; artwork: CatalogArtwork }> {
  const modelSlot = character.customization.modelSlot ?? 1
  const assetProvider = renderSource?.assetProvider ?? window.desktop
  const source = renderSource?.source ?? await assetProvider.loadFabricatorSlot(modelSlot)
  if (!source) throw new Error(`O modelo de ${character.name} não está disponível.`)
  const pose = renderSource?.artwork ?? (character.customization.poseSlot === null ? null : await assetProvider.loadFabricatorPose(modelSlot, character.customization.poseSlot))
  const proportions = getCharacterProportions(character.customization)
  const artwork = applyCharacterBodyShape(withCharacterHeadSize(pose ?? source, proportions), getCharacterBodyDimensions(character.customization))
  return { modelSlot, assetProvider, source, artwork }
}
