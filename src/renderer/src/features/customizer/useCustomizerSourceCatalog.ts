import { useEffect } from 'react'
import type { FabricatorPoseSummary, FabricatorSlotSummary } from '../../../../shared/fabricator'

export type CustomizerCatalogLoadDependencies = {
  requestRef: { current: number }
  listModels: () => Promise<FabricatorSlotSummary[]>
  listPoses: () => Promise<FabricatorPoseSummary[]>
  setModels: (models: FabricatorSlotSummary[]) => void
  setPoses: (poses: FabricatorPoseSummary[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
  setPreviewLoading: (loading: boolean) => void
}

export function startCustomizerSourceCatalogLoad(dependencies: CustomizerCatalogLoadDependencies) {
  let cancelled = false
  const completion = Promise.all([dependencies.listModels(), dependencies.listPoses()])
    .then(([models, poses]) => {
      if (cancelled) return
      dependencies.setModels(models)
      dependencies.setPoses(poses)
    })
    .catch((reason: unknown) => {
      if (!cancelled) {
        dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo.')
        dependencies.setPreviewLoading(false)
      }
    })
    .finally(() => {
      if (!cancelled) dependencies.setLoading(false)
    })

  return {
    completion,
    cancel: () => {
      cancelled = true
      dependencies.requestRef.current += 1
    }
  }
}

export function useCustomizerSourceCatalog(dependencies: Omit<CustomizerCatalogLoadDependencies, 'listModels' | 'listPoses'>) {
  const { requestRef, setModels, setPoses, setLoading, setError, setPreviewLoading } = dependencies

  useEffect(() => {
    const task = startCustomizerSourceCatalogLoad({
      requestRef,
      listModels: () => window.desktop.fabricator.listFabricatorSlots(),
      listPoses: () => window.desktop.fabricator.listFabricatorPoseSlots(),
      setModels,
      setPoses,
      setLoading,
      setError,
      setPreviewLoading
    })
    return task.cancel
  }, [requestRef, setModels, setPoses, setLoading, setError, setPreviewLoading])
}
