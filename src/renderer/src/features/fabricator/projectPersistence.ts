import type { FabricatorAssetSave, FabricatorProject, FabricatorProjectSave } from '../../../../shared/fabricator'
import { serializeFabricatorProject } from './models/projectSerialization'

type SaveProject = (project: FabricatorProjectSave, changedAssets: FabricatorAssetSave[]) => Promise<void>

/** Saves model metadata and changed assets, recovering assets missing from storage. */
export async function persistFabricatorProjectSnapshot(
  snapshot: FabricatorProject,
  dirtyAssets: Map<string, string>,
  dirtyChromaBases: Map<string, string>,
  saveProject: SaveProject
): Promise<FabricatorAssetSave[]> {
  let assets: FabricatorAssetSave[] = Array.from(dirtyAssets, ([id, dataUrl]) => ({
    id,
    dataUrl,
    ...(dirtyChromaBases.has(id) ? { chromaBaseDataUrl: dirtyChromaBases.get(id)! } : {})
  }))
  const baseAssets = snapshot.parts.flatMap((part) => dirtyChromaBases.has(part.id) && !dirtyAssets.has(part.id)
    ? [{ id: part.id, dataUrl: part.dataUrl, chromaBaseDataUrl: dirtyChromaBases.get(part.id)! }]
    : [])
  assets = [...assets, ...baseAssets]
  const serialized = serializeFabricatorProject(snapshot)

  try {
    await saveProject(serialized, assets)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    const missing = /FABRICATOR_MISSING_ASSETS:([a-zA-Z0-9_,.-]+)/.exec(message)?.[1]?.split(',') ?? []
    if (!missing.length) throw reason
    const recoverable = missing.flatMap((id) => {
      const part = snapshot.parts.find((item) => item.id === id)
      if (!part) return []
      const chromaBaseDataUrl = dirtyChromaBases.get(id) ?? (part.chromaBaseSaved ? part.chromaBaseDataUrl : undefined)
      if (part.chromaBaseSaved && !chromaBaseDataUrl) return []
      return [{ id, dataUrl: part.dataUrl, ...(chromaBaseDataUrl ? { chromaBaseDataUrl } : {}) }]
    })
    if (recoverable.length !== missing.length) throw reason
    for (const asset of recoverable) dirtyAssets.set(asset.id, asset.dataUrl)

    const byId = new Map(assets.map((asset) => [asset.id, asset]))
    for (const asset of recoverable) {
      const existing = byId.get(asset.id)
      const chromaBaseDataUrl = asset.chromaBaseDataUrl ?? existing?.chromaBaseDataUrl
      byId.set(asset.id, {
        ...(existing ?? {}),
        ...asset,
        ...(chromaBaseDataUrl ? { chromaBaseDataUrl } : {})
      })
    }
    assets = Array.from(byId.values())
    await saveProject(serialized, assets)
  }

  return assets
}
