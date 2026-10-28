/** Seleção de modelos/poses do Fabricador e atualização do preview do personagem. */
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { resolvePoseCategory, type FabricatorPoseSummary, type FabricatorProject, type FabricatorSlotSummary } from '../../../../shared/fabricator'
import type { CustomizerCharacter, CharacterBodyDimensions, CharacterProportions } from '../../../../shared/customizer'
import type { CatalogArtwork } from '../../characters/characterRenderer'
import { renderCustomizerBasePreview } from './customizerCharacterPreview'
import { loadCustomizerArtworkSource } from './customizerArtworkSource'
import { sampleOriginalSkinTone } from './customizerPreviewImages'
import { prepareCustomizerArtworkPreview } from './customizerArtworkPreview'

type PreviewExtent = { width: number; height: number; density: number }
type Customization = CustomizerCharacter['customization']

export function useCustomizerCharacterSourceSelection(deps: {
  selectedCharacter: CustomizerCharacter | null
  selectedSourceModelProject: FabricatorProject | null
  catalogPoses: FabricatorPoseSummary[]
  selectedPoseCategory: string
  activeProportions: CharacterProportions
  activeBodyDimensions: CharacterBodyDimensions
  previewExtent: PreviewExtent
  customizerPreviewZoom: number
  previewLoadRequest: MutableRefObject<number>
  saveCharacterCustomization: (patch: Partial<Customization>) => Promise<void>
  setSelectedCatalogModelSlot: Dispatch<SetStateAction<number | null>>
  setSelectedCatalogPoseSlot: Dispatch<SetStateAction<number | null>>
  setSelectedPoseCategory: Dispatch<SetStateAction<string>>
  setSelectedPosePage: Dispatch<SetStateAction<number>>
  setSelectedArtworkLabel: Dispatch<SetStateAction<string>>
  setSelectedArtworkUrl: Dispatch<SetStateAction<string | null>>
  setSelectedArtworkProject: Dispatch<SetStateAction<CatalogArtwork | null>>
  setSelectedSourceModelProject: Dispatch<SetStateAction<FabricatorProject | null>>
  setPreviewLoading: Dispatch<SetStateAction<boolean>>
  setCatalogError: Dispatch<SetStateAction<string>>
}) {
  const {
    selectedCharacter, selectedSourceModelProject, catalogPoses, selectedPoseCategory,
    activeProportions, activeBodyDimensions, previewExtent, customizerPreviewZoom,
    previewLoadRequest, saveCharacterCustomization, setSelectedCatalogModelSlot,
    setSelectedCatalogPoseSlot, setSelectedPoseCategory, setSelectedPosePage,
    setSelectedArtworkLabel, setSelectedArtworkUrl, setSelectedArtworkProject,
    setSelectedSourceModelProject, setPreviewLoading, setCatalogError
  } = deps

  const preparePreview = (modelSlot: number, poseSlot: number | null, cachedModel?: FabricatorProject | null) =>
    prepareCustomizerArtworkPreview({
      modelSlot,
      poseSlot,
      cachedModel,
      appearance: selectedCharacter?.customization,
      proportions: activeProportions,
      bodyDimensions: activeBodyDimensions,
      extent: previewExtent,
      zoom: customizerPreviewZoom
    }, {
      loadSource: (slot, selectedPose, cached) => loadCustomizerArtworkSource(slot, selectedPose, {
        loadModel: window.desktop.fabricator.loadFabricatorSlot,
        loadPose: window.desktop.fabricator.loadFabricatorPose
      }, cached),
      sampleOriginalSkinTone,
      renderBasePreview: renderCustomizerBasePreview
    })

  async function selectCatalogModel(model: NonNullable<FabricatorSlotSummary>) {
    const requestId = ++previewLoadRequest.current
    setSelectedCatalogModelSlot(model.slot)
    setSelectedPosePage(0)
    setSelectedArtworkLabel(model.name)
    setSelectedArtworkUrl(null)
    setPreviewLoading(true)
    setCatalogError('')
    try {
      const firstPose = catalogPoses.find((pose) => pose?.sourceModelSlot === model.slot && pose.slot === 1)
      setSelectedCatalogPoseSlot(firstPose?.slot ?? null)
      setSelectedPoseCategory(firstPose ? resolvePoseCategory(firstPose) : 'Parado')
      await saveCharacterCustomization({ modelSlot: model.slot, poseSlot: firstPose?.slot ?? null })
      const source = await preparePreview(model.slot, firstPose?.slot ?? null)
      if (source.status === 'missing-model') throw new Error('O modelo de referência não está disponível no Fabricador Dev.')
      if (source.status === 'invalid-pose') throw new Error(firstPose ? 'Não foi possível abrir a pose inicial deste modelo.' : 'Não foi possível abrir este modelo.')
      const { sourceProject, artwork, previewUrl } = source
      if (previewLoadRequest.current === requestId) { setSelectedArtworkProject(artwork); setSelectedSourceModelProject(sourceProject); setSelectedArtworkUrl(previewUrl) }
    } catch (reason) {
      if (previewLoadRequest.current === requestId) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível abrir este modelo.')
    } finally {
      if (previewLoadRequest.current === requestId) setPreviewLoading(false)
    }
  }

  async function selectCatalogPose(pose: NonNullable<FabricatorPoseSummary>) {
    const requestId = ++previewLoadRequest.current
    const nextCategory = resolvePoseCategory(pose)
    if (nextCategory !== selectedPoseCategory) setSelectedPosePage(0)
    setSelectedCatalogPoseSlot(pose.slot)
    setSelectedPoseCategory(nextCategory)
    setSelectedArtworkLabel(pose.name)
    setPreviewLoading(true)
    setCatalogError('')
    try {
      await saveCharacterCustomization({ modelSlot: pose.sourceModelSlot, poseSlot: pose.slot })
      const source = await preparePreview(pose.sourceModelSlot, pose.slot, selectedSourceModelProject)
      if (source.status === 'missing-model') throw new Error('O modelo de referência desta pose não está disponível.')
      if (source.status === 'invalid-pose') throw new Error('Não foi possível abrir esta pose.')
      const { sourceProject, artwork, previewUrl } = source
      if (previewLoadRequest.current === requestId) { setSelectedArtworkProject(artwork); setSelectedSourceModelProject(sourceProject); setSelectedArtworkUrl(previewUrl) }
    } catch (reason) {
      if (previewLoadRequest.current === requestId) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível abrir esta pose.')
    } finally {
      if (previewLoadRequest.current === requestId) setPreviewLoading(false)
    }
  }

  return { selectCatalogModel, selectCatalogPose }
}
