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

export type FaceComponentWorkspaceApi = Pick<FabricatorDesktopApi,
  'loadFabricatorSlot' | 'listFaceComponentAssets' | 'loadFaceComponentAsset'
>
export type FaceCatalogWorkspaceApi = Pick<FabricatorDesktopApi, 'listFaceCatalog' | 'loadFaceCatalogItem'>

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

export type FaceCatalogWorkspaceSummaries = Pick<FaceCatalogWorkspaceData, 'mouthCatalog' | 'noseCatalog'>
export type FaceCatalogWorkspaceDetails = Pick<FaceCatalogWorkspaceData, 'mouthDetails' | 'noseDetails'>

export type FaceCatalogLoadOptions = {
  activeCategory: 'nose' | 'mouth' | 'selected' | 'all'
  mouthKind: 'mouth-closed' | 'mouth-open'
  selectedMouthId: string | null
  selectedNoseId: string | null
}

const loadAllFaceCatalogDetails: FaceCatalogLoadOptions = {
  activeCategory: 'all',
  mouthKind: 'mouth-closed',
  selectedMouthId: null,
  selectedNoseId: null
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
  api: FaceComponentWorkspaceApi,
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

export async function listFaceCatalogWorkspaceSummaries(
  api: FaceCatalogWorkspaceApi,
  modelSlot: number,
  isCancelled: () => boolean
): Promise<FaceCatalogWorkspaceSummaries | null> {
  const catalog = await api.listFaceCatalog(modelSlot)
  if (isCancelled()) return null

  const relevant = catalog.filter((item) => item.category === 'nose' || item.category === 'mouth-closed' || item.category === 'mouth-open')
  return {
    mouthCatalog: relevant.filter((item) => item.category === 'mouth-closed' || item.category === 'mouth-open'),
    noseCatalog: relevant.filter((item) => item.category === 'nose')
  }
}

export async function loadFaceCatalogWorkspaceDetails(
  api: FaceCatalogWorkspaceApi,
  modelSlot: number,
  summaries: FaceCatalogWorkspaceSummaries,
  options: FaceCatalogLoadOptions,
  isCancelled: () => boolean
): Promise<FaceCatalogWorkspaceDetails | null> {
  const { mouthCatalog, noseCatalog } = summaries
  const relevant = [...noseCatalog, ...mouthCatalog]
  if (isCancelled()) return null
  const availableMouthKind = mouthCatalog.some((item) => item.category === options.mouthKind)
    ? options.mouthKind
    : mouthCatalog[0]?.category
  const selectedMouth = mouthCatalog.find((item) => item.id === options.selectedMouthId && item.category === availableMouthKind)
    ?? mouthCatalog.find((item) => item.category === availableMouthKind)
  const selectedNose = noseCatalog.find((item) => item.id === options.selectedNoseId) ?? noseCatalog[0]
  const firstClosedMouth = mouthCatalog.find((item) => item.category === 'mouth-closed')
  const mouthReference = selectedMouth?.category === 'mouth-open' ? firstClosedMouth : undefined

  const detailIds = new Set<string>()
  if (options.activeCategory === 'all') relevant.forEach((item) => detailIds.add(item.id))
  if (options.activeCategory === 'nose') noseCatalog.forEach((item) => detailIds.add(item.id))
  // Shared mouth placement edits update every closed/open variant together.
  if (options.activeCategory === 'mouth') mouthCatalog.forEach((item) => detailIds.add(item.id))
  for (const item of [selectedMouth, selectedNose, mouthReference]) {
    if (item) detailIds.add(item.id)
  }

  const requestedDetails = relevant.filter((item) => detailIds.has(item.id))
  const loaded = await loadDetailsWithLimit(requestedDetails, (item) => api.loadFaceCatalogItem(modelSlot, item.id), isCancelled)
  if (isCancelled()) return null

  const entries = loaded.filter((item): item is FaceCatalogItem => Boolean(item))
  return {
    mouthDetails: Object.fromEntries(entries.filter((item) => item.category !== 'nose').map((item) => [item.id, item])),
    noseDetails: Object.fromEntries(entries.filter((item) => item.category === 'nose').map((item) => [item.id, item]))
  }
}

export async function loadFaceCatalogWorkspaceData(
  api: FaceCatalogWorkspaceApi,
  modelSlot: number,
  isCancelled: () => boolean,
  options: FaceCatalogLoadOptions = loadAllFaceCatalogDetails
): Promise<FaceCatalogWorkspaceData | null> {
  const summaries = await listFaceCatalogWorkspaceSummaries(api, modelSlot, isCancelled)
  if (!summaries || isCancelled()) return null
  const details = await loadFaceCatalogWorkspaceDetails(api, modelSlot, summaries, options, isCancelled)
  return details ? { ...summaries, ...details } : null
}
