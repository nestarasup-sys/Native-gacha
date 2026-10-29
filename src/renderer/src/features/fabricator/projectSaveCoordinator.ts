import type { FabricatorAssetSave, FabricatorProject, FabricatorProjectSave } from '../../../../shared/fabricator'
import { persistFabricatorProjectSnapshot } from './projectPersistence.ts'

type MutableValue<T> = { current: T }
type SaveState = 'saved' | 'saving' | 'error'

type FabricatorProjectSaveDependencies = {
  projectRef: MutableValue<FabricatorProject | null>
  dirtyAssets: MutableValue<Map<string, string>>
  dirtyChromaBases: MutableValue<Map<string, string>>
  saveProject: (project: FabricatorProjectSave, changedAssets: FabricatorAssetSave[]) => Promise<void>
  setSaveState: (state: SaveState) => void
  setError: (message: string) => void
  onProjectSaved: (snapshot: FabricatorProject) => void
  debounceMs?: number
}

/** Owns the serialized autosave lane and its flush/cancel lifecycle for one mounted project editor. */
export function createFabricatorProjectSaveCoordinator(deps: FabricatorProjectSaveDependencies) {
  let writeQueue: Promise<void> = Promise.resolve()
  let savedTimer: ReturnType<typeof setTimeout> | null = null

  const cancelScheduledSave = () => {
    if (savedTimer !== null) clearTimeout(savedTimer)
    savedTimer = null
  }

  const persistProject = (snapshot: FabricatorProject): Promise<void> => {
    const current = writeQueue.catch(() => undefined).then(async () => {
      const assets = await persistFabricatorProjectSnapshot(
        snapshot,
        deps.dirtyAssets.current,
        deps.dirtyChromaBases.current,
        deps.saveProject
      )
      for (const asset of assets) {
        if (deps.dirtyAssets.current.get(asset.id) === asset.dataUrl) deps.dirtyAssets.current.delete(asset.id)
        if (asset.chromaBaseDataUrl && deps.dirtyChromaBases.current.get(asset.id) === asset.chromaBaseDataUrl) {
          deps.dirtyChromaBases.current.delete(asset.id)
        }
      }
      deps.setSaveState('saved')
      deps.onProjectSaved(snapshot)
    })
    writeQueue = current
    return current
  }

  const scheduleSave = (snapshot: FabricatorProject | null) => {
    cancelScheduledSave()
    if (!snapshot) {
      deps.setSaveState('saved')
      return cancelScheduledSave
    }

    deps.setSaveState('saving')
    const timer = setTimeout(() => {
      if (savedTimer === timer) savedTimer = null
      void persistProject(deps.projectRef.current ?? snapshot).catch((reason: unknown) => {
        deps.setSaveState('error')
        deps.setError(reason instanceof Error ? `Falha ao salvar: ${reason.message}` : 'Falha ao salvar o projeto.')
      })
    }, deps.debounceMs ?? 700)
    savedTimer = timer

    return () => {
      if (savedTimer !== timer) return
      clearTimeout(timer)
      savedTimer = null
    }
  }

  const flushProjectWrites = async () => {
    const hadPendingTimer = savedTimer !== null
    cancelScheduledSave()
    try {
      if (hadPendingTimer && deps.projectRef.current) await persistProject(deps.projectRef.current)
      await writeQueue
    } catch (reason) {
      deps.setSaveState('error')
      deps.setError(reason instanceof Error ? `Falha ao salvar o projeto: ${reason.message}` : 'Falha ao salvar o projeto.')
      throw reason
    }
  }

  const waitForProjectWrites = () => writeQueue.catch(() => undefined)

  return { persistProject, scheduleSave, cancelScheduledSave, flushProjectWrites, waitForProjectWrites }
}
