import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { FaceCatalogItem, FaceElementKind, FaceSet, FaceSheetKind, FabricatorProject } from '../../../../shared/fabricator'
import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import { renderFaceOverlay } from '../../characters/characterRenderer'
import type { CatalogArtwork } from '../../characters/characterRenderer'
import type { StandardExpressionEffects } from '../../characters/standardExpressionEffects'
import { characterRenderSize } from './renderResolution'
import { renderCustomizerFacePreview } from './customizerFacePreview'
import { preparePreviewImage } from './customizerPreviewImages'

type PreviewExtent = { width: number; height: number; density: number }

/** Keeps facial preview assembly and its async image lifecycle outside the page. */
export function useCustomizerFacePreview(deps: {
  appearance: CustomizerFaceAppearance | undefined
  catalogDetails: Record<string, FaceCatalogItem>
  legacyFaceDetails: Record<string, FaceSet>
  artwork: CatalogArtwork | null
  source: FabricatorProject | null
  skinTone?: string
  headOverrides?: CustomizerCharacter['customization']['partOverrides']
  previewExtent: PreviewExtent
  zoom: number
  expressionEffects: StandardExpressionEffects
  highlight: string | null
  setSelectedFaceUrl: Dispatch<SetStateAction<string | null>>
  setCatalogError: Dispatch<SetStateAction<string>>
}) {
  const {
    appearance, catalogDetails, legacyFaceDetails, artwork, source, skinTone, headOverrides,
    previewExtent, zoom, expressionEffects, highlight, setSelectedFaceUrl, setCatalogError
  } = deps

  useEffect(() => {
    let cancelled = false
    const hasCatalogSelection = Boolean(appearance?.eyeCatalogId || appearance?.eyeLeftCatalogId || appearance?.eyeRightCatalogId || appearance?.eyebrowCatalogId || appearance?.eyebrowLeftCatalogId || appearance?.eyebrowRightCatalogId || appearance?.noseCatalogId || appearance?.mouthClosedCatalogId || appearance?.mouthOpenCatalogId || Object.values(appearance?.components ?? {}).some((component) => component?.assetId) || Object.values(appearance?.faceDetails ?? {}).some(Boolean) || Object.values(appearance?.headExtras ?? {}).some(Boolean))
    const face = appearance?.setId ? legacyFaceDetails[`${appearance.modelSlot}:${appearance.setId}`] : null
    const catalogItems: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>> = {}
    if (appearance && hasCatalogSelection) {
      const ids: Partial<Record<FaceSheetKind | FaceElementKind, string | undefined>> = { eyes: appearance.eyeCatalogId, 'eye-left': appearance.eyeLeftCatalogId ?? undefined, 'eye-right': appearance.eyeRightCatalogId ?? undefined, eyebrows: appearance.eyebrowCatalogId, 'brow-left': appearance.eyebrowLeftCatalogId ?? undefined, 'brow-right': appearance.eyebrowRightCatalogId ?? undefined, nose: appearance.noseCatalogId, 'mouth-closed': appearance.mouthClosedCatalogId, 'mouth-open': appearance.mouthOpenCatalogId }
      for (const [category, id] of Object.entries(ids) as Array<[FaceSheetKind | FaceElementKind, string | undefined]>) {
        if (!id) continue
        const item = catalogDetails[`${appearance.modelSlot}:${id}`]
        if (item) catalogItems[category] = item
      }
    }
    if (!artwork || !source || !appearance || (!hasCatalogSelection && !face)) {
      setSelectedFaceUrl(null)
      return
    }

    const maxSize = characterRenderSize(artwork.width, artwork.height, previewExtent.width, previewExtent.height, zoom, previewExtent.density)
    const render = hasCatalogSelection
      ? renderCustomizerFacePreview({
        artwork,
        source,
        items: catalogItems,
        appearance,
        skinTone,
        maxSize,
        expressionEffects: expressionEffects[appearance.expressionIndex],
        headOverrides,
        highlightedHeadId: highlight
      })
      : renderFaceOverlay(artwork, source, face, appearance, maxSize, headOverrides, highlight)

    void render.then(async (url) => {
      if (!await preparePreviewImage(url)) return
      if (!cancelled) setSelectedFaceUrl(url)
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível montar o rosto do personagem.')
    })
    return () => { cancelled = true }
  }, [appearance, catalogDetails, legacyFaceDetails, artwork, source, skinTone, headOverrides, previewExtent, zoom, expressionEffects, highlight, setSelectedFaceUrl, setCatalogError])
}
