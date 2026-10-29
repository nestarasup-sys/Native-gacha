import { useCustomizerCharacterRoster } from './useCustomizerCharacterRoster'
import { useCustomizerModelBrowserState } from './useCustomizerModelBrowserState'
import { useCustomizerCatalogThumbnails } from './useCustomizerCatalogThumbnails'
import { useCustomizerAssetLibraryState } from './useCustomizerAssetLibraryState'
import { useCustomizerCharacterCommands } from './useCustomizerCharacterCommands'
import { useCustomizerFaceAppearanceActions } from './useCustomizerFaceAppearanceActions'
import { useCustomizerHairAppearanceActions } from './useCustomizerHairAppearanceActions'
import { useCustomizerBodyAppearance } from './useCustomizerBodyAppearance'
import { useCustomizerCharacterSourceSelection } from './useCustomizerCharacterSourceSelection'
import { CustomizerModelPicker } from './CustomizerModelPicker'
import { CustomizerFaceCatalogWorkspace } from './CustomizerFaceCatalogWorkspace'
import { CustomizerClothesAdjustmentPanel } from './CustomizerClothesAdjustmentPanel'
import { CustomizerHeadAdjustmentPanel } from './CustomizerHeadAdjustmentPanel'
import { buildClothesAdjustmentEntries } from './customizerClothesAdjustmentModel'
import { upperWardrobePanels, upperWardrobePageTwoPanels, accessoryWardrobePanels, lowerWardrobePanels, lowerWardrobePageTwoPanels, wardrobePanelCandidates, isWardrobePanelCandidateSelected } from './wardrobePanelModel'
import type { WardrobePanel } from './wardrobePanelModel'
import { HairAssetPreview, WardrobePanelCandidatePreview } from './CustomizerAssetPreviews'
import { customizerFaceParts, customizerSkinTonePresets, facePartCatalogId, facePartColorControls, facePartSourceId, sameFaceAssetPair, skinTonePresets, wrapSlotIndex, createCustomizerFaceCatalogModel } from './customizerFaceCatalogModel'
import type { FaceLibraryPartId } from './customizerFaceCatalogModel'
import { hairColorControls, hairPalettePresets, PiecePaletteStrip } from './CustomizerAppearanceControls'
import { useCustomizerInitialArtworkPreview } from './useCustomizerInitialArtworkPreview'
import { useCustomizerFacePreview } from './useCustomizerFacePreview'
import { useCustomizerFaceCatalog } from './useCustomizerFaceCatalog'
import { useCustomizerHairPreview } from './useCustomizerHairPreview'
import { useCustomizerHairCatalog } from './useCustomizerHairCatalog'
import { getCustomizerHairLibraryPage, retainCustomizerHairDetailsForModel } from './customizerHairCatalog'
import { useCustomizerHairLibraryPage } from './useCustomizerHairLibraryPage'
import { useCustomizerWardrobePreview } from './useCustomizerWardrobePreview'
import { useCustomizerWardrobeAdjustment } from './useCustomizerWardrobeAdjustment'
import { useCustomizerWardrobePanelActions } from './useCustomizerWardrobePanelActions'
import { useCustomizerWardrobeHydration } from './useCustomizerWardrobeHydration'
import { useCustomizerWardrobeCatalog } from './useCustomizerWardrobeCatalog'
import { useCustomizerHeadAdjustment } from './useCustomizerHeadAdjustment'
import { MODEL_SKIN_BASE_TONE, isValidSkinTone } from '../../../../shared/skinTones'
import { useCustomizerAdjustmentPreview } from './useCustomizerAdjustmentPreview'
import { useCustomizerHeadNavigation } from './useCustomizerHeadNavigation'
import { useCustomizerWardrobeNavigation } from './useCustomizerWardrobeNavigation'
import { useCustomizerPreviewViewport } from './useCustomizerPreviewViewport'
import { CustomizerPreviewSurface } from './CustomizerPreviewSurface'
import { sampleOriginalSkinTone } from './customizerPreviewImages'
import { CustomizerCategoryIcon, clothesAdjustmentDefinitions, customizerClothesTabs, customizerHeadTabs, customizerModuleByTab, customizerModuleNames, customizerOtherTabs, customizerTopTabs, headAdjustmentItemsFor } from './customizerNavigation'
import { hairAppearancePartStyleId } from './customizerHairAppearanceModel'
import { hairAppearanceStyleIds, hairStyleSupportsCategory } from '../../../../shared/hairCategories'
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { RenderedCharacterPortrait } from '../../ui/components/RenderedCharacterPortrait'
import { Icon } from '../../ui/components/Icon'
import type { FaceComponentAssetSummary, FabricatorProject, HairStyle, HairStyleSummary } from '../../../../shared/fabricator'
import { resolvePoseCategory } from '../../../../shared/fabricator'
import type { CustomizerWardrobeGroup, HairColorRole } from '../../../../shared/customizer'
import { characterBodyDimensionLimits, characterProportionLimits, defaultCharacterProportions, type CharacterProportions } from '../../../../shared/customizer'
import { usePreviewBackground } from '../../ui/hooks/usePreviewBackground'
import { DesignBanner } from '../../ui/components/DesignBanner'
import { anchorWardrobeAdjustments } from '../../../../shared/wardrobeAdjustment'
import { applyCharacterBodyShape } from '../../../../shared/bodyShape'
import { withCharacterHeadSize, isRightFaceAsset, characterShapeScale, resolvedHairColors, clothingCategories, wardrobeComponentsForGroup, customizerHairParts } from '../../characters/characterRenderer'
import type { CatalogArtwork, SelectedWardrobeComponent } from '../../characters/characterRenderer'

const proportionControls: Array<{ key: keyof CharacterProportions; label: string; description: string }> = [
  { key: 'scale', label: 'Escala geral', description: 'Aumenta ou diminui o personagem inteiro' },
  { key: 'head', label: 'Tamanho da cabeça', description: 'Altera apenas a cabeça, rosto e cabelo' },
  { key: 'headWidth', label: 'Largura da cabeça', description: 'Alarga ou estreita apenas a cabeça, rosto e cabelo' },
  { key: 'headHeight', label: 'Altura da cabeça', description: 'Alonga ou achata apenas a cabeça, rosto e cabelo' },
  { key: 'width', label: 'Largura', description: 'Estica ou comprime o personagem na horizontal' },
  { key: 'height', label: 'Altura', description: 'Estica ou comprime o personagem na vertical' }
]

