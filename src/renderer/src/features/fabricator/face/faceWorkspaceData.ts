import type {
  FaceAssetKind,
  FaceCatalogItem,
  FaceCatalogItemSummary,
  FaceComponentAsset,
  FaceComponentAssetSummary,
  FabricatorDesktopApi,
  FabricatorProject
} from '../../../../../shared/fabricator'

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

type FaceImageLoadTask = {
  load: () => Promise<unknown | null>
  isCancelled: () => boolean
  resolve: (value: unknown | null) => void
  reject: (reason: unknown) => void
}

function createFaceImageLoadQueue(maxConcurrency: number) {
  let active = 0
  const pending: FaceImageLoadTask[] = []

  const drain = () => {
    while (active < maxConcurrency && pending.length > 0) {
      const task = pending.shift()!
      if (task.isCancelled()) {
        task.resolve(null)
        continue
      }
      active += 1
      void Promise.resolve().then(task.load).then(task.resolve, task.reject).finally(() => {
        active -= 1
        drain()
      })
    }
  }

  return function schedule<T>(load: () => Promise<T | null>, isCancelled: () => boolean): Promise<T | null> {
    return new Promise<T | null>((resolve, reject) => {
      pending.push({ load, isCancelled, resolve: (value) => resolve(value as T | null), reject })
      drain()
    })
  }
}

const scheduleFaceImageLoad = createFaceImageLoadQueue(FACE_IMAGE_LOAD_CONCURRENCY)

async function loadDetailsWithLimit<TSummary, TDetail>(
  summaries: TSummary[],
  loadDetail: (summary: TSummary) => Promise<TDetail | null>,
  isCancelled: () => boolean
): Promise<Array<TDetail | null>> {
  const details = new Array<TDetail | null>(summaries.length)
  const workerCount = Math.min(FACE_IMAGE_LOAD_CONCURRENCY, summaries.length)
  let nextIndex = 0
  let failed = false
  let failure: unknown

  const worker = async () => {
    while (!failed && !isCancelled()) {
      const index = nextIndex++
      if (index >= summaries.length) return
      try {
        details[index] = await scheduleFaceImageLoad(() => loadDetail(summaries[index]), isCancelled)
      } catch (reason) {
        failed = true
        failure = reason
        return
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker))
  if (failed) throw failure
  return details
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
