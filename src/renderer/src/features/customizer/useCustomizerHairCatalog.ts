import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { HairStyleSummary } from '../../../../shared/fabricator'

/** Controla os resumos do catálogo enquanto a área de cabelos está ativa. */
export function useCustomizerHairCatalog(deps: {
  active: boolean
  selectedModelSlot: number | null
  setHairStyles: Dispatch<SetStateAction<HairStyleSummary[]>>
  setHairLoading: Dispatch<SetStateAction<boolean>>
  setCatalogError: Dispatch<SetStateAction<string>>
}) {
  const { active, selectedModelSlot, setHairStyles, setHairLoading, setCatalogError } = deps

  useEffect(() => {
    if (!active || selectedModelSlot === null) {
      setHairStyles([])
      setHairLoading(false)
      return
    }

    let cancelled = false
    setHairStyles([])
    setHairLoading(true)
    void window.desktop.fabricator.listHairStyles(selectedModelSlot).then((summaries) => {
      if (cancelled) return
      setHairStyles(summaries)
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo de cabelos.')
    }).finally(() => { if (!cancelled) setHairLoading(false) })
    return () => { cancelled = true }
  }, [active, selectedModelSlot, setHairStyles, setHairLoading, setCatalogError])
}
