import type { FaceComponentAsset, FaceExpressionSelections } from '../../../../shared/fabricator'

/** Resolves and deduplicates the eye images needed by the current preview. */
export function selectedEyeAssetsByIds(
  ids: readonly (string | null | undefined)[],
  assets: Record<string, FaceComponentAsset>
): FaceComponentAsset[] {
  const selectedIds = new Set(ids.filter((id): id is string => Boolean(id)))
  return [...selectedIds].flatMap((id) => {
    const asset = assets[id]
    return asset?.kind === 'eye' ? [asset] : []
  })
}

export function selectedExpressionEyeAssets(
  eyes: FaceExpressionSelections['eyes'],
  assets: Record<string, FaceComponentAsset>
): FaceComponentAsset[] {
  return selectedEyeAssetsByIds([eyes.left, eyes.right], assets)
}
