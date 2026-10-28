import { useEffect, useRef, useState } from 'react'
import type { AdjustmentPreviewHighlight } from '../../characters/characterRenderer'
import { adjustableHairPartIds } from './customizerHairAppearanceModel'

type Dependencies = {
  characterId: string | undefined
  activeModule: string | null
  headPanelTab: string
  headCategorySelection: string
  clothesPanelTab: string
  clothesCategorySelection: string
}

/** Coordinates which selected adjustment is highlighted in the character preview. */
export function useCustomizerAdjustmentPreview({
  characterId, activeModule, headPanelTab, headCategorySelection, clothesPanelTab, clothesCategorySelection
}: Dependencies) {
  const [adjustmentPreviewHighlight, setAdjustmentPreviewHighlight] = useState<AdjustmentPreviewHighlight | null>(null)
  const lastTargetRef = useRef<AdjustmentPreviewHighlight | null>(null)

  const activeHeadPreviewHighlight = activeModule === 'Cabeça' && headPanelTab === 'adjust' && adjustmentPreviewHighlight?.scope === 'head'
    ? adjustmentPreviewHighlight.id
    : null
  const activeFacePreviewHighlight = activeHeadPreviewHighlight && !adjustableHairPartIds.has(activeHeadPreviewHighlight)
    ? activeHeadPreviewHighlight
    : null
  const activeHairPreviewHighlight = activeHeadPreviewHighlight && adjustableHairPartIds.has(activeHeadPreviewHighlight)
    ? activeHeadPreviewHighlight
    : null
  const activeClothingPreviewHighlight = activeModule === 'Roupas' && clothesPanelTab === 'adjust' && adjustmentPreviewHighlight?.scope === 'clothing'
    ? adjustmentPreviewHighlight
    : null
  const activeWardrobePreviewHighlight = activeClothingPreviewHighlight ?? (
    activeHeadPreviewHighlight === 'oculos' || activeHeadPreviewHighlight === 'acessorio-cabeca'
      ? { scope: 'head' as const, id: activeHeadPreviewHighlight }
      : null
  )

  function selectAdjustmentPreviewTarget(target: AdjustmentPreviewHighlight) {
    const previous = lastTargetRef.current
    const sameTarget = previous?.scope === target.scope && (target.scope === 'head'
      ? previous.scope === 'head' && previous.id === target.id
      : previous.scope === 'clothing' && previous.piece.modelSlot === target.piece.modelSlot && previous.piece.setId === target.piece.setId && previous.piece.category === target.piece.category && previous.piece.componentId === target.piece.componentId)
    lastTargetRef.current = target
    if (!sameTarget) setAdjustmentPreviewHighlight(target)
  }

  useEffect(() => {
    lastTargetRef.current = null
    setAdjustmentPreviewHighlight(null)
  }, [characterId, activeModule, headPanelTab, headCategorySelection, clothesPanelTab, clothesCategorySelection])

  return {
    setAdjustmentPreviewHighlight,
    activeFacePreviewHighlight,
    activeHairPreviewHighlight,
    activeWardrobePreviewHighlight,
    selectAdjustmentPreviewTarget
  }
}
