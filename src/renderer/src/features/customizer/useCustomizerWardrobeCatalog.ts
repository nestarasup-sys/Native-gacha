import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { WardrobeSet, WardrobeSetSummary } from '../../../../shared/fabricator'
import { clothingCategories } from '../../characters/characterRenderer'
import { renderWardrobeThumbnail } from './wardrobePanelModel'
import { loadCustomizerWardrobeCatalog } from './customizerWardrobeCatalog'

type Dependencies = {
  activeModule: string | null
  headPanelTab: string
  selectedModelSlot: number | null
  wardrobeSets: WardrobeSetSummary[]
  wardrobeThumbnails: Record<string, string>
  setWardrobeSets: Dispatch<SetStateAction<WardrobeSetSummary[]>>
  setWardrobeLoading: Dispatch<SetStateAction<boolean>>
  setWardrobeDetails: Dispatch<SetStateAction<Record<string, WardrobeSet>>>
  setWardrobeThumbnails: Dispatch<SetStateAction<Record<string, string>>>
  setCatalogError: Dispatch<SetStateAction<string>>
}

export function useCustomizerWardrobeCatalog({
  activeModule,
  headPanelTab,
  selectedModelSlot,
  wardrobeSets,
  wardrobeThumbnails,
  setWardrobeSets,
  setWardrobeLoading,
  setWardrobeDetails,
  setWardrobeThumbnails,
  setCatalogError
}: Dependencies) {
  const isVisible = activeModule === 'Roupas' || activeModule === 'Cabeça' && headPanelTab === 'extra'

  useEffect(() => {
    if (!isVisible || selectedModelSlot === null) return
    let cancelled = false
    setWardrobeLoading(true)
    void window.desktop.fabricator.listWardrobeSets(selectedModelSlot).then((sets) => {
      if (!cancelled) setWardrobeSets(sets)
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo de roupas.')
    }).finally(() => { if (!cancelled) setWardrobeLoading(false) })
    return () => { cancelled = true }
  }, [isVisible, selectedModelSlot, setCatalogError, setWardrobeLoading, setWardrobeSets])

  useEffect(() => {
    if (!isVisible || !wardrobeSets.length) return
    let cancelled = false
    void loadCustomizerWardrobeCatalog({
      summaries: wardrobeSets,
      categories: Object.values(clothingCategories).flat(),
      loadSet: (summary) => window.desktop.fabricator.loadWardrobeSet(summary.modelSlot, summary.id),
      hasThumbnail: (key) => Boolean(wardrobeThumbnails[key]),
      renderThumbnail: renderWardrobeThumbnail,
      isCancelled: () => cancelled,
      onSetLoaded: (summary, set) => setWardrobeDetails((current) => ({
        ...current,
        [`${summary.modelSlot}:${summary.id}`]: set
      })),
      onThumbnailLoaded: (key, thumbnail) => setWardrobeThumbnails((current) => ({ ...current, [key]: thumbnail })),
      onError: (reason) => setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível montar a miniatura da roupa.')
    })
    return () => { cancelled = true }
  }, [isVisible, wardrobeSets])
}
