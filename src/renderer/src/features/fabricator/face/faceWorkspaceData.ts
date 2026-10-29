import type {
  FaceAssetKind,
  FaceCatalogItem,
  FaceCatalogItemSummary,
  FaceComponentAsset,
  FaceComponentAssetSummary,
  FabricatorDesktopApi,
  FabricatorProject
} from '../../../../../shared/fabricator'
import { createConcurrencyLimiter } from '../../../ui/concurrencyLimiter.ts'
import { mapConcurrentItems } from '../../../ui/mapConcurrentItems.ts'

export type FaceWorkspaceDataApi = Pick<FabricatorDesktopApi,
  'loadFabricatorSlot' | 'listFaceComponentAssets' | 'loadFaceComponentAsset' | 'listFaceCatalog' | 'loadFaceCatalogItem'
>

export type FaceComponentWorkspaceData = {
  project: FabricatorProject | null
  assets: FaceComponentAssetSummary[]
  details: Record<string, FaceComponentAsset>
}

export type FaceCatalogWorkspaceData = {
  mouthCatalog: FaceCatalogItemSummary[]
  mouthDetails: Record<string, FaceCatalogItem>
  noseCatalog: FaceCatalogItemSummary[]
  noseDetails: Record<string, FaceCatalogItem>
}

const FACE_IMAGE_LOAD_CONCURRENCY = 4

const scheduleFaceImageLoad = createConcurrencyLimiter(FACE_IMAGE_LOAD_CONCURRENCY)

async function loadDetailsWithLimit<TSummary, TDetail>(
  summaries: TSummary[],
  loadDetail: (summary: TSummary) => Promise<TDetail | null>,
  isCancelled: () => boolean
): Promise<Array<TDetail | null>> {
  return mapConcurrentItems(
    summaries,
    (summary) => scheduleFaceImageLoad(() => loadDetail(summary), isCancelled),
    isCancelled,
    FACE_IMAGE_LOAD_CONCURRENCY
  )
}

export async function loadFaceComponentWorkspaceData(
  api: FaceWorkspaceDataApi,
  modelSlot: number,
  visibleKinds: FaceAssetKind[],
  isCancelled: () => boolean
): Promise<FaceComponentWorkspaceData | null> {
  const [project, assetLists] = await Promise.all([
    api.loadFabricatorSlot(modelSlot),
    Promise.all(visibleKinds.map((kind) => api.listFaceComponentAssets(modelSlot, kind)))
  ])
  if (isCancelled()) return null

  const assets = assetLists.flat()
  const loaded = await loadDetailsWithLimit(assets, (asset) => api.loadFaceComponentAsset(modelSlot, asset.id), isCancelled)
  if (isCancelled()) return null
  const details = Object.fromEntries(loaded.filter((asset): asset is FaceComponentAsset => Boolean(asset)).map((asset) => [asset.id, asset]))
  return { project, assets, details }
}

export async function loadFaceCatalogWorkspaceData(
  api: FaceWorkspaceDataApi,
  modelSlot: number,
  isCancelled: () => boolean
): Promise<FaceCatalogWorkspaceData | null> {
  const catalog = await api.listFaceCatalog(modelSlot)
  if (isCancelled()) return null

  const relevant = catalog.filter((item) => item.category === 'nose' || item.category === 'mouth-closed' || item.category === 'mouth-open')
  const loaded = await loadDetailsWithLimit(relevant, (item) => api.loadFaceCatalogItem(modelSlot, item.id), isCancelled)
  if (isCancelled()) return null

  const entries = loaded.filter((item): item is FaceCatalogItem => Boolean(item))
  return {
    mouthCatalog: relevant.filter((item) => item.category === 'mouth-closed' || item.category === 'mouth-open'),
    mouthDetails: Object.fromEntries(entries.filter((item) => item.category !== 'nose').map((item) => [item.id, item])),
    noseCatalog: relevant.filter((item) => item.category === 'nose'),
    noseDetails: Object.fromEntries(entries.filter((item) => item.category === 'nose').map((item) => [item.id, item]))
  }
}
