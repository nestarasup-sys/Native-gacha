import type { FabricatorAssetSave, FabricatorProject, FabricatorProjectSave } from '../../../../../shared/fabricator'
import type { ModelSourceResult } from './modelSource'

type PublishModelSourceResultDependencies = {
  current: FabricatorProject | null
  canPublish: boolean
  result: ModelSourceResult
  setPublishing: (publishing: boolean) => void
  setSaveState: (state: 'saved' | 'saving' | 'error') => void
  cancelScheduledSave: () => void
  persistProject: (project: FabricatorProject) => Promise<void>
  serializeProject: (project: FabricatorProject) => FabricatorProjectSave
  publish: (project: FabricatorProjectSave, sourceDataUrl: string, changedAssets: FabricatorAssetSave[]) => Promise<string>
  clearHistory: () => void
  clearDirtyAssets: () => void
  clearDirtyChromaBases: () => void
  clearSeamSurfaces: () => void
  setProject: (project: FabricatorProject) => void
  setChromaValue: (tolerance: number) => void
  closeEditor: () => void
  broadcastModelSourceUpdate: (update: { slot: number; sourceAssetName: string }) => void
  broadcastAssetsUpdated: () => void
  now: () => string
}

/** Publishes a newly composed source only after the current Fabricator project is safe. */
export async function publishModelSourceResult(dependencies: PublishModelSourceResultDependencies): Promise<void> {
  const { current, canPublish, result } = dependencies
  if (!current || !canPublish) throw new Error('O modelo não está disponível para edição.')

  dependencies.setPublishing(true)
  dependencies.setSaveState('saving')
  dependencies.cancelScheduledSave()
  try {
    await dependencies.persistProject(current)
    const next: FabricatorProject = {
      ...current,
      sourceDataUrl: result.sourceDataUrl,
      modelSkinTone: result.modelSkinTone,
      modelOutlineColor: result.modelOutlineColor,
      parts: result.parts,
      joints: result.joints,
      layerOrder: result.layerOrder,
      hiddenPartIds: result.hiddenPartIds,
      tolerance: result.tolerance,
      chromaBaseTolerance: 0,
      chromaVersion: 2,
      updatedAt: dependencies.now()
    }
    const serialized = dependencies.serializeProject(next)
    const changedAssets: FabricatorAssetSave[] = result.parts.map((part) => ({
      id: part.id,
      dataUrl: part.dataUrl,
      ...(part.chromaBaseDataUrl ? { chromaBaseDataUrl: part.chromaBaseDataUrl } : {})
    }))
    const sourceAssetName = await dependencies.publish(serialized, result.sourceDataUrl, changedAssets)
    const published: FabricatorProject = { ...next, sourceAssetName }
    dependencies.clearHistory()
    dependencies.clearDirtyAssets()
    dependencies.clearDirtyChromaBases()
    dependencies.clearSeamSurfaces()
    dependencies.setProject(published)
    dependencies.setChromaValue(result.tolerance)
    dependencies.setSaveState('saved')
    dependencies.closeEditor()
    dependencies.broadcastModelSourceUpdate({ slot: published.slot, sourceAssetName })
    dependencies.broadcastAssetsUpdated()
  } catch (reason) {
    dependencies.setSaveState('error')
    throw reason
  } finally {
    dependencies.setPublishing(false)
  }
}
