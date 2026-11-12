import type { EditorV6Document } from '../../../../shared/editorV6'
import { trimTransparentImage } from '../../characters/transparentImageTrim'
import type { TrimmedImage } from '../../characters/transparentImageTrim'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems'
import { editorV6LegacyCharacterCropAssetIds } from './editorV6CharacterRefreshModel'

export type EditorV6CharacterAssetCrop = { assetId: string; crop: TrimmedImage }

/** Prepare legacy scene-image crops without mutating the project or deciding when to persist them. */
export async function prepareEditorV6LegacyCharacterCrops(
  project: EditorV6Document,
  isCancelled: () => boolean,
  trimImage: (dataUrl: string) => Promise<TrimmedImage | null> = trimTransparentImage
): Promise<EditorV6CharacterAssetCrop[] | null> {
  const referencedAssetIds = editorV6LegacyCharacterCropAssetIds(project)
  const assets = project.assets.filter((asset) => asset.category === 'character' && referencedAssetIds.has(asset.id))
  const results = await mapConcurrentItems(assets, async (asset) => {
    const crop = await trimImage(asset.dataUrl)
    return crop ? { assetId: asset.id, crop } : null
  }, isCancelled)
  if (isCancelled()) return null
  return results.filter((entry): entry is EditorV6CharacterAssetCrop => entry !== null)
}
