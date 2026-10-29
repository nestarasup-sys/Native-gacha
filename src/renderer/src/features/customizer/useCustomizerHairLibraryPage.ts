import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { HairPartId } from '../../../../shared/customizer'
import type { HairStyle, HairStyleSummary } from '../../../../shared/fabricator'
import { hairCategories } from '../../../../shared/hairCategories.ts'
import { loadCustomizerHairLibraryPageDetails } from './customizerHairCatalog'

/** Decodifica somente as prévias visíveis da biblioteca de cabelos. */
export function useCustomizerHairLibraryPage(deps: {
  active: boolean
  modelSlot: number | null
  partId: HairPartId | null
  visibleStyles: HairStyleSummary[]
  hairDetails: Record<string, HairStyle>
  setHairDetails: Dispatch<SetStateAction<Record<string, HairStyle>>>
  setCatalogError: Dispatch<SetStateAction<string>>
}) {
  const { active, modelSlot, partId, visibleStyles, hairDetails, setHairDetails, setCatalogError } = deps
  const [loading, setLoading] = useState(false)
  const hairDetailsRef = useRef(hairDetails)
  hairDetailsRef.current = hairDetails
  const side = hairCategories.find((part) => part.id === partId)?.side

  useEffect(() => {
    if (!active || modelSlot === null || !partId || !side || visibleStyles.length === 0) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    void loadCustomizerHairLibraryPageDetails(
      visibleStyles,
      () => cancelled,
      (summary) => {
        const loaded = hairDetailsRef.current[`${modelSlot}:${summary.id}`]
        return loaded?.updatedAt === summary.updatedAt && Boolean(loaded[side]?.dataUrl)
      },
      (id) => window.desktop.fabricator.loadHairStyle(modelSlot, id)
    ).then((styles) => {
      if (cancelled || styles.length === 0) return
      setHairDetails((current) => {
        const next = { ...current }
        for (const style of styles) next[`${modelSlot}:${style.id}`] = style
        return next
      })
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar as prévias dos cabelos.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [active, modelSlot, partId, side, visibleStyles, setHairDetails, setCatalogError])

  return loading
}
