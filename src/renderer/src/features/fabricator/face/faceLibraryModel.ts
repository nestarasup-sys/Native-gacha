import type { FaceComponentAsset, FaceComponentAssetSummary } from '../../../../../shared/fabricator'

type FaceLibraryAsset = Pick<FaceComponentAsset, 'id' | 'kind' | 'name' | 'rightSidePositioned' | 'pairId' | 'dataUrl'>

export function isRightLibraryAsset(asset: Pick<FaceComponentAssetSummary, 'name' | 'rightSidePositioned'>): boolean {
  return asset.rightSidePositioned === true || / · (?:Olho|Olho aberto|Olho fechado|Pupila|Sobrancelha) direit[oa]$/.test(asset.name)
}

export function libraryBaseName(name: string): string {
  return name.replace(/ · (?:Olho|Olho aberto|Olho fechado|Pupila|Sobrancelha) (?:esquerd[oa]|direit[oa])$/, '')
}

export function sameLibraryPair(left: FaceLibraryAsset, right: FaceLibraryAsset): boolean {
  if (left.kind !== right.kind || !isRightLibraryAsset(right)) return false
  if (left.pairId || right.pairId) return Boolean(left.pairId && left.pairId === right.pairId || right.pairId === left.id)
  return libraryBaseName(left.name) === libraryBaseName(right.name) && left.dataUrl === right.dataUrl
}

type FallbackPairs = Map<string, Map<string, Set<string>>>

function addFallbackPair(index: FallbackPairs, asset: FaceLibraryAsset) {
  let names = index.get(asset.kind)
  if (!names) index.set(asset.kind, names = new Map())
  const name = libraryBaseName(asset.name)
  let images = names.get(name)
  if (!images) names.set(name, images = new Set())
  images.add(asset.dataUrl)
}

function hasFallbackPair(index: FallbackPairs, asset: FaceLibraryAsset): boolean {
  return index.get(asset.kind)?.get(libraryBaseName(asset.name))?.has(asset.dataUrl) ?? false
}

function pairIdKey(kind: FaceComponentAsset['kind'], id: string): string {
  return JSON.stringify([kind, id])
}

/** Hides paired right-side duplicates with a single indexed pass over the face library. */
export function visibleFaceLibraryAssets(
  assets: FaceComponentAssetSummary[],
  details: Record<string, FaceComponentAsset>
): FaceComponentAssetSummary[] {
  const leftIds = new Set<string>()
  const leftPairIds = new Set<string>()
  const fallbackPairs: FallbackPairs = new Map()

  for (const summary of assets) {
    if (isRightLibraryAsset(summary)) continue
    const detail = details[summary.id]
    if (!detail) continue
    leftIds.add(pairIdKey(detail.kind, detail.id))
    if (detail.pairId) leftPairIds.add(pairIdKey(detail.kind, detail.pairId))
    else addFallbackPair(fallbackPairs, detail)
  }

  return assets.filter((summary) => {
    if (!isRightLibraryAsset(summary)) return true
    const detail = details[summary.id]
    if (!detail || !isRightLibraryAsset(detail)) return true
    const paired = detail.pairId
      ? leftPairIds.has(pairIdKey(detail.kind, detail.pairId)) || leftIds.has(pairIdKey(detail.kind, detail.pairId))
      : hasFallbackPair(fallbackPairs, detail)
    return !paired
  })
}
