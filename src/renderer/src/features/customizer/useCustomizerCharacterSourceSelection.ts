/** Seleção de modelos/poses do Fabricador e atualização do preview do personagem. */
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { selectCharacterArtwork } from '../../../../shared/characterSourceContinuity'
import { applyCharacterBodyShape } from '../../../../shared/bodyShape'
import { resolvePoseCategory, type FabricatorPoseSummary, type FabricatorProject, type FabricatorSlotSummary } from '../../../../shared/fabricator'
import type { CustomizerCharacter, CharacterBodyDimensions, CharacterProportions } from '../../../../shared/customizer'
import { renderArtwork, withCharacterHeadSize } from '../../characters/characterRenderer'
import type { CatalogArtwork } from '../../characters/characterRenderer'
import { characterRenderSize } from './renderResolution'
import { preparePreviewImage } from './customizerPreviewImages'

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

  async function renderSelectionPreview(artwork: CatalogArtwork) {
    const shapedArtwork = applyCharacterBodyShape(withCharacterHeadSize(artwork, activeProportions), activeBodyDimensions)
    const artworkUrl = await renderArtwork(shapedArtwork, characterRenderSize(artwork.width, artwork.height, previewExtent.width, previewExtent.height, customizerPreviewZoom, previewExtent.density), selectedCharacter?.customization.modelSkinTone)
    if (!await preparePreviewImage(artworkUrl)) throw new Error('A prévia nova não pôde ser decodificada; mantendo a imagem anterior.')
    return artworkUrl
  }

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
      const sourceProject = await window.desktop.loadFabricatorSlot(model.slot)
      if (!sourceProject) throw new Error('O modelo de referência não está disponível no Fabricador Dev.')
      const poseArtwork = firstPose ? await window.desktop.loadFabricatorPose(model.slot, firstPose.slot) : null
      const artwork = selectCharacterArtwork(sourceProject, poseArtwork, firstPose?.slot ?? null)
      if (!artwork) throw new Error(firstPose ? 'Não foi possível abrir a pose inicial deste modelo.' : 'Não foi possível abrir este modelo.')
      const artworkUrl = await renderSelectionPreview(artwork)
      if (previewLoadRequest.current === requestId) { setSelectedArtworkProject(artwork); setSelectedSourceModelProject(sourceProject); setSelectedArtworkUrl(artworkUrl) }
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
      const sourceProject = selectedSourceModelProject?.slot === pose.sourceModelSlot ? selectedSourceModelProject : await window.desktop.loadFabricatorSlot(pose.sourceModelSlot)
      if (!sourceProject) throw new Error('O modelo de referência desta pose não está disponível.')
      const poseArtwork = await window.desktop.loadFabricatorPose(pose.sourceModelSlot, pose.slot)
      const artwork = selectCharacterArtwork(sourceProject, poseArtwork, pose.slot)
      if (!artwork) throw new Error('Não foi possível abrir esta pose.')
      const artworkUrl = await renderSelectionPreview(artwork)
      if (previewLoadRequest.current === requestId) { setSelectedArtworkProject(artwork); setSelectedSourceModelProject(sourceProject); setSelectedArtworkUrl(artworkUrl) }
    } catch (reason) {
      if (previewLoadRequest.current === requestId) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível abrir esta pose.')
    } finally {
      if (previewLoadRequest.current === requestId) setPreviewLoading(false)
    }
  }

  return { selectCatalogModel, selectCatalogPose }
}
