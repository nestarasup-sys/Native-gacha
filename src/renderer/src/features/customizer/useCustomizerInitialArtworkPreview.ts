/** Reidrata a arte/pose salvas para o preview inicial do personagem. */
import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { CharacterBodyDimensions, CharacterProportions, CustomizerCharacter } from '../../../../shared/customizer'
import { resolvePoseCategory, type FabricatorPoseSummary, type FabricatorProject, type FabricatorSlotSummary } from '../../../../shared/fabricator'
import type { CatalogArtwork } from '../../characters/characterRenderer'
import { renderCustomizerBasePreview } from './customizerCharacterPreview'
import { prepareCustomizerArtworkPreview } from './customizerArtworkPreview'
import { loadCustomizerArtworkSource } from './customizerArtworkSource'
import { sampleOriginalSkinTone } from './customizerPreviewImages'

type PreviewExtent = { width: number; height: number; density: number }

export function useCustomizerInitialArtworkPreview(deps: {
  catalogLoading: boolean
  catalogModels: FabricatorSlotSummary[]
  catalogPoses: FabricatorPoseSummary[]
  selectedCharacter: CustomizerCharacter | null
  activeProportions: CharacterProportions
  activeBodyDimensions: CharacterBodyDimensions
  previewExtent: PreviewExtent
  zoom: number
  previewLoadRequest: MutableRefObject<number>
  setSelectedCatalogModelSlot: Dispatch<SetStateAction<number | null>>
  setSelectedCatalogPoseSlot: Dispatch<SetStateAction<number | null>>
  setSelectedPoseCategory: Dispatch<SetStateAction<string>>
  setSelectedPosePage: Dispatch<SetStateAction<number>>
  setSelectedArtworkLabel: Dispatch<SetStateAction<string>>
  setSelectedArtworkUrl: Dispatch<SetStateAction<string | null>>
  setSelectedArtworkProject: Dispatch<SetStateAction<CatalogArtwork | null>>
  setSelectedSourceModelProject: Dispatch<SetStateAction<FabricatorProject | null>>
  setSelectedWardrobeUrl: Dispatch<SetStateAction<string | null>>
  setSelectedWardrobeAboveHairUrl: Dispatch<SetStateAction<string | null>>
  setPreviewLoading: Dispatch<SetStateAction<boolean>>
  setCatalogError: Dispatch<SetStateAction<string>>
}) {
  const {
    catalogLoading, catalogModels, catalogPoses, selectedCharacter, activeProportions,
    activeBodyDimensions, previewExtent, zoom, previewLoadRequest, setSelectedCatalogModelSlot,
    setSelectedCatalogPoseSlot, setSelectedPoseCategory, setSelectedPosePage,
    setSelectedArtworkLabel, setSelectedArtworkUrl, setSelectedArtworkProject,
    setSelectedSourceModelProject, setSelectedWardrobeUrl, setSelectedWardrobeAboveHairUrl,
    setPreviewLoading, setCatalogError
  } = deps

  useEffect(() => {
    if (catalogLoading) return
    const model = selectedCharacter
      ? catalogModels.find((item) => item?.slot === selectedCharacter.customization.modelSlot)
        ?? catalogModels.find((item) => item?.slot === 1)
        ?? catalogModels.find((item) => item !== null)
      : null
    if (!selectedCharacter || !model) {
      setSelectedCatalogModelSlot(null)
      setSelectedCatalogPoseSlot(null)
      setSelectedPoseCategory('Parado')
      setSelectedPosePage(0)
      setSelectedArtworkUrl(null)
      setSelectedArtworkLabel('')
      setSelectedArtworkProject(null)
      setSelectedSourceModelProject(null)
      setSelectedWardrobeUrl(null)
      setSelectedWardrobeAboveHairUrl(null)
      setPreviewLoading(false)
      return
    }
    const requestedPose = selectedCharacter.customization.poseSlot
    const pose = requestedPose === null ? null : catalogPoses.find((item) => item?.sourceModelSlot === model.slot && item.slot === requestedPose)
    const requestId = ++previewLoadRequest.current
    let cancelled = false
    setSelectedCatalogModelSlot(model.slot)
    setSelectedPosePage(0)
    setSelectedCatalogPoseSlot(pose?.slot ?? null)
    setSelectedPoseCategory(pose ? resolvePoseCategory(pose) : 'Parado')
    setSelectedArtworkLabel(pose?.name ?? model.name)
    setSelectedArtworkUrl(null)
    setPreviewLoading(true)
    void (async () => {
      try {
        const source = await prepareCustomizerArtworkPreview({
          modelSlot: model.slot,
          poseSlot: pose?.slot ?? null,
          appearance: selectedCharacter.customization,
          proportions: activeProportions,
          bodyDimensions: activeBodyDimensions,
          extent: previewExtent,
          zoom,
          onSourceResolved: ({ sourceProject, artwork }) => {
            if (!cancelled && previewLoadRequest.current === requestId) {
              setSelectedArtworkProject(artwork)
              setSelectedSourceModelProject(sourceProject)
            }
          }
        }, {
          loadSource: (slot, selectedPose, cachedModel) => loadCustomizerArtworkSource(slot, selectedPose, {
            loadModel: window.desktop.fabricator.loadFabricatorSlot,
            loadPose: window.desktop.fabricator.loadFabricatorPose
          }, cachedModel),
          sampleOriginalSkinTone,
          renderBasePreview: renderCustomizerBasePreview
        })
        if (source.status === 'missing-model') throw new Error('O modelo de referência não está disponível no Fabricador Dev.')
        if (source.status === 'invalid-pose') throw new Error('Não foi possível carregar a prévia deste personagem.')
        if (!cancelled && previewLoadRequest.current === requestId) setSelectedArtworkUrl(source.previewUrl)
      } catch (reason) {
        if (!cancelled && previewLoadRequest.current === requestId) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar a prévia.')
      } finally {
        if (!cancelled && previewLoadRequest.current === requestId) setPreviewLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [catalogLoading, catalogModels, catalogPoses, selectedCharacter?.id, selectedCharacter?.customization.modelSkinTone, selectedCharacter?.customization.modelOutlineColor, previewExtent, zoom])
}
