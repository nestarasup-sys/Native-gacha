import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { FabricatorPose, FabricatorPoseSummary, FabricatorSlotSummary } from '../../../../shared/fabricator'
import { renderArtwork } from '../../characters/characterRenderer'
import type { CatalogArtwork } from '../../characters/characterRenderer'

export type CatalogThumbnailDependencies = {
  activeModule: string | null
  selectedCustomizerTopTab: string
  selectedCatalogModelSlot: number | null
  catalogLoading: boolean
  catalogModels: FabricatorSlotSummary[]
  catalogPoses: FabricatorPoseSummary[]
  setModelThumbnails: Dispatch<SetStateAction<Record<number, string>>>
  setPoseThumbnails: Dispatch<SetStateAction<Record<string, string>>>
  setCatalogError: Dispatch<SetStateAction<string>>
}

/** Builds and caches the Fabricator previews shown by the model and pose selectors. */
export function useCustomizerCatalogThumbnails(deps: CatalogThumbnailDependencies): void {
  const {
    activeModule,
    selectedCustomizerTopTab,
    selectedCatalogModelSlot,
    catalogLoading,
    catalogModels,
    catalogPoses,
    setModelThumbnails,
    setPoseThumbnails,
    setCatalogError
  } = deps
  const thumbnailCache = useRef(new Set<string>())

  useEffect(() => {
    if (activeModule !== 'Modelos' || catalogLoading) return
    let cancelled = false
    void (async () => {
      for (const model of catalogModels) {
        if (!model || model.recoveryRequired || thumbnailCache.current.has(`model:${model.slot}`)) continue
        let artwork: CatalogArtwork | null = null
        const firstPose = catalogPoses.find((pose) => pose?.sourceModelSlot === model.slot && pose.slot === 1)
        try {
          if (firstPose) artwork = await window.desktop.fabricator.loadFabricatorPose(model.slot, 1)
          if (!artwork) artwork = await window.desktop.fabricator.loadFabricatorSlot(model.slot)
          if (!artwork) continue
          const thumbnail = await renderArtwork(artwork, 144)
          if (cancelled) return
          if (thumbnail) {
            thumbnailCache.current.add(`model:${model.slot}`)
            setModelThumbnails((current) => ({ ...current, [model.slot]: thumbnail }))
          }
        } catch (reason) {
          if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível gerar uma miniatura do modelo.')
        }
      }
    })()
    return () => { cancelled = true }
  }, [activeModule, catalogLoading, catalogModels, catalogPoses, setCatalogError, setModelThumbnails])

  useEffect(() => {
    if ((activeModule !== 'Poses' && selectedCustomizerTopTab !== 'modelos') || selectedCatalogModelSlot === null || catalogLoading
      || catalogModels.some((model) => model?.slot === selectedCatalogModelSlot && model.recoveryRequired)) return
    let cancelled = false
    const modelPoses = catalogPoses.filter((pose): pose is NonNullable<typeof pose> => pose?.sourceModelSlot === selectedCatalogModelSlot)
    void (async () => {
      for (const pose of modelPoses) {
        const key = `${pose.sourceModelSlot}:${pose.slot}`
        const cacheKey = `pose-tight-v2:${key}:${pose.updatedAt}`
        if (thumbnailCache.current.has(cacheKey)) continue
        try {
          const artwork: FabricatorPose | null = await window.desktop.fabricator.loadFabricatorPose(pose.sourceModelSlot, pose.slot)
          if (!artwork) continue
          const thumbnail = await renderArtwork(artwork, 420, undefined, true)
          if (cancelled) return
          if (thumbnail) {
            thumbnailCache.current.add(cacheKey)
            setPoseThumbnails((current) => ({ ...current, [key]: thumbnail }))
          }
        } catch (reason) {
          if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível gerar uma miniatura da pose.')
        }
      }
    })()
    return () => { cancelled = true }
  }, [activeModule, catalogLoading, catalogPoses, selectedCatalogModelSlot, selectedCustomizerTopTab, setCatalogError, setPoseThumbnails])
}
