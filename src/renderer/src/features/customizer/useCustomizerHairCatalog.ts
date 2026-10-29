import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { HairStyle, HairStyleSummary } from '../../../../shared/fabricator'
import { loadCustomizerHairDetails } from './customizerHairCatalog'

/** Controla os resumos e o carregamento limitado enquanto a área de cabelos está ativa. */
export function useCustomizerHairCatalog(deps: {
  active: boolean
  selectedModelSlot: number | null
  setHairStyles: Dispatch<SetStateAction<HairStyleSummary[]>>
  setHairDetails: Dispatch<SetStateAction<Record<string, HairStyle>>>
  setHairLoading: Dispatch<SetStateAction<boolean>>
  setCatalogError: Dispatch<SetStateAction<string>>
}) {
  const { active, selectedModelSlot, setHairStyles, setHairDetails, setHairLoading, setCatalogError } = deps

  useEffect(() => {
    if (!active || selectedModelSlot === null) {
      setHairStyles([])
      setHairLoading(false)
      return
    }

    let cancelled = false
    setHairLoading(true)
    void window.desktop.fabricator.listHairStyles(selectedModelSlot).then(async (summaries) => {
      const styles = await loadCustomizerHairDetails(
        summaries,
        () => cancelled,
        (id) => window.desktop.fabricator.loadHairStyle(selectedModelSlot, id)
      )
      if (cancelled) return
      setHairStyles(summaries)
      setHairDetails((current) => {
        const next = { ...current }
        for (const style of styles) next[`${selectedModelSlot}:${style.id}`] = style
        return next
      })
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo de cabelos.')
    }).finally(() => { if (!cancelled) setHairLoading(false) })
    return () => { cancelled = true }
  }, [active, selectedModelSlot, setHairStyles, setHairDetails, setHairLoading, setCatalogError])
}
