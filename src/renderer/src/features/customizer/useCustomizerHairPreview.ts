import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { HairStyle, FabricatorProject } from '../../../../shared/fabricator'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import { loadHairAppearanceLayers, renderArtworkWithHair, renderFrontHairOverlay } from '../../characters/characterRenderer'
import type { CatalogArtwork } from '../../characters/characterRenderer'
import { characterRenderSize } from './renderResolution'
import { preparePreviewImage } from './customizerPreviewImages'

type PreviewExtent = { width: number; height: number; density: number }

/** Builds both hair layers and swaps them only after each image is ready. */
export function useCustomizerHairPreview(deps: {
  characterId: string | undefined
  artwork: CatalogArtwork | null
  source: FabricatorProject | null
  hairAppearance: CustomizerCharacter['customization']['hairAppearance'] | undefined
  hairDetails: Record<string, HairStyle>
  skinTone?: string
  headOverrides?: CustomizerCharacter['customization']['partOverrides']
  previewExtent: PreviewExtent
  zoom: number
  highlight: string | null
  setHairDetails: Dispatch<SetStateAction<Record<string, HairStyle>>>
  setSelectedArtworkUrl: Dispatch<SetStateAction<string | null>>
  setSelectedPosteriorHairUrl: Dispatch<SetStateAction<string | null>>
  setSelectedFringeUrl: Dispatch<SetStateAction<string | null>>
  setCatalogError: Dispatch<SetStateAction<string>>
}) {
  const {
    characterId, artwork, source, hairAppearance, hairDetails, skinTone, headOverrides,
    previewExtent, zoom, highlight, setHairDetails, setSelectedArtworkUrl,
    setSelectedPosteriorHairUrl, setSelectedFringeUrl, setCatalogError
  } = deps

  useEffect(() => {
    let cancelled = false
    if (!artwork || !source) return

    void (async () => {
      const [backStyles, posteriorStyles, fringeStyles] = await Promise.all([
        loadHairAppearanceLayers(hairAppearance, source.slot, 'back', hairDetails),
        loadHairAppearanceLayers(hairAppearance, source.slot, 'front', hairDetails),
        loadHairAppearanceLayers(hairAppearance, source.slot, 'fringe', hairDetails)
      ])
      const frontStyles = [...posteriorStyles, ...fringeStyles]
      if (cancelled) return

      const newlyLoaded: Record<string, HairStyle> = {}
      for (const layer of [...backStyles, ...frontStyles]) {
        if (!hairDetails[`${source.slot}:${layer.style.id}`]) newlyLoaded[`${source.slot}:${layer.style.id}`] = layer.style
      }
      if (Object.keys(newlyLoaded).length) setHairDetails((current) => ({ ...current, ...newlyLoaded }))

      const maxSize = characterRenderSize(artwork.width, artwork.height, previewExtent.width, previewExtent.height, zoom, previewExtent.density)
      const appearance = hairAppearance?.modelSlot === source.slot ? hairAppearance : undefined
      const [url, posteriorHairUrl, fringeUrl] = await Promise.all([
        renderArtworkWithHair(artwork, source, backStyles, maxSize, skinTone, appearance, undefined, headOverrides, highlight),
        renderFrontHairOverlay(artwork, source, posteriorStyles, maxSize, appearance, undefined, headOverrides, highlight),
        renderFrontHairOverlay(artwork, source, fringeStyles, maxSize, appearance, undefined, headOverrides, highlight)
      ])
      const ready = await Promise.all([preparePreviewImage(url), preparePreviewImage(posteriorHairUrl), preparePreviewImage(fringeUrl)])
      if (!ready.every(Boolean)) return
      if (!cancelled) {
        setSelectedArtworkUrl(url)
        setSelectedPosteriorHairUrl(posteriorHairUrl)
        setSelectedFringeUrl(fringeUrl)
      }
    })().catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível montar o cabelo do personagem.')
    })

    return () => { cancelled = true }
  }, [characterId, artwork, source, hairAppearance, hairDetails, skinTone, headOverrides, previewExtent, zoom, highlight, setHairDetails, setSelectedArtworkUrl, setSelectedPosteriorHairUrl, setSelectedFringeUrl, setCatalogError])
}
