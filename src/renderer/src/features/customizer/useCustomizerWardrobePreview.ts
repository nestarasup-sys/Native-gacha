import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { WardrobeSet } from '../../../../shared/fabricator'
import type { CustomizerWardrobeGroup } from '../../../../shared/customizer'
import { renderWardrobeOverlay } from '../../characters/characterRenderer'
import type { AdjustmentPreviewHighlight, CatalogArtwork, SelectedWardrobeComponent } from '../../characters/characterRenderer'
import type { FabricatorProject } from '../../../../shared/fabricator'
import { characterRenderSize } from './renderResolution'
import { preparePreviewImage } from './customizerPreviewImages'

type PreviewExtent = { width: number; height: number; density: number }
type WardrobeTransformDraft = Pick<CustomizerWardrobeGroup, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY' | 'rotation'>

/** Composes the saved clothing stack and temporary drag transform into two preview layers. */
export function useCustomizerWardrobePreview(deps: {
  characterId: string | undefined
  modelSkinTone?: string
  wardrobeGroups: CustomizerWardrobeGroup[] | undefined
  wardrobeDetails: Record<string, WardrobeSet>
  artwork: CatalogArtwork | null
  selectedModelSlot: number | null
  source: FabricatorProject | null
  selectedClothing: SelectedWardrobeComponent | null
  transformDraft: WardrobeTransformDraft | null
  previewExtent: PreviewExtent
  zoom: number
  highlight: AdjustmentPreviewHighlight | null
  setSelectedWardrobeUrl: Dispatch<SetStateAction<string | null>>
  setSelectedWardrobeAboveHairUrl: Dispatch<SetStateAction<string | null>>
  setCatalogError: Dispatch<SetStateAction<string>>
}) {
  const {
    characterId, modelSkinTone, wardrobeGroups, wardrobeDetails, artwork, selectedModelSlot,
    source, selectedClothing, transformDraft, previewExtent, zoom, highlight,
    setSelectedWardrobeUrl, setSelectedWardrobeAboveHairUrl, setCatalogError
  } = deps

  useEffect(() => {
    let cancelled = false
    const groups = wardrobeGroups ?? []
    if (!artwork || !groups.length) {
      setSelectedWardrobeUrl(null)
      setSelectedWardrobeAboveHairUrl(null)
      return
    }

    const previewGroups = transformDraft && selectedClothing
      ? groups.map((group) => group.modelSlot === selectedClothing.modelSlot && group.setId === selectedClothing.setId && group.category === selectedClothing.category && (group.componentId === selectedClothing.componentId || !group.componentId)
        ? { ...group, componentId: selectedClothing.componentId, ...transformDraft }
        : group)
      : groups
    const maxSize = characterRenderSize(artwork.width, artwork.height, previewExtent.width, previewExtent.height, zoom, previewExtent.density)

    void renderWardrobeOverlay(previewGroups, wardrobeDetails, artwork, selectedModelSlot, source, modelSkinTone, maxSize, highlight).then(async (result) => {
      const [wardrobeReady, aboveHairReady] = await Promise.all([preparePreviewImage(result.imageUrl), preparePreviewImage(result.aboveHairImageUrl)])
      if (!wardrobeReady || !aboveHairReady) return
      if (!cancelled) {
        setSelectedWardrobeUrl(result.imageUrl)
        setSelectedWardrobeAboveHairUrl(result.aboveHairImageUrl)
      }
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setSelectedWardrobeUrl(null)
        setSelectedWardrobeAboveHairUrl(null)
        setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível compor as roupas do personagem.')
      }
    })
    return () => { cancelled = true }
  }, [characterId, modelSkinTone, wardrobeGroups, wardrobeDetails, artwork, selectedModelSlot, source, selectedClothing, transformDraft, previewExtent, zoom, highlight, setSelectedWardrobeUrl, setSelectedWardrobeAboveHairUrl, setCatalogError])
}