export function CustomizerPage() {
  const {
    characters, setCharacters, charactersRef, characterSaveQueue,
    selectedCharacterId, setSelectedCharacterId,
    charactersLoading, charactersError, setCharactersError,
    characterSaveState, setCharacterSaveState
  } = useCustomizerCharacterRoster()
  const [dialogMode, setDialogMode] = useState<'create' | 'rename' | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [savingCharacter, setSavingCharacter] = useState(false)
  const [activeModule, setActiveModule] = useState<string | null>(null)
  const [selectedCustomizerTopTab, setSelectedCustomizerTopTab] = useState('corpo')
  const [previewBackground, setPreviewBackground] = usePreviewBackground()
  const {
    zoom: customizerPreviewZoom,
    pan: customizerPreviewPan,
    extent: previewExtent,
    customizerPreviewStageRef,
    mainPreviewStageRef,
    resetPan: resetCustomizerPreviewPan,
    beginPan: beginCustomizerPreviewPan,
    movePan: moveCustomizerPreviewPan,
    finishPan: finishCustomizerPreviewPan,
    zoomIn: zoomInCustomizerPreview,
    zoomOut: zoomOutCustomizerPreview,
    resetZoom: resetCustomizerPreviewZoom
  } = useCustomizerPreviewViewport(selectedCustomizerTopTab)

  const {
    rosterQuery, setRosterQuery, catalogModels, setCatalogModels,
    catalogPoses, setCatalogPoses, catalogLoading, setCatalogLoading,
    catalogError, setCatalogError, selectedCatalogModelSlot, setSelectedCatalogModelSlot,
    selectedCatalogPoseSlot, setSelectedCatalogPoseSlot, selectedPoseCategory, setSelectedPoseCategory,
    selectedPosePage, setSelectedPosePage, modelThumbnails, setModelThumbnails,
    poseThumbnails, setPoseThumbnails
  } = useCustomizerModelBrowserState()
  useCustomizerCatalogThumbnails({
    activeModule,
    selectedCustomizerTopTab,
    selectedCatalogModelSlot,
    catalogLoading,
    catalogModels,
    catalogPoses,
    setModelThumbnails,
    setPoseThumbnails,
    setCatalogError
  })
  const { clothingSection, clothesPanelTab, clothesCategorySelection, upperWardrobePage, lowerWardrobePage, selectClothesTab } = useCustomizerWardrobeNavigation()
  const [otherPanelTab, setOtherPanelTab] = useState<(typeof customizerOtherTabs)[number]['id']>('extra')
  const {
    wardrobeSets, setWardrobeSets, wardrobeLoading, setWardrobeLoading,
    wardrobeDetails, setWardrobeDetails, wardrobeThumbnails, setWardrobeThumbnails,
    wardrobeLibraryPanel, setWardrobeLibraryPanel, wardrobeLibraryPage, setWardrobeLibraryPage,
    faceCatalogItems, setFaceCatalogItems, faceCatalogDetails, setFaceCatalogDetails,
    standardExpressionEffects, setStandardExpressionEffects, faceComponentAssets, setFaceComponentAssets,
    faceComponentDetails, setFaceComponentDetails, faceDetails, setFaceDetails,
    faceLoading, setFaceLoading, faceComponentLoading, setFaceComponentLoading,
    hairStyles, setHairStyles, hairDetails, setHairDetails,
    hairLoading, setHairLoading,
    hairLibraryPart, setHairLibraryPart, hairLibraryPage, setHairLibraryPage,
    faceLibraryPart, setFaceLibraryPart, faceLibraryPage, setFaceLibraryPage,
    faceCatalogLibraryPart, setFaceCatalogLibraryPart, faceCatalogLibraryPage, setFaceCatalogLibraryPage
  } = useCustomizerAssetLibraryState<WardrobePanel, FaceLibraryPartId>()
  const activeHairModelSlotRef = useRef(selectedCatalogModelSlot)
  activeHairModelSlotRef.current = selectedCatalogModelSlot
  const activeHairStyleIdsRef = useRef<ReadonlySet<string>>(new Set())
  const setActiveHairDetails = useCallback<Dispatch<SetStateAction<Record<string, HairStyle>>>>((update) => {
    const modelSlot = activeHairModelSlotRef.current
    setHairDetails((current) => {
      const next = typeof update === 'function' ? update(current) : update
      return retainCustomizerHairDetailsForModel(next, modelSlot, activeHairStyleIdsRef.current)
    })
  }, [setHairDetails])
  const { headPanelTab, headCategorySelection, selectHeadTab } = useCustomizerHeadNavigation()
  const [activeHairColorRole, setActiveHairColorRole] = useState<HairColorRole>('base')
  const [selectedClothing, setSelectedClothing] = useState<SelectedWardrobeComponent | null>(null)
  const [selectedWardrobeUrl, setSelectedWardrobeUrl] = useState<string | null>(null)
  const [selectedWardrobeAboveHairUrl, setSelectedWardrobeAboveHairUrl] = useState<string | null>(null)
  const [selectedArtworkProject, setSelectedArtworkProject] = useState<CatalogArtwork | null>(null)
  const [selectedSourceModelProject, setSelectedSourceModelProject] = useState<FabricatorProject | null>(null)
  const [originalSkinTone, setOriginalSkinTone] = useState<string | null>(null)
  const [selectedArtworkUrl, setSelectedArtworkUrl] = useState<string | null>(null)
  const [selectedFaceUrl, setSelectedFaceUrl] = useState<string | null>(null)
  const [selectedFrontHairUrl, setSelectedFrontHairUrl] = useState<string | null>(null)
  const [selectedArtworkLabel, setSelectedArtworkLabel] = useState('')
  const [previewLoading, setPreviewLoading] = useState(true)
  const hairPaletteStripRef = useRef<HTMLDivElement>(null)
  const wardrobePaletteStripRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const previewLoadRequest = useRef(0)
  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId) ?? characters[0] ?? null
  const { selectCharacter, saveCharacter, saveCharacterCustomization } = useCustomizerCharacterCommands({
    charactersRef, characterSaveQueue, setCharacters, selectedCharacter,
    setSelectedCharacterId, setActiveModule, setCharactersError, setCharacterSaveState,
    anchorWardrobe: (groups) => anchorCurrentWardrobe(groups)
  })
  const {
    applyWardrobePanel: applyUpperWardrobePanel,
    applyWardrobePalette,
    setWardrobePieceColor,
    resetWardrobePieceColors
  } = useCustomizerWardrobePanelActions({
    selectedCharacter,
    selectedModelSlot: selectedCatalogModelSlot,
    selectedClothing,
    setSelectedClothing,
    charactersRef,
    wardrobeSets,
    wardrobeDetails,
    saveCharacterCustomization
  })
  const {
    activeProportions, activeBodyDimensions,
    changeProportion, commitProportions, commitProportion,
    changeBodyDimension, commitBodyDimension, restoreBodyDimensions
  } = useCustomizerBodyAppearance({ selectedCharacter, charactersRef, saveCharacterCustomization })
  const { selectCatalogModel, selectCatalogPose } = useCustomizerCharacterSourceSelection({
    selectedCharacter, selectedSourceModelProject, catalogPoses, selectedPoseCategory,
    activeProportions, activeBodyDimensions, previewExtent, customizerPreviewZoom, previewLoadRequest,
    saveCharacterCustomization, setSelectedCatalogModelSlot, setSelectedCatalogPoseSlot,
    setSelectedPoseCategory, setSelectedPosePage, setSelectedArtworkLabel, setSelectedArtworkUrl,
    setSelectedArtworkProject, setSelectedSourceModelProject, setPreviewLoading, setCatalogError
  })
  const {
    setAdjustmentPreviewHighlight,
    activeFacePreviewHighlight, activeHairPreviewHighlight, activeWardrobePreviewHighlight,
    selectAdjustmentPreviewTarget
  } = useCustomizerAdjustmentPreview({
    characterId: selectedCharacter?.id,
    activeModule,
    headPanelTab,
    headCategorySelection,
    clothesPanelTab,
    clothesCategorySelection
  })
  const selectedSkinTone = selectedCharacter?.customization.modelSkinTone
  const sourceModelSkinTone = selectedSourceModelProject?.slot === selectedCatalogModelSlot
    && isValidSkinTone(selectedSourceModelProject.modelSkinTone)
    ? selectedSourceModelProject.modelSkinTone
    : undefined
  const effectiveModelSkinTone = selectedSkinTone ?? sourceModelSkinTone
    ?? (originalSkinTone === MODEL_SKIN_BASE_TONE ? MODEL_SKIN_BASE_TONE : undefined)
  const selectedOutlineColor = selectedCharacter?.customization.modelOutlineColor
  const sourceModelOutlineColor = selectedSourceModelProject?.slot === selectedCatalogModelSlot
    && isValidSkinTone(selectedSourceModelProject.modelOutlineColor)
    ? selectedSourceModelProject.modelOutlineColor
    : undefined
  const effectiveModelOutlineColor = isValidSkinTone(selectedOutlineColor) ? selectedOutlineColor : sourceModelOutlineColor
  const appearanceSourceModelProject = useMemo(() => selectedSourceModelProject
    ? { ...selectedSourceModelProject, modelOutlineColor: effectiveModelOutlineColor }
    : null, [selectedSourceModelProject, effectiveModelOutlineColor])
  const activeShapeScale = characterShapeScale(activeProportions)
  const displayArtworkProject = useMemo(() => selectedArtworkProject ? applyCharacterBodyShape(withCharacterHeadSize(selectedArtworkProject, activeProportions), activeBodyDimensions) : null, [selectedArtworkProject, activeProportions.head, activeProportions.headWidth, activeProportions.headHeight, activeBodyDimensions])
  const { headAdjustSelection, setHeadAdjustSelection, updateHeadAdjustment } = useCustomizerHeadAdjustment({
    selectedCharacter,
    charactersRef,
    displayArtworkParts: displayArtworkProject?.parts ?? [],
    anchorWardrobe: anchorCurrentWardrobe,
    saveCharacterCustomization,
    setAdjustmentPreviewHighlight
  })
  const previewStyle = { '--preview-background': previewBackground, '--character-scale-x': activeShapeScale.x, '--character-scale-y': activeShapeScale.y } as import('react').CSSProperties
  const customizerPreviewStyle = { ...previewStyle, '--preview-zoom': customizerPreviewZoom, '--preview-pan-x': `${customizerPreviewPan.x}px`, '--preview-pan-y': `${customizerPreviewPan.y}px` } as import('react').CSSProperties
  const characterFaceAppearance = selectedCharacter?.customization.faceAppearance
  const characterHairAppearance = selectedCharacter?.customization.hairAppearance
  const hairLibraryPageView = useMemo(
    () => getCustomizerHairLibraryPage(hairStyles, hairLibraryPart, hairLibraryPage),
    [hairStyles, hairLibraryPart, hairLibraryPage]
  )
  const activeHairStyleIds = useMemo(() => {
    const ids = new Set(hairLibraryPageView.visibleStyles.map((style) => style.id))
    if (characterHairAppearance?.modelSlot === selectedCatalogModelSlot) {
      for (const style of hairAppearanceStyleIds(characterHairAppearance)) ids.add(style.id)
    }
    return ids
  }, [hairLibraryPageView.visibleStyles, characterHairAppearance, selectedCatalogModelSlot])
  activeHairStyleIdsRef.current = activeHairStyleIds

  useEffect(() => {
    setActiveHairDetails((current) => retainCustomizerHairDetailsForModel(
      current,
      activeHairModelSlotRef.current,
      activeHairStyleIdsRef.current
    ))
  }, [selectedCatalogModelSlot, activeHairStyleIds, setActiveHairDetails])

  useEffect(() => {
    resetCustomizerPreviewPan()
  }, [selectedCharacter?.id])

  useEffect(() => {
    let cancelled = false
    setOriginalSkinTone(null)
    if (selectedSourceModelProject) {
      void sampleOriginalSkinTone(selectedSourceModelProject)
        .then((tone) => { if (!cancelled) setOriginalSkinTone(tone) })
        .catch(() => { if (!cancelled) setOriginalSkinTone(null) })
    }
    return () => { cancelled = true }
  }, [selectedSourceModelProject])
  const visibleCharacters = characters
    .filter((character) => character.name.toLowerCase().includes(rosterQuery.trim().toLowerCase()))

  useEffect(() => {
    let cancelled = false
    void Promise.all([window.desktop.fabricator.listFabricatorSlots(), window.desktop.fabricator.listFabricatorPoseSlots()])
      .then(async ([models, poses]) => {
        if (cancelled) return
        setCatalogModels(models)
        setCatalogPoses(poses)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo.')
          setPreviewLoading(false)
        }
      })
      .finally(() => { if (!cancelled) setCatalogLoading(false) })
    return () => {
      cancelled = true
      previewLoadRequest.current += 1
    }
  }, [])

  useCustomizerInitialArtworkPreview({
    catalogLoading, catalogModels, catalogPoses, selectedCharacter,
    activeProportions, activeBodyDimensions, previewExtent, zoom: customizerPreviewZoom,
    previewLoadRequest, setSelectedCatalogModelSlot, setSelectedCatalogPoseSlot,
    setSelectedPoseCategory, setSelectedPosePage, setSelectedArtworkLabel,
    setSelectedArtworkUrl, setSelectedArtworkProject, setSelectedSourceModelProject,
    setSelectedWardrobeUrl, setSelectedWardrobeAboveHairUrl, setPreviewLoading, setCatalogError
  })

  useEffect(() => {
    setSelectedClothing(null)
  }, [selectedCharacter?.id])

  useEffect(() => {
    if (!selectedCharacter || selectedClothing || activeModule === 'Roupas' && clothesPanelTab === 'adjust') return
    const firstGroup = selectedCharacter?.customization.wardrobeGroups?.[0]
    const firstSet = firstGroup ? wardrobeDetails[`${firstGroup.modelSlot}:${firstGroup.setId}`] : undefined
    const firstDefinition = firstGroup ? Object.values(clothingCategories).flat().find((item) => item.id === firstGroup.category) : undefined
    const firstComponent = firstGroup && firstSet
      ? firstGroup.componentId
        ? firstSet.components.find((component) => component.id === firstGroup.componentId)
        : firstSet.components.find((component) => firstDefinition?.source.includes(component.category))
      : undefined
    setSelectedClothing(firstGroup && firstComponent ? { modelSlot: firstGroup.modelSlot, setId: firstGroup.setId, category: firstGroup.category, componentId: firstComponent.id } : null)
  }, [activeModule, clothesPanelTab, selectedCharacter?.id, selectedCharacter?.customization.wardrobeGroups, selectedClothing, wardrobeDetails])

  useEffect(() => {
    if (!selectedCharacter || activeModule !== 'Roupas' || clothesPanelTab !== 'adjust') return
    const definitions = clothesAdjustmentDefinitions(clothesCategorySelection)
    const categoryIds = new Set(definitions.map((item) => item.id))
    const groups = (selectedCharacter.customization.wardrobeGroups ?? []).filter((group) => categoryIds.has(group.category))
    if (!groups.length) {
      setSelectedClothing(null)
      return
    }
    const currentSelectionStillInScope = selectedClothing && groups.some((group) => group.modelSlot === selectedClothing.modelSlot && group.setId === selectedClothing.setId && group.category === selectedClothing.category && (group.componentId === selectedClothing.componentId || !group.componentId))
    if (currentSelectionStillInScope) {
      return
    }
    const firstGroup = groups[0]
    const set = wardrobeDetails[`${firstGroup.modelSlot}:${firstGroup.setId}`]
    const definition = definitions.find((item) => item.id === firstGroup.category)
    const component = set && (firstGroup.componentId
      ? set.components.find((piece) => piece.id === firstGroup.componentId)
      : set.components.find((piece) => definition?.source.includes(piece.category)))
    if (firstGroup.componentId || component) {
      setSelectedClothing({ modelSlot: firstGroup.modelSlot, setId: firstGroup.setId, category: firstGroup.category, componentId: component?.id ?? firstGroup.componentId! })
    }
  }, [activeModule, clothesPanelTab, clothesCategorySelection, selectedCharacter?.id, selectedCharacter?.customization.wardrobeGroups, selectedClothing?.modelSlot, selectedClothing?.setId, selectedClothing?.category, selectedClothing?.componentId, wardrobeDetails])

  const { wardrobeTransformDraft, updateClothesAdjustComponent } = useCustomizerWardrobeAdjustment({
    selectedCharacter,
    selectedClothing,
    charactersRef,
    wardrobeDetails,
    displayArtworkParts: displayArtworkProject?.parts ?? [],
    anchorWardrobe: anchorCurrentWardrobe,
    saveCharacterCustomization,
    setAdjustmentPreviewHighlight
  })

  useCustomizerWardrobeCatalog({
    activeModule,
    headPanelTab,
    selectedModelSlot: selectedCatalogModelSlot,
    wardrobeSets,
    wardrobeThumbnails,
    setWardrobeSets,
    setWardrobeLoading,
    setWardrobeDetails,
    setWardrobeThumbnails,
    setCatalogError
  })

  useCustomizerFaceCatalog({
    selectedModelSlot: selectedCatalogModelSlot, activeModule,
    appearance: characterFaceAppearance, faceDetails,
    setFaceCatalogItems, setFaceCatalogDetails, setStandardExpressionEffects,
    setFaceComponentAssets, setFaceComponentDetails, setFaceDetails,
    setFaceLoading, setFaceComponentLoading, setCatalogError
  })

  useCustomizerHairCatalog({
    active: activeModule === 'Cabelos' || activeModule === 'Cabeça' && headPanelTab === 'hair',
    selectedModelSlot: selectedCatalogModelSlot,
    setHairStyles,
    setHairLoading,
    setCatalogError
  })

  const hairLibraryPageLoading = useCustomizerHairLibraryPage({
    active: (activeModule === 'Cabelos' || activeModule === 'Cabeça' && headPanelTab === 'hair') && hairLibraryPart !== null,
    modelSlot: selectedCatalogModelSlot,
    partId: hairLibraryPart,
    visibleStyles: hairLibraryPageView.visibleStyles,
    hairDetails,
    setHairDetails: setActiveHairDetails,
    setCatalogError
  })

  useCustomizerFacePreview({
    appearance: characterFaceAppearance,
    catalogDetails: faceCatalogDetails,
    legacyFaceDetails: faceDetails,
    artwork: displayArtworkProject,
    source: selectedSourceModelProject,
    skinTone: effectiveModelSkinTone,
    headOverrides: selectedCharacter?.customization.partOverrides,
    previewExtent,
    zoom: customizerPreviewZoom,
    expressionEffects: standardExpressionEffects,
    highlight: activeFacePreviewHighlight,
    setSelectedFaceUrl,
    setCatalogError
  })

  useCustomizerHairPreview({
    characterId: selectedCharacter?.id,
    artwork: displayArtworkProject,
    source: appearanceSourceModelProject,
    hairAppearance: characterHairAppearance,
    hairDetails,
    skinTone: effectiveModelSkinTone,
    headOverrides: selectedCharacter?.customization.partOverrides,
    previewExtent,
    zoom: customizerPreviewZoom,
    highlight: activeHairPreviewHighlight,
    setHairDetails: setActiveHairDetails,
    setSelectedArtworkUrl,
    setSelectedFrontHairUrl,
    setCatalogError
  })

  const { unavailableWardrobeSetKeys, repairingWardrobeLinks, removeUnavailableWardrobeLinks } = useCustomizerWardrobeHydration({
    selectedCharacter, charactersRef, saveCharacter, wardrobeThumbnails,
    setWardrobeDetails, setWardrobeThumbnails, setCatalogError
  })

  useCustomizerWardrobePreview({
    characterId: selectedCharacter?.id,
    modelSkinTone: effectiveModelSkinTone,
    wardrobeGroups: selectedCharacter?.customization.wardrobeGroups,
    wardrobeDetails,
    artwork: displayArtworkProject,
    selectedModelSlot: selectedCatalogModelSlot,
    source: appearanceSourceModelProject,
    selectedClothing,
    transformDraft: wardrobeTransformDraft,
    previewExtent,
    zoom: customizerPreviewZoom,
    highlight: activeWardrobePreviewHighlight,
    setSelectedWardrobeUrl,
    setSelectedWardrobeAboveHairUrl,
    setCatalogError
  })

  function anchorCurrentWardrobe(groups: CustomizerWardrobeGroup[]): CustomizerWardrobeGroup[] {
    if (!displayArtworkProject || !selectedSourceModelProject) return groups
    return anchorWardrobeAdjustments(groups, selectedSourceModelProject.slot, displayArtworkProject.parts,
      (group) => wardrobeComponentsForGroup(group, wardrobeDetails))
  }


  const {
    chooseFaceCatalogItem, chooseFacePartCatalogItem, setFacePartColor, applyFacePartPalette,
    resetFacePartColors, clearFacePartSelection, setFaceCatalogVariant, applyFaceCatalogPalette,
    setFaceCatalogPartColor, chooseFaceDetailCatalogItem, clearFaceCatalogPart, setMouthBlush
  } = useCustomizerFaceAppearanceActions({
    selectedCharacter, selectedModelSlot: selectedCatalogModelSlot, charactersRef, saveCharacterCustomization,
    selectHeadTab, faceCatalogItems, faceCatalogDetails, setFaceCatalogDetails,
    faceComponentAssets, faceComponentDetails, setFaceComponentDetails
  })
  const {
    chooseHairPartStyle, setHairColor, setHairPartColor, applyHairPartPalette,
    resetHairPartColors, applyHairPalette, restoreHairColors
  } = useCustomizerHairAppearanceActions({
    selectedCharacter, selectedModelSlot: selectedCatalogModelSlot, charactersRef, saveCharacterCustomization
  })

  async function submitCharacterDialog(event: import('react').FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = nameDraft.trim()
    if (!name || savingCharacter) return
    setSavingCharacter(true)
    setCharactersError('')
    try {
      if (dialogMode === 'create') {
        const character = await window.desktop.customizer.createCustomizerCharacter(name)
        charactersRef.current = [...charactersRef.current, character]
        setCharacters((current) => [...current, character])
        setSelectedCharacterId(character.id)
        setActiveModule(null)
      } else if (dialogMode === 'rename' && selectedCharacter) {
        await saveCharacter({ ...selectedCharacter, name, updatedAt: new Date().toISOString() })
      }
      setDialogMode(null)
    } catch (reason) {
      setCharactersError(reason instanceof Error ? reason.message : 'Não foi possível salvar o personagem.')
    } finally {
      setSavingCharacter(false)
    }
  }

  async function deleteSelectedCharacter() {
    if (!selectedCharacter || !window.confirm(`Excluir ${selectedCharacter.name}? Esta ação não remove modelos nem poses do Fabricador Dev.`)) return
    try {
      await window.desktop.customizer.deleteCustomizerCharacter(selectedCharacter.id)
      const remaining = characters.filter((character) => character.id !== selectedCharacter.id)
      charactersRef.current = remaining
      setCharacters(remaining)
      setSelectedCharacterId(remaining[0]?.id ?? '')
      setActiveModule(null)
      setCharactersError('')
    } catch (reason) {
      setCharactersError(reason instanceof Error ? reason.message : 'Não foi possível excluir o personagem.')
    }
  }

  const availableModels = catalogModels.filter((model): model is NonNullable<typeof model> => model !== null)
  const recoveryModelSlots = new Set(catalogModels.flatMap((model) => model?.recoveryRequired ? [model.slot] : []))
  const availablePoses = catalogPoses.filter((pose): pose is NonNullable<typeof pose> => pose?.sourceModelSlot === selectedCatalogModelSlot && !recoveryModelSlots.has(pose.sourceModelSlot)).sort((a, b) => a.slot - b.slot)
  const poseCategories = ['Parado', 'Sentado', ...new Set(availablePoses.map(resolvePoseCategory).filter((category) => category !== 'Parado' && category !== 'Sentado'))]
  const categoryPoses = availablePoses.filter((pose) => resolvePoseCategory(pose) === selectedPoseCategory)
  const posePageCount = Math.max(1, Math.ceil(categoryPoses.length / 5))
  const activePosePage = Math.min(selectedPosePage, posePageCount - 1)
  const visibleCategoryPoses = categoryPoses.slice(activePosePage * 5, activePosePage * 5 + 5)
  const showAdjacentPoseCategory = (direction: -1 | 1) => {
    const categoryIndex = poseCategories.indexOf(selectedPoseCategory)
    const nextCategory = poseCategories[(categoryIndex + direction + poseCategories.length) % poseCategories.length]
    setSelectedPoseCategory(nextCategory)
    setSelectedPosePage(0)
  }
  const showAdjacentPosePage = (direction: -1 | 1) => {
    setSelectedPosePage((current) => Math.max(0, Math.min(posePageCount - 1, current + direction)))
  }
  const activeFaceAppearance = characterFaceAppearance?.modelSlot === selectedCatalogModelSlot ? characterFaceAppearance : undefined
  const faceCatalogModel = useMemo(() => createCustomizerFaceCatalogModel({
    faceCatalogItems,
    faceCatalogDetails,
    faceComponentAssets,
    faceComponentDetails,
    appearance: activeFaceAppearance
  }), [faceCatalogItems, faceCatalogDetails, faceComponentAssets, faceComponentDetails, activeFaceAppearance])
  const renderHairCustomizer = () => {
    const appearance = characterHairAppearance?.modelSlot === selectedCatalogModelSlot ? characterHairAppearance : undefined
    const colorOverrides = appearance?.colors ?? {}
    const renderPieceSelector = (part: typeof customizerHairParts[number]) => {
      const { side } = part
      const options = hairStyles.filter((summary) => hairStyleSupportsCategory(summary, part.id))
      const selectedId = hairAppearancePartStyleId(appearance, part.id)
      const selectedIndex = options.findIndex((summary) => summary.id === selectedId)
      const selected = selectedIndex >= 0 ? options[selectedIndex] : null
      const selectedSlot = selectedIndex >= 0 ? selectedIndex + 1 : 0
      const slotCount = options.length + 1
      const asset = selected ? hairDetails[`${selected.modelSlot}:${selected.id}`]?.[side] : null
      const pieceColors = resolvedHairColors(appearance, part.id)
      const hasLocalColors = Object.keys(appearance?.partColors?.[part.id] ?? {}).length > 0
      const chooseAt = (index: number) => {
        if (!selectedCharacter) return
        const slot = wrapSlotIndex(index, slotCount)
        void chooseHairPartStyle(part.id, slot === 0 ? null : options[slot - 1])
      }
      return <article className="customizer-hair-piece" key={part.id}>
        <header><strong>{part.label} {selectedSlot + 1}/{slotCount}</strong>{hasLocalColors && <button className="customizer-hair-reset" onClick={() => void resetHairPartColors(part.id)} title={`Voltar ${part.label} à paleta geral`} type="button">Usar paleta geral</button>}</header>
        <div className="customizer-hair-piece-selector">
          <button aria-label={`Peça anterior: ${part.label}`} onClick={() => chooseAt(selectedSlot - 1)} disabled={!options.length || !selectedCharacter} type="button"><Icon name="chevronRight" /></button>
          <button className="customizer-hair-piece-preview" aria-label={`Abrir biblioteca de ${part.label}`} title={`Abrir biblioteca de ${part.label}`} onClick={() => { setHairLibraryPage(0); setHairLibraryPart(part.id) }} type="button">
            {asset ? <HairAssetPreview source={asset.dataUrl} colors={pieceColors} alt={selected?.name ?? ''} /> : null}
          </button>
          <button aria-label={`Próxima peça: ${part.label}`} onClick={() => chooseAt(selectedSlot + 1)} disabled={!options.length || !selectedCharacter} type="button"><Icon name="chevronRight" /></button>
          <div className="customizer-hair-piece-colors" aria-label={`Cores de ${part.label}`}>
            {hairColorControls.map((color) => <label key={color.id} className={appearance?.partColors?.[part.id]?.[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': pieceColors[color.id] ?? color.fallback } as React.CSSProperties} title={`${color.label} de ${part.label} · ${appearance?.partColors?.[part.id]?.[color.id] ? 'ajuste individual' : 'paleta geral'}`}>
              <input type="color" aria-label={`${color.label} de ${part.label}`} value={pieceColors[color.id] ?? color.fallback} disabled={!selectedCharacter || !asset} onFocus={() => setActiveHairColorRole(color.id)} onChange={(event) => void setHairPartColor(part.id, color.id, event.target.value)} />
              <span aria-hidden="true">{color.id === 'highlight' ? 'L' : color.id === 'accent' ? 'A' : color.id === 'outline' ? 'C' : color.id === 'fade' ? 'D' : 'B'}</span>
            </label>)}
          </div>
        </div>
        <PiecePaletteStrip label={part.label} colors={appearance?.partColors?.[part.id]} disabled={!selectedCharacter || !asset} onSelect={(colors) => void applyHairPartPalette(part.id, colors)} />
      </article>
    }
    return <section className="customizer-hair-workspace" aria-label="Personalização do cabelo">
      {selectedCatalogModelSlot === null ? <div className="customizer-catalog-empty">Escolha um modelo para carregar os cabelos do Fabricador Dev.</div>
        : hairLoading ? <div className="customizer-catalog-empty">Carregando cabelos do Fabricador Dev…</div>
          : <>
            <div className="customizer-hair-layout">
            <div className="customizer-hair-color-controls" aria-label="Paleta geral dos cabelos">
              <div className="customizer-hair-palette-editor">
                <div className="customizer-hair-palette-title"><strong>Paleta geral</strong><span>Uma cor para os cinco cabelos</span><button type="button" onClick={() => void restoreHairColors()} disabled={!appearance || !Object.keys(colorOverrides).length && !Object.values(appearance.partColors ?? {}).some((colors) => Object.keys(colors ?? {}).length)} title="Restaurar as cores originais dos cinco cabelos">Restaurar</button></div>
                <div className="customizer-hair-palette-swatches">{hairColorControls.map((color) => <label className="customizer-hair-color-control" data-role={color.id} key={color.id} title={`${color.label} · aplica a todos os cabelos`}>
                  <span>{color.label}</span><input className={activeHairColorRole === color.id ? 'active' : ''} type="color" aria-label={`${color.label} geral`} value={colorOverrides[color.id] ?? color.fallback} disabled={!selectedCharacter} onFocus={() => setActiveHairColorRole(color.id)} onChange={(event) => void setHairColor(color.id, event.target.value)} />
                </label>)}</div>
              </div>
              <aside className="customizer-hair-palette-presets" aria-label="Paletas prontas">
                <button className="customizer-hair-palette-scroll previous" aria-label="Ver paletas anteriores" onClick={() => hairPaletteStripRef.current?.scrollBy({ left: -180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
                <div className="customizer-hair-palette-preset-list" ref={hairPaletteStripRef}>{hairPalettePresets.map((preset) => <button key={preset.name} type="button" disabled={!selectedCharacter} aria-pressed={hairColorControls.every((color) => colorOverrides[color.id] === preset.colors[color.id])} onClick={() => void applyHairPalette(preset.colors)} title={`Aplicar a paleta ${preset.name} aos cinco cabelos`}><span style={{ background: `linear-gradient(115deg, ${preset.colors.highlight} 0 23%, ${preset.colors.base} 23% 65%, ${preset.colors.fade} 65% 84%, ${preset.colors.outline} 84%)` }} />{preset.name}</button>)}</div>
                <button className="customizer-hair-palette-scroll" aria-label="Ver próximas paletas" onClick={() => hairPaletteStripRef.current?.scrollBy({ left: 180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
              </aside>
            </div>
            {customizerHairParts.map(renderPieceSelector)}
            </div>
          </>}
    </section>
  }

  const renderHairLibrary = () => {
    if (!hairLibraryPart) return null
    const part = customizerHairParts.find((item) => item.id === hairLibraryPart)
    if (!part) return null
    const { options, visible, pageCount, page } = hairLibraryPageView
    const appearance = characterHairAppearance?.modelSlot === selectedCatalogModelSlot ? characterHairAppearance : undefined
    const selectedId = hairAppearancePartStyleId(appearance, part.id)
    const choose = (summary: HairStyleSummary | null) => {
      void chooseHairPartStyle(part.id, summary)
    }
    return <section className="customizer-hair-library" aria-labelledby="customizer-hair-library-title">
        <header className="customizer-hair-library-heading">
          <button className="customizer-hair-library-remove" type="button" onClick={() => void chooseHairPartStyle(part.id, null)} disabled={!selectedId} aria-label={`Remover ${part.label} do personagem`} title={`Remover ${part.label} do personagem`}><Icon name="trash" /></button>
          <h2 id="customizer-hair-library-title">{part.label}</h2>
          <button className="customizer-hair-library-close" type="button" onClick={() => setHairLibraryPart(null)} aria-label="Fechar biblioteca">×</button>
        </header>
        <div className="customizer-hair-library-grid" aria-label={`Peças disponíveis para ${part.label}`} aria-busy={hairLibraryPageLoading}>
          {visible.map((summary) => {
            if (!summary) return <button className={`customizer-hair-library-item${!selectedId ? ' selected' : ''}`} key="empty-slot" title="Slot vazio" aria-label={`Slot vazio · remover ${part.label} do personagem`} aria-pressed={!selectedId} type="button" onClick={() => choose(null)} />
            const asset = hairDetails[`${summary.modelSlot}:${summary.id}`]?.[part.side]
            const isSelected = summary.id === selectedId
            return <button className={`customizer-hair-library-item${isSelected ? ' selected' : ''}`} key={summary.id} title={summary.name} aria-label={`Selecionar ${summary.name}`} aria-pressed={isSelected} type="button" onClick={() => choose(summary)}>
              {asset ? <HairAssetPreview source={asset.dataUrl} colors={resolvedHairColors(appearance, part.id)} alt="" /> : <span className="customizer-hair-library-placeholder"><Icon name="bow" /></span>}
            </button>
          })}
          {!options.length && <p className="customizer-hair-library-empty">Nenhuma peça salva nesta categoria.</p>}
        </div>
        <footer className="customizer-hair-library-pagination">
          <button className="customizer-hair-library-page-arrow" type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => setHairLibraryPage((current) => Math.max(0, current - 1))}><Icon name="chevronRight" /></button>
          <span>Página <strong>{page + 1}/{pageCount}</strong></span>
          <button className="customizer-hair-library-page-arrow next" type="button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => setHairLibraryPage((current) => Math.min(pageCount - 1, current + 1))}><Icon name="chevronRight" /></button>
        </footer>
      </section>
  }

  const renderFaceCustomizer = () => {
    const appearance = characterFaceAppearance?.modelSlot === selectedCatalogModelSlot ? characterFaceAppearance : undefined
    const renderPart = (part: typeof customizerFaceParts[number]) => {
      const options = faceCatalogModel.optionsForCategory(part.category)
      const selectedId = facePartCatalogId(appearance, part)
      const selectedAsset = selectedId ? faceComponentAssets.find((summary) => summary.id === selectedId) : undefined
      const selectedOption = selectedAsset && isRightFaceAsset(selectedAsset)
        ? options.find((summary) => sameFaceAssetPair(summary, selectedAsset, faceComponentDetails))
        : selectedAsset
      const selectedIndex = options.findIndex((summary) => summary.id === selectedOption?.id)
      const selected = selectedIndex >= 0 ? options[selectedIndex] : null
      const piece = selectedId ? faceComponentDetails[selectedId] : null
      const selectedSlot = selectedIndex >= 0 ? selectedIndex + 1 : 0
      const slotCount = options.length + 1
      const colorPartId = facePartSourceId(part)
      const componentAppearance = appearance?.components?.[colorPartId]
      const colors = componentAppearance?.colors ?? {}
      const hasLocalColors = Object.keys(colors).length > 0
      const chooseAt = (index: number) => {
        if (!selectedCharacter) return
        const slot = wrapSlotIndex(index, slotCount)
        if (slot === 0) void clearFacePartSelection(part.id)
        else void chooseFacePartCatalogItem(part.id, options[slot - 1])
      }
      return <article className={`customizer-hair-piece customizer-face-piece customizer-face-piece-${part.id}`} key={part.id}>
        <header><strong>{part.label} {selectedSlot + 1}/{slotCount}</strong>{hasLocalColors && <button className="customizer-hair-reset" onClick={() => void resetFacePartColors(colorPartId)} title={'Restaurar cores de ' + part.label} type="button">Restaurar</button>}</header>
        <div className="customizer-hair-piece-selector">
          <button aria-label={'Peça anterior: ' + part.label} onClick={() => chooseAt(selectedSlot - 1)} disabled={!options.length || !selectedCharacter} type="button"><Icon name="chevronRight" /></button>
          <button className="customizer-hair-piece-preview" aria-label={'Abrir biblioteca de ' + part.label} title={'Abrir biblioteca de ' + part.label} onClick={() => { setFaceLibraryPage(0); setFaceLibraryPart(part.id) }} type="button">
            {piece ? <HairAssetPreview source={piece.dataUrl} colors={colors} tintOptions={{ preserveNearWhite: true, allowNearWhiteRoles: componentAppearance?.manualColorRoles }} alt={selected?.name ?? ''} flipX={part.side === 'right'} /> : null}
          </button>
          <button aria-label={'Próxima peça: ' + part.label} onClick={() => chooseAt(selectedSlot + 1)} disabled={!options.length || !selectedCharacter} type="button"><Icon name="chevronRight" /></button>
          <div className="customizer-hair-piece-colors" aria-label={'Cores de ' + part.label}>
            {facePartColorControls.map((color) => <label key={color.id} className={colors[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': colors[color.id] ?? color.fallback } as React.CSSProperties} title={color.label + ' de ' + part.label}>
              <input type="color" aria-label={color.label + ' de ' + part.label} value={colors[color.id] ?? color.fallback} disabled={!selectedCharacter || !piece} onChange={(event) => void setFacePartColor(part.id, color.id, event.target.value)} />
              <span aria-hidden="true">{color.id === 'highlight' ? 'L' : color.id === 'accent' ? 'A' : color.id === 'outline' ? 'C' : color.id === 'fade' ? 'D' : 'B'}</span>
            </label>)}
          </div>
        </div>
        <PiecePaletteStrip label={part.label} colors={colors} disabled={!selectedCharacter || !piece} onSelect={(palette) => void applyFacePartPalette(part.id, palette)} />
      </article>
    }
    return <section className="customizer-hair-workspace customizer-face-workspace" aria-label="Personalização dos olhos e sobrancelhas">
      {selectedCatalogModelSlot === null ? <div className="customizer-catalog-empty">Escolha um modelo para carregar olhos e sobrancelhas do Fabricador Dev.</div>
        : faceLoading ? <div className="customizer-catalog-empty">Carregando catálogo facial…</div>
          : <div className="customizer-hair-layout customizer-face-layout">{customizerFaceParts.map(renderPart)}</div>}
    </section>
  }

  const renderFaceLibrary = () => {
    if (!faceLibraryPart) return null
    const part = customizerFaceParts.find((entry) => entry.id === faceLibraryPart)
    if (!part) return null
    const options = faceCatalogModel.optionsForCategory(part.category)
    const pageSize = 20
    const slots: Array<FaceComponentAssetSummary | null> = [null, ...options]
    const pageCount = Math.max(1, Math.ceil(slots.length / pageSize))
    const page = Math.min(faceLibraryPage, pageCount - 1)
    const visible = slots.slice(page * pageSize, (page + 1) * pageSize)
    const appearance = characterFaceAppearance?.modelSlot === selectedCatalogModelSlot ? characterFaceAppearance : undefined
    const selectedId = facePartCatalogId(appearance, part)
    const selectedAsset = selectedId ? faceComponentAssets.find((summary) => summary.id === selectedId) : undefined
    const selectedOption = selectedAsset && isRightFaceAsset(selectedAsset)
      ? options.find((summary) => sameFaceAssetPair(summary, selectedAsset, faceComponentDetails))
      : selectedAsset
    const selectedIndex = options.findIndex((summary) => summary.id === selectedOption?.id)
    const selectedFacePart = appearance?.components?.[facePartSourceId(part)]
    const selectedColors = selectedFacePart?.colors
    return <section className="customizer-hair-library" aria-labelledby="customizer-face-library-title">
      <header className="customizer-hair-library-heading">
        <button className="customizer-hair-library-remove" type="button" onClick={() => void clearFacePartSelection(part.id)} disabled={!selectedId} aria-label={'Remover ' + part.label + ' do personagem'} title={'Remover ' + part.label + ' do personagem'}><Icon name="trash" /></button>
        <h2 id="customizer-face-library-title">{part.label}</h2>
        <button className="customizer-hair-library-close" type="button" onClick={() => setFaceLibraryPart(null)} aria-label="Voltar aos controles dos olhos">×</button>
      </header>
      <div className="customizer-hair-library-grid" aria-label={'Biblioteca de ' + part.label}>
        {visible.map((summary) => {
          if (!summary) return <button className={`customizer-hair-library-item${selectedIndex < 0 ? ' selected' : ''}`} key="empty-slot" title="Slot vazio" aria-label={`Slot vazio · remover ${part.label} do personagem`} aria-pressed={selectedIndex < 0} type="button" onClick={() => void clearFacePartSelection(part.id)} />
          const piece = faceComponentDetails[summary.id]
          const selected = summary.id === selectedOption?.id
          return <button className={`customizer-hair-library-item${selected ? ' selected' : ''}`} key={summary.id} title={summary.name} aria-label={'Selecionar ' + summary.name} aria-pressed={selected} type="button" onClick={() => void chooseFacePartCatalogItem(part.id, summary)}>
            {piece ? <HairAssetPreview source={piece.dataUrl} colors={selectedColors} tintOptions={{ preserveNearWhite: true, allowNearWhiteRoles: selectedFacePart?.manualColorRoles }} alt="" flipX={part.side === 'right'} /> : <span className="customizer-hair-library-placeholder"><Icon name="face" /></span>}
          </button>
        })}
        {!options.length && <p className="customizer-hair-library-empty">Nenhum asset salvo para {part.label}. Importe esta peça no Rosto Dev.</p>}
      </div>
      <footer className="customizer-hair-library-pagination">
        <button className="customizer-hair-library-page-arrow" type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => setFaceLibraryPage((current) => Math.max(0, current - 1))}><Icon name="chevronRight" /></button>
        <span>Página <strong>{page + 1}/{pageCount}</strong></span>
        <button className="customizer-hair-library-page-arrow next" type="button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => setFaceLibraryPage((current) => Math.min(pageCount - 1, current + 1))}><Icon name="chevronRight" /></button>
      </footer>
    </section>
  }

  const renderUpperWardrobeLibrary = () => {
    if (!wardrobeLibraryPanel) return null
    const panel = wardrobeLibraryPanel
    const candidates = wardrobePanelCandidates(panel, selectedCatalogModelSlot, wardrobeSets, wardrobeDetails, faceComponentAssets, faceComponentDetails)
    const slots: Array<(typeof candidates)[number] | null> = [null, ...candidates]
    const pageSize = 20
    const pageCount = Math.max(1, Math.ceil(slots.length / pageSize))
    const page = Math.min(wardrobeLibraryPage, pageCount - 1)
    const visible = slots.slice(page * pageSize, (page + 1) * pageSize)
    const appliedGroups = selectedCharacter?.customization.wardrobeGroups ?? []
    const selectedIndex = candidates.findIndex((candidate) => isWardrobePanelCandidateSelected(candidate, panel, appliedGroups, selectedCharacter?.customization.faceAppearance))
    const clearPanel = () => void applyUpperWardrobePanel(panel, null)
    return <section className="customizer-hair-library" aria-labelledby="customizer-upper-wardrobe-library-title">
      <header className="customizer-hair-library-heading">
        <button className="customizer-hair-library-remove" type="button" onClick={clearPanel} disabled={selectedIndex < 0} aria-label={`Remover ${panel.label} do personagem`} title={`Remover ${panel.label} do personagem`}><Icon name="trash" /></button>
        <h2 id="customizer-upper-wardrobe-library-title">{panel.label}</h2>
        <button className="customizer-hair-library-close" type="button" onClick={() => setWardrobeLibraryPanel(null)} aria-label="Fechar biblioteca">×</button>
      </header>
      <div className="customizer-hair-library-grid" aria-label={`Biblioteca de ${panel.label}`}>
        {visible.map((entry) => {
          if (!entry) return <button className={`customizer-hair-library-item${selectedIndex < 0 ? ' selected' : ''}`} key="empty-slot" title="Slot vazio" aria-label={`Slot vazio · remover ${panel.label} do personagem`} aria-pressed={selectedIndex < 0} type="button" onClick={clearPanel} />
          const selected = entry.summary.id === candidates[selectedIndex]?.summary.id && entry.component.id === candidates[selectedIndex]?.component.id
          return <button className={`customizer-hair-library-item${selected ? ' selected' : ''}`} key={`${entry.summary.modelSlot}:${entry.summary.id}:${entry.component.id}`} title={entry.component.name} aria-label={`Selecionar ${entry.component.name}`} aria-pressed={selected} type="button" onClick={() => { void applyUpperWardrobePanel(panel, entry); setWardrobeLibraryPanel(null) }}>
            <WardrobePanelCandidatePreview candidate={entry} />
          </button>
        })}
        {!candidates.length && <p className="customizer-hair-library-empty">Nenhuma peça salva para {panel.label}. Importe e classifique uma peça no Fabricador Dev.</p>}
      </div>
      <footer className="customizer-hair-library-pagination">
        <button className="customizer-hair-library-page-arrow" type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => setWardrobeLibraryPage((current) => Math.max(0, current - 1))}><Icon name="chevronRight" /></button>
        <span>Página <strong>{page + 1}/{pageCount}</strong></span>
        <button className="customizer-hair-library-page-arrow next" type="button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => setWardrobeLibraryPage((current) => Math.min(pageCount - 1, current + 1))}><Icon name="chevronRight" /></button>
      </footer>
    </section>
  }

  const renderUpperWardrobePanels = () => {
    const page = clothingSection === 'Inferior' ? lowerWardrobePage : upperWardrobePage
    const pageTwo = page === 2
    const panels = selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'extra' ? accessoryWardrobePanels : clothingSection === 'Inferior'
      ? pageTwo ? lowerWardrobePageTwoPanels : lowerWardrobePanels
      : pageTwo ? upperWardrobePageTwoPanels : upperWardrobePanels
    return <div className={`customizer-hair-layout customizer-upper-wardrobe-layout${clothingSection === 'Superior' && pageTwo ? ' page-two' : ''}${clothingSection === 'Inferior' && pageTwo ? ' lower-page-two' : ''}`} aria-label={`Peças de roupa ${clothingSection.toLowerCase()} · página ${page}`}>
    {panels.map((panel) => {
      const candidates = wardrobePanelCandidates(panel, selectedCatalogModelSlot, wardrobeSets, wardrobeDetails, faceComponentAssets, faceComponentDetails)
      const appliedGroups = selectedCharacter?.customization.wardrobeGroups ?? []
      const selectedIndex = candidates.findIndex((candidate) => isWardrobePanelCandidateSelected(candidate, panel, appliedGroups, selectedCharacter?.customization.faceAppearance))
      const currentCandidate = selectedIndex >= 0 ? candidates[selectedIndex] : null
      const currentGroup = currentCandidate ? appliedGroups.find((group) => group.modelSlot === currentCandidate.summary.modelSlot && group.setId === currentCandidate.summary.id && group.category === panel.category && group.componentId === currentCandidate.component.id) : undefined
      const wardrobePalette = selectedCharacter?.customization.wardrobePalettes?.[panel.id] ?? {}
      const colors = { ...wardrobePalette, ...currentGroup?.colors }
      const hasLocalColors = !currentCandidate?.headExtraAsset && Object.keys(colors).length > 0
      const selectedSlot = selectedIndex >= 0 ? selectedIndex + 1 : 0
      const slotCount = candidates.length + 1
      const move = (direction: -1 | 1) => {
        const nextSlot = (selectedSlot + direction + slotCount) % slotCount
        void applyUpperWardrobePanel(panel, nextSlot === 0 ? null : candidates[nextSlot - 1])
      }
      return <article className={`customizer-hair-piece customizer-upper-wardrobe-piece customizer-wardrobe-piece-${panel.id}`} key={panel.id} aria-label={panel.label}>
        <header><strong>{panel.label} {selectedSlot + 1}/{candidates.length + 1}</strong>{hasLocalColors && currentCandidate && <button className="customizer-hair-reset" type="button" onClick={() => void resetWardrobePieceColors(panel, currentCandidate.summary.id, currentCandidate.components.map((component) => component.id))}>Restaurar</button>}</header>
        <div className="customizer-hair-piece-selector customizer-upper-wardrobe-selector">
          <button aria-label={`Peça anterior: ${panel.label}`} onClick={() => move(-1)} disabled={!candidates.length || !selectedCharacter || selectedCatalogModelSlot === null} type="button"><Icon name="chevronRight" /></button>
          <button className="customizer-hair-piece-preview" aria-label={`Abrir biblioteca de ${panel.label}`} title={`Abrir biblioteca de ${panel.label}`} onClick={() => { setWardrobeLibraryPage(0); setWardrobeLibraryPanel(panel) }} type="button">
            {currentCandidate ? <WardrobePanelCandidatePreview candidate={currentCandidate} colors={colors} /> : <span>Escolha uma peça</span>}
          </button>
          <button aria-label={`Próxima peça: ${panel.label}`} onClick={() => move(1)} disabled={!candidates.length || !selectedCharacter || selectedCatalogModelSlot === null} type="button"><Icon name="chevronRight" /></button>
          <div className="customizer-hair-piece-colors" aria-label={`Cores de ${panel.label}`}>
            {hairColorControls.map((color) => <label key={color.id} className={colors[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': colors[color.id] ?? color.fallback } as React.CSSProperties} title={`${color.label} de ${panel.label}`}>
              <input type="color" aria-label={`${color.label} de ${panel.label}`} value={colors[color.id] ?? color.fallback} disabled={!selectedCharacter || !currentCandidate || Boolean(currentCandidate.headExtraAsset)} onChange={(event) => void setWardrobePieceColor(currentCandidate!.summary.id, panel.category, currentCandidate!.components.map((component) => component.id), color.id, event.target.value)} />
              <span aria-hidden="true">{color.id === 'highlight' ? 'L' : color.id === 'accent' ? 'A' : color.id === 'outline' ? 'C' : color.id === 'fade' ? 'D' : 'B'}</span>
            </label>)}
          </div>
        </div>
        <div className="customizer-upper-piece-colors" aria-label={`Paletas de ${panel.label}`}>
          <div className="customizer-upper-piece-colors-heading"><strong>{currentCandidate?.component.name ?? 'Paleta da peça'}</strong></div>
          <div className="customizer-hair-palette-presets customizer-upper-piece-palette-presets">
            <button className="customizer-hair-palette-scroll previous" aria-label={`Ver paletas anteriores de ${panel.label}`} onClick={() => wardrobePaletteStripRefs.current[panel.id]?.scrollBy({ left: -180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
            <div className="customizer-hair-palette-preset-list" ref={(node) => { wardrobePaletteStripRefs.current[panel.id] = node }}>
              {hairPalettePresets.map((preset) => <button key={preset.name} type="button" disabled={!selectedCharacter || !currentCandidate || Boolean(currentCandidate.headExtraAsset)} aria-pressed={hairColorControls.every((color) => wardrobePalette[color.id] === preset.colors[color.id])} onClick={() => currentCandidate && void applyWardrobePalette(panel, currentCandidate, preset.colors)} title={`Aplicar paleta ${preset.name} a ${panel.label}`}><span style={{ background: `linear-gradient(115deg, ${preset.colors.highlight} 0 23%, ${preset.colors.base} 23% 65%, ${preset.colors.fade} 65% 84%, ${preset.colors.outline} 84%)` }} />{preset.name}</button>)}
            </div>
            <button className="customizer-hair-palette-scroll" aria-label={`Ver próximas paletas de ${panel.label}`} onClick={() => wardrobePaletteStripRefs.current[panel.id]?.scrollBy({ left: 180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
          </div>
        </div>
      </article>
    })}
    </div>
  }

  const renderWardrobeCatalog = () => (
    <div className="customizer-wardrobe-catalog">
      {wardrobeLoading ? <div className="customizer-catalog-empty">Carregando roupas…</div> : <>
        {catalogError && <p className="customizer-catalog-error" role="alert">{catalogError}</p>}
        {unavailableWardrobeSetKeys.length > 0 && <div className="customizer-wardrobe-reference-notice" role="status"><span>{unavailableWardrobeSetKeys.length} conjunto(s) de roupa não estão disponíveis. Os vínculos foram preservados, mas essas roupas não podem aparecer.</span><button type="button" disabled={repairingWardrobeLinks} onClick={() => void removeUnavailableWardrobeLinks()}>{repairingWardrobeLinks ? 'Salvando…' : 'Remover vínculos indisponíveis'}</button></div>}
        {wardrobeLibraryPanel ? renderUpperWardrobeLibrary() : renderUpperWardrobePanels()}
      </>}
    </div>
  )

  const renderAdjustmentPicker = (area: 'head' | 'clothes') => {
    if (area === 'clothes') {
      const scopeDefinitions = clothesAdjustmentDefinitions(clothesCategorySelection)
      const adjustmentLabel = customizerClothesTabs.find((tab) => tab.id === clothesCategorySelection)?.label ?? 'categoria selecionada'
      const adjustmentComponents = buildClothesAdjustmentEntries(selectedCharacter?.customization.wardrobeGroups ?? [], wardrobeDetails, scopeDefinitions)
      const selectedAdjustmentComponent = selectedClothing
        ? adjustmentComponents.find((entry) => entry.group.modelSlot === selectedClothing.modelSlot && entry.group.setId === selectedClothing.setId && entry.group.category === selectedClothing.category && entry.component.id === selectedClothing.componentId)
        : undefined
      const transform = wardrobeTransformDraft ?? { offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0 }
      return <CustomizerClothesAdjustmentPanel
        label={adjustmentLabel} hasCharacter={Boolean(selectedCharacter)}
        entries={adjustmentComponents} selected={selectedAdjustmentComponent}
        selectedPiece={selectedClothing} transform={transform}
        onSelect={(piece) => {
          setSelectedClothing(piece)
          selectAdjustmentPreviewTarget({ scope:'clothing',piece })
        }}
        onTransform={(next) => { void updateClothesAdjustComponent('transform',next) }}
        onToggleHidden={() => { void updateClothesAdjustComponent('toggle-hidden') }}
      />
    }
    const items = headAdjustmentItemsFor(headCategorySelection)
    const headLabel = customizerHeadTabs.find((tab) => tab.id === headCategorySelection)?.label ?? 'categoria selecionada'
    return <CustomizerHeadAdjustmentPanel
      character={selectedCharacter}
      label={headLabel}
      items={items}
      selectedId={headAdjustSelection}
      details={{ hair: hairDetails, faceComponents: faceComponentDetails, wardrobe: wardrobeDetails, faceCatalog: faceCatalogDetails }}
      onSelect={(id) => {
        setHeadAdjustSelection(id)
        selectAdjustmentPreviewTarget({ scope: 'head', id })
      }}
      onToggleHidden={() => { void updateHeadAdjustment('toggle-hidden') }}
      onTransform={(transform) => { void updateHeadAdjustment('transform', transform) }}
    />
  }

  const previewSurfaceProps = {
    style: customizerPreviewStyle,
    artworkUrl: selectedArtworkUrl,
    artworkLabel: selectedArtworkLabel,
    previewLoading,
    previewBackground,
    wardrobeUrl: selectedWardrobeUrl,
    faceUrl: selectedFaceUrl,
    frontHairUrl: selectedFrontHairUrl,
    wardrobeAboveHairUrl: selectedWardrobeAboveHairUrl,
    onPreviewBackgroundChange: setPreviewBackground,
    onBeginPan: beginCustomizerPreviewPan,
    onMovePan: moveCustomizerPreviewPan,
    onEndPan: finishCustomizerPreviewPan,
    onZoomIn: zoomInCustomizerPreview,
    onZoomOut: zoomOutCustomizerPreview,
    onResetZoom: resetCustomizerPreviewZoom
  }

  if (activeModule !== null && customizerModuleNames.includes(activeModule)) {
    return (
      <div className="customizer-models-view">
        <div className="customizer-models-columns">
          <section className="customizer-model-preview" aria-label="Prévia do personagem">
            <div className="stage-wrap customizer-preview-stage-wrap" ref={customizerPreviewStageRef}>
              <CustomizerPreviewSurface
                {...previewSurfaceProps}
                stageRef={customizerPreviewStageRef}
                emptyArtworkMessage="Nenhum modelo salvo para mostrar."
                backButton={{ label: 'Voltar ao Customizar', onClick: () => setActiveModule(null) }}
              />
            </div>
          </section>
          <section className={`customizer-models-sidebar${selectedCustomizerTopTab === 'roupas' && (clothesPanelTab === 'upper' || clothesPanelTab === 'lower' || clothesPanelTab === 'adjust') ? ' customizer-models-sidebar-clothes-upper' : ''}`} aria-label="Categorias de personalização">
            <div className={`customizer-models-sidebar-nav${selectedCustomizerTopTab === 'roupas' ? ' customizer-models-sidebar-nav-clothes' : ''}`}>
            <nav className="customizer-top-tabs" aria-label="Áreas do Customizar" role="tablist">
              {customizerTopTabs.map((tab) => <button
                key={tab.id}
                className={selectedCustomizerTopTab === tab.id ? 'active' : ''}
                onClick={() => {
                  setSelectedCustomizerTopTab(tab.id)
                  setActiveModule(customizerModuleByTab[tab.id])
                }}
                aria-selected={selectedCustomizerTopTab === tab.id}
                role="tab"
                type="button"
              ><CustomizerCategoryIcon category={tab.id} /><span>{tab.label}</span></button>)}
            </nav>
            {selectedCustomizerTopTab === 'cabeca' && <nav className="customizer-head-category-tabs" aria-label="Categorias de cabeça" role="tablist">
              {customizerHeadTabs.map((tab) => <button key={tab.id} className={headPanelTab === tab.id || headPanelTab === 'adjust' && headCategorySelection === tab.id ? 'active' : ''} onClick={() => selectHeadTab(tab.id)} aria-selected={headPanelTab === tab.id} role="tab" type="button"><Icon name={tab.icon} /><span>{tab.label}</span></button>)}
            </nav>}
            {selectedCustomizerTopTab === 'roupas' && <nav className="customizer-clothes-category-tabs" aria-label="Categorias de roupas" role="tablist">
              {customizerClothesTabs.map((tab) => <button key={tab.id} className={clothesPanelTab === tab.id || clothesPanelTab === 'adjust' && clothesCategorySelection === tab.id ? 'active' : ''} onClick={() => selectClothesTab(tab.id, () => setWardrobeLibraryPanel(null))} aria-selected={clothesPanelTab === tab.id} role="tab" type="button"><Icon name={tab.icon} />{tab.id === 'upper' || tab.id === 'lower' ? <span className="customizer-upper-tab-label"><span>{tab.label}</span><small>{tab.id === 'upper' ? upperWardrobePage : lowerWardrobePage}/2</small></span> : <span>{tab.label}</span>}</button>)}
            </nav>}
            {selectedCustomizerTopTab === 'outros' && <nav className="customizer-other-category-tabs" aria-label="Categorias de outros itens" role="tablist">
              {customizerOtherTabs.map((tab) => <button key={tab.id} className={otherPanelTab === tab.id ? 'active' : ''} onClick={() => setOtherPanelTab(tab.id)} aria-selected={otherPanelTab === tab.id} role="tab" type="button"><Icon name={tab.icon} /><span>{tab.label}</span></button>)}
            </nav>}
            </div>
            <div className={`customizer-sidebar-scroll-content${selectedCustomizerTopTab === 'cabeca' && (headPanelTab === 'hair' || headPanelTab === 'eyes' || headPanelTab === 'face') ? ' customizer-sidebar-scroll-content-hair' : ''}${selectedCustomizerTopTab === 'roupas' && (clothesPanelTab === 'upper' || clothesPanelTab === 'lower' || clothesPanelTab === 'adjust') ? ' customizer-sidebar-scroll-content-clothes-upper' : ''}`} aria-label={`Conteúdo de ${customizerTopTabs.find((tab) => tab.id === selectedCustomizerTopTab)?.label ?? 'personalização'}`}>
            {catalogError && <p className="customizer-catalog-error" role="alert">{catalogError}</p>}
            {selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'hair' && (hairLibraryPart ? renderHairLibrary() : renderHairCustomizer())}
            {selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'eyes' && (faceLibraryPart ? renderFaceLibrary() : renderFaceCustomizer())}
            {selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'face' && <CustomizerFaceCatalogWorkspace
              selectedModelSlot={selectedCatalogModelSlot}
              loading={faceLoading || faceComponentLoading}
              selectedPart={faceCatalogLibraryPart}
              selectedPage={faceCatalogLibraryPage}
              faceCatalogModel={faceCatalogModel}
              faceCatalogDetails={faceCatalogDetails}
              appearance={activeFaceAppearance}
              hasCharacter={Boolean(selectedCharacter)}
              effectiveModelSkinTone={effectiveModelSkinTone}
              originalSkinTone={originalSkinTone}
              onSelectPart={setFaceCatalogLibraryPart}
              onSelectPage={setFaceCatalogLibraryPage}
              onChooseCatalogItem={chooseFaceCatalogItem}
              onChooseDetail={chooseFaceDetailCatalogItem}
              onClearPart={clearFaceCatalogPart}
              onSetVariant={setFaceCatalogVariant}
              onSetColor={setFaceCatalogPartColor}
              onApplyPalette={applyFaceCatalogPalette}
              onMouthBlushChange={setMouthBlush}
              onNoseOpacityChange={(value) => { void saveCharacterCustomization((current) => current.faceAppearance ? { faceAppearance: { ...current.faceAppearance, noseOpacity: value } } : {}) }}
              onNoseSkinToneChange={(tone) => { void saveCharacterCustomization((current) => current.faceAppearance ? { faceAppearance: { ...current.faceAppearance, noseSkinTone: tone } } : {}) }}
            />}
            {selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'extra' && renderWardrobeCatalog()}
            {selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'adjust' && renderAdjustmentPicker('head')}
            {selectedCustomizerTopTab === 'roupas' && (clothesPanelTab === 'upper' || clothesPanelTab === 'lower') && renderWardrobeCatalog()}
            {selectedCustomizerTopTab === 'roupas' && clothesPanelTab === 'adjust' && renderAdjustmentPicker('clothes')}
            {selectedCustomizerTopTab === 'modelos' && <CustomizerModelPicker models={availableModels} thumbnails={modelThumbnails} selectedSlot={selectedCatalogModelSlot} loading={catalogLoading} onSelect={(model) => void selectCatalogModel(model)} />}
            {selectedCustomizerTopTab === 'modelos' && <section className="customizer-model-skin-tones" aria-label="Cor de pele do modelo">
              <strong>Cor de pele</strong>
              <div className="customizer-model-skin-tone-row" role="group" aria-label="Escolher cor de pele">
                <button className={'customizer-model-skin-tone' + (!selectedSkinTone ? ' selected' : '')} style={{ '--skin-tone': originalSkinTone ?? sourceModelSkinTone ?? skinTonePresets[0].id } as React.CSSProperties} onClick={() => void saveCharacterCustomization({ modelSkinTone: undefined })} aria-label="Cor base do modelo" aria-pressed={!selectedSkinTone} title="Cor base do modelo" type="button" disabled={!selectedCharacter}><span />{!selectedSkinTone && <Icon name="check" />}</button>
                {customizerSkinTonePresets.map((preset) => {
                  const selected = selectedSkinTone === preset.id
                  return <button key={preset.id} className={'customizer-model-skin-tone' + (selected ? ' selected' : '')} style={{ '--skin-tone': preset.id } as React.CSSProperties} onClick={() => void saveCharacterCustomization({ modelSkinTone: preset.id })} aria-label={`Tom de pele ${preset.name}`} aria-pressed={selected} title={preset.name} type="button" disabled={!selectedCharacter}><span />{selected && <Icon name="check" />}</button>
                })}
                <label className={'customizer-model-skin-picker' + (selectedSkinTone && !customizerSkinTonePresets.some((preset) => preset.id === selectedSkinTone) ? ' selected' : '')} title="Escolher uma cor personalizada">
                  <input type="color" aria-label="Escolher cor de pele personalizada" value={selectedSkinTone ?? originalSkinTone ?? sourceModelSkinTone ?? skinTonePresets[0].id} onChange={(event) => void saveCharacterCustomization({ modelSkinTone: event.target.value })} disabled={!selectedCharacter} />
                  <span className="customizer-model-skin-picker-swatch" style={{ '--skin-tone': selectedSkinTone ?? originalSkinTone ?? sourceModelSkinTone ?? skinTonePresets[0].id } as React.CSSProperties}><Icon name="brush" /></span>
                </label>
              </div>
            </section>}
            {selectedCustomizerTopTab === 'modelos' && <section className="customizer-model-skin-tones customizer-model-outline-colors" aria-label="Cor do contorno do modelo">
              <strong>Cor do contorno</strong>
              <div className="customizer-model-skin-tone-row" role="group" aria-label="Escolher cor do contorno">
                <button className={'customizer-model-skin-tone' + (!isValidSkinTone(selectedOutlineColor) ? ' selected' : '')} style={{ '--skin-tone': sourceModelOutlineColor ?? '#70342c' } as React.CSSProperties} onClick={() => void saveCharacterCustomization({ modelOutlineColor: undefined })} aria-label="Usar cor padrão do modelo" aria-pressed={!isValidSkinTone(selectedOutlineColor)} title="Usar cor padrão do modelo" type="button" disabled={!selectedCharacter}><span />{!isValidSkinTone(selectedOutlineColor) && <Icon name="check" />}</button>
                <label className={'customizer-model-skin-picker' + (isValidSkinTone(selectedOutlineColor) ? ' selected' : '')} title="Escolher uma cor personalizada para os contornos">
                  <input type="color" aria-label="Escolher cor do contorno para este personagem" value={isValidSkinTone(selectedOutlineColor) ? selectedOutlineColor : sourceModelOutlineColor ?? '#70342c'} onChange={(event) => void saveCharacterCustomization({ modelOutlineColor: event.target.value })} disabled={!selectedCharacter} />
                  <span className="customizer-model-skin-picker-swatch" style={{ '--skin-tone': isValidSkinTone(selectedOutlineColor) ? selectedOutlineColor : sourceModelOutlineColor ?? '#70342c' } as React.CSSProperties}><Icon name="brush" /></span>
                </label>
              </div>
            </section>}
            {selectedCustomizerTopTab === 'modelos' && <section className="customizer-pose-carousel" aria-label="Pose do modelo">
              <header className="customizer-pose-carousel-heading" aria-live="polite">
                <strong>{selectedPoseCategory} · Página {activePosePage + 1}{posePageCount > 1 ? ` de ${posePageCount}` : ''}</strong>
              </header>
              <div className="customizer-pose-carousel-body">
                <div className="customizer-pose-carousel-nav" role="group" aria-label="Navegação à esquerda">
                  <button className="customizer-pose-carousel-arrow category" aria-label="Categoria anterior" title="Categoria anterior" onClick={() => showAdjacentPoseCategory(-1)} type="button"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M13 2 0 16l13 14v-8h19V10H13z" /></svg></button>
                  <button className="customizer-pose-carousel-arrow page" aria-label="Página anterior de poses" title="Página anterior" onClick={() => showAdjacentPosePage(-1)} disabled={activePosePage === 0} type="button"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M13 2 0 16l13 14v-8h19V10H13z" /></svg></button>
                </div>
                <div className="customizer-pose-carousel-poses">
                  {visibleCategoryPoses.map((pose) => <button className={`customizer-pose-carousel-image${selectedCatalogPoseSlot === pose.slot ? ' selected' : ''}`} key={`${pose.sourceModelSlot}:${pose.slot}`} onClick={() => void selectCatalogPose(pose)} disabled={!selectedCharacter || previewLoading} title={`Pose ${String(pose.slot).padStart(2, '0')}: ${pose.name}`} aria-label={`Selecionar pose ${String(pose.slot).padStart(2, '0')}`} aria-pressed={selectedCatalogPoseSlot === pose.slot} type="button">{poseThumbnails[`${pose.sourceModelSlot}:${pose.slot}`] ? <img src={poseThumbnails[`${pose.sourceModelSlot}:${pose.slot}`]} alt="" /> : <span>Pose {String(pose.slot).padStart(2, '0')}</span>}</button>)}
                  {Array.from({ length: Math.max(0, 5 - visibleCategoryPoses.length) }, (_, index) => <span className="customizer-pose-carousel-empty" key={`empty-${index}`} />)}
                </div>
                <div className="customizer-pose-carousel-nav" role="group" aria-label="Navegação à direita">
                  <button className="customizer-pose-carousel-arrow category" aria-label="Próxima categoria" title="Próxima categoria" onClick={() => showAdjacentPoseCategory(1)} type="button"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M19 2 32 16 19 30v-8H0V10h19z" /></svg></button>
                  <button className="customizer-pose-carousel-arrow page" aria-label="Próxima página de poses" title="Próxima página" onClick={() => showAdjacentPosePage(1)} disabled={activePosePage >= posePageCount - 1} type="button"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M19 2 32 16 19 30v-8H0V10h19z" /></svg></button>
                </div>
              </div>
            </section>}
            {selectedCustomizerTopTab === 'corpo' && <section className="customizer-proportions" aria-label="Proporções do personagem">
              <header><strong>Proporções</strong><button onClick={() => commitProportions({ ...defaultCharacterProportions })} disabled={!selectedCharacter} type="button">Restaurar</button></header>
              <div className="customizer-proportions-grid">{proportionControls.map(({ key, label, description }) => {
                const limits = characterProportionLimits[key]
                return <div className="customizer-proportion-control" key={key} title={description}>
                  <div className="customizer-proportion-heading"><label htmlFor={`character-proportion-${key}`}>{label}</label><output>{activeProportions[key]}%</output></div>
                  <div className="customizer-proportion-inputs">
                    <button aria-label={`Diminuir ${label.toLowerCase()}`} disabled={!selectedCharacter || activeProportions[key] <= limits.min} onClick={() => commitProportion(key, activeProportions[key] - 1)} type="button">−</button>
                    <input id={`character-proportion-${key}`} type="range" min={limits.min} max={limits.max} step="1" value={activeProportions[key]} disabled={!selectedCharacter} onChange={(event) => changeProportion(key, Number(event.target.value))} onPointerUp={(event) => commitProportion(key, Number(event.currentTarget.value))} onPointerCancel={(event) => commitProportion(key, Number(event.currentTarget.value))} onKeyUp={(event) => commitProportion(key, Number(event.currentTarget.value))} onBlur={(event) => commitProportion(key, Number(event.currentTarget.value))} />
                    <button aria-label={`Aumentar ${label.toLowerCase()}`} disabled={!selectedCharacter || activeProportions[key] >= limits.max} onClick={() => commitProportion(key, activeProportions[key] + 1)} type="button">+</button>
                  </div>
                </div>
              })}</div>
            </section>}
            {selectedCustomizerTopTab === 'corpo' && <section className="customizer-body-shape" aria-label="Ajuste de largura e altura das partes do corpo">
              <header><span><strong>Corpo · tronco e membros</strong><small>As peças acompanham as juntas, com ajustes separados para coxas e pernas inferiores.</small></span><button onClick={restoreBodyDimensions} disabled={!selectedCharacter} type="button">Restaurar</button></header>
              <div className="customizer-body-shape-grid">{([
                { name: 'Tronco', width: 'torsoWidth', height: 'torsoHeight' },
                { name: 'Braços', width: 'armsWidth', height: 'armsHeight' },
                { name: 'Coxas', width: 'thighsWidth', height: 'thighsHeight' },
                { name: 'Pernas inferiores', width: 'lowerLegsWidth', height: 'lowerLegsHeight' }
              ] as const).map(({ name, width, height }) => <fieldset className="customizer-body-part" key={name}>
                <legend>{name}</legend>
                {([['width', width, 'Largura'], ['height', height, 'Altura']] as const).map(([axis, key, label]) => {
                  const limits = characterBodyDimensionLimits[key]
                  const finish = (value: number) => commitBodyDimension(key, value)
                  return <label className="customizer-body-axis" key={axis}><span>{label}<output>{activeBodyDimensions[key]}%</output></span><div className="customizer-proportion-inputs"><button aria-label={`Diminuir ${label.toLowerCase()} de ${name}`} disabled={!selectedCharacter || activeBodyDimensions[key] <= limits.min} onClick={() => finish(activeBodyDimensions[key] - 1)} type="button">−</button><input aria-label={`${label} de ${name}`} type="range" min={limits.min} max={limits.max} step="1" value={activeBodyDimensions[key]} disabled={!selectedCharacter} onChange={(event) => changeBodyDimension(key, Number(event.target.value))} onPointerUp={(event) => finish(Number(event.currentTarget.value))} onPointerCancel={(event) => finish(Number(event.currentTarget.value))} onKeyUp={(event) => finish(Number(event.currentTarget.value))} onBlur={(event) => finish(Number(event.currentTarget.value))} /><button aria-label={`Aumentar ${label.toLowerCase()} de ${name}`} disabled={!selectedCharacter || activeBodyDimensions[key] >= limits.max} onClick={() => finish(activeBodyDimensions[key] + 1)} type="button">+</button></div></label>
                })}
              </fieldset>)}</div>
              <label className="customizer-body-balance"><span><b>Harmonia corporal</b><output>{activeBodyDimensions.balance}%</output></span><small>Coxas maiores aumentam um pouco o tronco; tronco maior aumenta um pouco braços e pernas. Em 0%, só o controle escolhido muda de tamanho.</small><input aria-label="Harmonia corporal" type="range" min="0" max="100" step="1" value={activeBodyDimensions.balance} disabled={!selectedCharacter} onChange={(event) => changeBodyDimension('balance', Number(event.target.value))} onPointerUp={(event) => commitBodyDimension('balance', Number(event.currentTarget.value))} onPointerCancel={(event) => commitBodyDimension('balance', Number(event.currentTarget.value))} onKeyUp={(event) => commitBodyDimension('balance', Number(event.currentTarget.value))} onBlur={(event) => commitBodyDimension('balance', Number(event.currentTarget.value))} /></label>
            </section>}
            </div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="home-layout">
        <aside className="roster-panel panel" aria-label="Personagens">
          <div className="panel-heading roster-heading">
            <div>
              <p className="eyebrow">SUA COLEÇÃO</p>
              <h2>Personagens <span>{characters.length.toString().padStart(2, '0')}</span></h2>
            </div>
            {selectedCharacter && <button className="icon-button roster-delete-button" aria-label={'Excluir ' + selectedCharacter.name} title="Excluir personagem" onClick={() => void deleteSelectedCharacter()} type="button"><Icon name="trash" /></button>}
            <button className="icon-button add-button" aria-label="Adicionar personagem" onClick={() => { setNameDraft(''); setDialogMode('create') }} type="button">
              <Icon name="plus" />
            </button>
          </div>
          <label className="roster-search">
            <Icon name="search" />
            <input aria-label="Buscar personagem" placeholder="Buscar personagem" value={rosterQuery} onChange={(event) => setRosterQuery(event.target.value)} />
            <kbd>/</kbd>
          </label>
          <div className="character-grid">
            {visibleCharacters.map((character) => (
              <button
                className={`character-card ${selectedCharacter?.id === character.id ? 'selected' : ''}`}
                key={character.id}
                onClick={() => selectCharacter(character.id)}
                aria-pressed={selectedCharacter?.id === character.id}
              >
                <RenderedCharacterPortrait className="customizer-character-headshot" character={character} />
                <span>{character.name}</span>
              </button>
            ))}
            {charactersLoading && <p className="empty-roster">Carregando personagens…</p>}
            {!charactersLoading && characters.length === 0 && <p className="empty-roster">Sua coleção está vazia. Use + para criar o primeiro personagem.</p>}
            {!charactersLoading && characters.length > 0 && visibleCharacters.length === 0 && <p className="empty-roster">Nenhum personagem encontrado.</p>}
          </div>
          <div className="roster-footer"><span className={'online-dot' + (charactersError || characterSaveState === 'error' ? ' roster-error-dot' : '')} /> {charactersError || (characterSaveState === 'saving' ? `Salvando ${selectedCharacter?.name ?? 'personagem'}…` : characterSaveState === 'error' ? 'Falha ao salvar personagem' : selectedCharacter ? `Alterações de ${selectedCharacter.name} salvas` : 'Personagens salvos neste dispositivo')}</div>
        </aside>

        <section className="preview-column" aria-label="Preview do personagem">
          <div className="stage-wrap customizer-preview-stage-wrap" ref={mainPreviewStageRef}>
            <CustomizerPreviewSurface
              {...previewSurfaceProps}
              stageRef={mainPreviewStageRef}
              emptyArtworkMessage={selectedCharacter ? 'Importe um modelo no Fabricador Dev para começar.' : 'Crie um personagem para começar a personalizar.'}
              identity={
                <div className="preview-title customizer-preview-identity">
                  <p className="eyebrow">CUSTOMIZAR <span>/</span> PERSONAGEM</p>
                  <h1><span className="customizer-preview-character-name">{selectedCharacter?.name ?? (charactersLoading ? 'Carregando personagens…' : 'Crie um personagem')}</span><button className="rename-button" aria-label="Editar nome do personagem" disabled={!selectedCharacter} onClick={() => { setNameDraft(selectedCharacter?.name ?? ''); setDialogMode('rename') }} type="button"><Icon name="edit" /></button></h1>
                </div>
              }
            />
            <div className="stage-underbar customizer-preview-underbar">
              <button className="text-action" onClick={() => setActiveModule('Personalização')}><Icon name="sliders" /> Personalizar</button>
            </div>
          </div>

        </section>

        <aside className="modules-panel panel" aria-label="Áreas do Customizar">
          <DesignBanner />
          <nav className="customizer-top-tabs home-customizer-top-tabs" aria-label="Áreas do Customizar">
            {customizerTopTabs.map((tab) => <button
              key={tab.id}
              onClick={() => {
                setSelectedCustomizerTopTab(tab.id)
                setActiveModule(customizerModuleByTab[tab.id])
              }}
              type="button"
            ><CustomizerCategoryIcon category={tab.id} /><span>{tab.label}</span></button>)}
          </nav>
        </aside>
      {dialogMode && <div className="character-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogMode(null) }}>
        <form className="character-dialog" onSubmit={(event) => void submitCharacterDialog(event)} aria-labelledby="character-dialog-title">
          <p className="eyebrow">SUA COLEÇÃO</p>
          <h2 id="character-dialog-title">{dialogMode === 'create' ? 'Novo personagem' : 'Renomear personagem'}</h2>
          <label htmlFor="character-name">Nome</label>
          <input id="character-name" autoFocus maxLength={80} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="Ex.: Chloe" />
          {charactersError && <p className="character-dialog-error" role="alert">{charactersError}</p>}
          <div className="character-dialog-actions"><button className="quiet-button" type="button" onClick={() => setDialogMode(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={!nameDraft.trim() || savingCharacter}>{savingCharacter ? 'Salvando…' : 'Salvar'}</button></div>
        </form>
      </div>}
    </div>
  )
}
