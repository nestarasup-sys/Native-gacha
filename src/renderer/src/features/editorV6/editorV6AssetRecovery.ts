import type { EditorV6Document } from '../../../../shared/editorV6'

/**
 * A stale renderer update can drop a referenced snapshot from its asset array.
 * Restore only character images with the same stable ID from the last saved
 * document; never guess a replacement image or change element references.
 */
export function restorePersistedCharacterAssets(
  document: EditorV6Document,
  persisted: EditorV6Document
): EditorV6Document {
  const requiredIds = new Set<string>()
  const collectCharacterAssets = (state: EditorV6Document['elements'][number] | undefined) => {
    if (state?.kind !== 'character') return
    if (state.assetId) requiredIds.add(state.assetId)
    for (const assetId of Object.values(state.faceModeAssetIds ?? {})) if (assetId) requiredIds.add(assetId)
  }
  document.elements.forEach(collectCharacterAssets)
  for (const track of document.timeline.tracks) {
    for (const block of track.blocks) {
      collectCharacterAssets(block.state)
      if (block.incomingMotion) {
        requiredIds.add(block.incomingMotion.assetId)
        if (block.incomingMotion.faceAssetId) requiredIds.add(block.incomingMotion.faceAssetId)
      }
    }
  }

  const availableIds = new Set(document.assets.filter((asset) => asset.category === 'character').map((asset) => asset.id))
  const persistedById = new Map(persisted.assets.filter((asset) => asset.category === 'character').map((asset) => [asset.id, asset]))
  const restored = [...requiredIds]
    .filter((id) => !availableIds.has(id))
    .map((id) => persistedById.get(id))
    .filter((asset): asset is NonNullable<typeof asset> => asset !== undefined)

  if (!restored.length) return document
  const restoredIds = new Set(restored.map((asset) => asset.id))
  return {
    ...document,
    assets: [
      ...document.assets.filter((asset) => !restoredIds.has(asset.id)),
      ...restored
    ]
  }
}
