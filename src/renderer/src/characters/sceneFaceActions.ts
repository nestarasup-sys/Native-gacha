import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../shared/customizer'
import type { SceneExpressionBase, SceneFaceMode, SceneFaceTransforms } from '../../../shared/sceneFaceValidation'
import type { FaceCatalogItem, FaceCatalogItemSummary, FaceExpressionEffects, FaceExpressionPreset, FaceExpressionPresetSummary, FaceSheetKind } from '../../../shared/fabricator'
import { buildSceneExpressionAppearance, buildSceneExpressionTransforms, resolveSceneExpressionBase } from './sceneExpressionTransforms.ts'
import { sceneFaceModeForElement } from './sceneFaceMode.ts'

export type SceneFaceActionElement = {
  kind: string
  expressionBase?: SceneExpressionBase
  faceTransforms?: SceneFaceTransforms
  activeFaceMode?: SceneFaceMode
}

export type SceneFaceExpressionState = {
  expressionBase?: SceneExpressionBase
  activeExpressionGaze?: 'right' | 'left'
  activeExpressionPresetId?: string | null
  activeExpressionPresetUpdatedAt?: string
  activeExpressionCollectionId?: string
  activeExpressionEffects?: FaceExpressionEffects
  activeFaceMode?: SceneFaceMode
}

type ApplyFaceAppearance = (
  appearance: CustomizerFaceAppearance,
  faceTransforms?: SceneFaceTransforms,
  record?: boolean,
  expressionState?: SceneFaceExpressionState
) => Promise<void>

type CreateSceneFaceActionsOptions = {
  character: CustomizerCharacter | null
  element: SceneFaceActionElement | null
  appearance?: CustomizerFaceAppearance
  faceMode: SceneFaceMode
  modelSlot: number | null
  openMouthCatalogId?: string | null
  expressionCollectionId: string
  expressionBusy: boolean
  faceBusy: boolean
  setExpressionBusy: (busy: boolean) => void
  setError: (message: string | null) => void
  loadCatalogItem: (modelSlot: number, id: string) => Promise<FaceCatalogItem | null>
  applyAppearance: ApplyFaceAppearance
}

/** Shared inspector actions for Studio and Editor V6; each caller owns rendering and saving. */
export function createSceneFaceActions({
  character,
  element,
  appearance: selectedAppearance,
  faceMode,
  modelSlot,
  openMouthCatalogId,
  expressionCollectionId,
  expressionBusy,
  faceBusy,
  setExpressionBusy,
  setError,
  loadCatalogItem,
  applyAppearance
}: CreateSceneFaceActionsOptions) {
  const applyBaseExpression = async () => {
    const appearance = character?.customization.faceAppearance ?? selectedAppearance
    if (!element || !appearance || expressionBusy || faceBusy) return
    const activeFaceMode = sceneFaceModeForElement(element, appearance)
    const base = { ...resolveSceneExpressionBase(element, appearance), appearance: structuredClone(appearance) }
    setExpressionBusy(true)
    try {
      await applyAppearance(base.appearance, base.transforms, true, {
        expressionBase: base,
        activeExpressionPresetId: null,
        activeExpressionGaze: 'right',
        activeExpressionPresetUpdatedAt: undefined,
        activeExpressionCollectionId: expressionCollectionId,
        activeExpressionEffects: undefined,
        activeFaceMode
      })
    } finally {
      setExpressionBusy(false)
    }
  }

  const applyExpressionPreset = async (summary: FaceExpressionPresetSummary, gaze: 'right' | 'left' = 'right') => {
    if (!character || !element || element.kind !== 'character' || expressionBusy || faceBusy) return
    setExpressionBusy(true)
    setError(null)
    try {
      const preset: FaceExpressionPreset | null = await window.desktop.fabricator.loadFaceExpressionPreset(summary.modelSlot, summary.id)
      if (!preset || preset.modelSlot !== modelSlot) throw new Error('Este preset não está disponível para o modelo selecionado.')
      const characterAppearance = character.customization.faceAppearance ?? selectedAppearance
      if (!characterAppearance) throw new Error('A personagem ainda não tem uma aparência facial para ajustar.')
      const activeFaceMode = sceneFaceModeForElement(element, selectedAppearance)
      const base = { ...resolveSceneExpressionBase(element, characterAppearance), appearance: structuredClone(characterAppearance) }
      let nextAppearance = await buildSceneExpressionAppearance(preset, base.appearance, (id) => window.desktop.fabricator.loadFaceCatalogItem(preset.modelSlot, id))
      if (activeFaceMode === 'talk' && openMouthCatalogId && !nextAppearance.mouthOpenCatalogId) {
        nextAppearance = { ...nextAppearance, mouthOpenCatalogId: openMouthCatalogId }
      }
      const faceTransforms = await buildSceneExpressionTransforms(
        preset,
        nextAppearance,
        base.transforms,
        (id) => window.desktop.fabricator.loadFaceComponentAsset(preset.modelSlot, id),
        (id) => window.desktop.fabricator.loadFaceCatalogItem(preset.modelSlot, id),
        gaze
      )
      await applyAppearance(nextAppearance, faceTransforms, true, {
        expressionBase: base,
        activeExpressionPresetId: preset.id,
        activeExpressionGaze: gaze,
        activeExpressionPresetUpdatedAt: preset.updatedAt,
        activeExpressionCollectionId: preset.collectionId ?? 'standard',
        activeExpressionEffects: preset.effects,
        activeFaceMode
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar este preset de expressão.')
    } finally {
      setExpressionBusy(false)
    }
  }

  const applyFaceMode = async (mode: SceneFaceMode) => {
    if (!element || element.kind !== 'character' || !selectedAppearance || expressionBusy || faceBusy) return
    const appearance = mode === 'talk' && openMouthCatalogId && !selectedAppearance.mouthOpenCatalogId
      ? { ...selectedAppearance, mouthOpenCatalogId: openMouthCatalogId }
      : selectedAppearance
    await applyAppearance(appearance, element.faceTransforms ?? {}, true, { activeFaceMode: mode })
  }

  const chooseFaceSheet = async (summary: FaceCatalogItemSummary) => {
    if (!character) return
    let item: FaceCatalogItem | null
    try {
      item = await loadCatalogItem(summary.modelSlot, summary.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a folha facial selecionada.')
      return
    }
    if (!item) return
    const previous = selectedAppearance
    const sameModel = previous?.modelSlot === item.modelSlot
    const field: Record<FaceSheetKind, keyof CustomizerFaceAppearance> = {
      eyes: 'eyeCatalogId',
      eyebrows: 'eyebrowCatalogId',
      nose: 'noseCatalogId',
      'mouth-closed': 'mouthClosedCatalogId',
      'mouth-open': 'mouthOpenCatalogId'
    }
    const nextAppearance: CustomizerFaceAppearance = {
      ...(sameModel ? previous : undefined),
      modelSlot: item.modelSlot,
      setId: undefined,
      [field[item.category]]: item.id,
      eyeState: sameModel ? previous.eyeState : 0,
      eyebrows: sameModel ? previous.eyebrows : true,
      noseIndex: item.category === 'nose' ? item.selectedNose : sameModel ? previous.noseIndex : item.selectedNose,
      expressionIndex: item.category.startsWith('mouth') ? item.selectedExpression : sameModel ? previous.expressionIndex : item.selectedExpression,
      mouthOpen: item.category === 'mouth-open' ? true : item.category === 'mouth-closed' ? false : sameModel ? previous.mouthOpen : false
    }
    const activeFaceMode = item.category === 'mouth-open' ? 'talk' : item.category === 'mouth-closed' ? 'idle' : element?.activeFaceMode
    await applyAppearance(nextAppearance, element?.faceTransforms ?? {}, true, { activeFaceMode })
  }

  const updateFaceVariant = (patch: Partial<CustomizerFaceAppearance>) => {
    if (!selectedAppearance || modelSlot === null) return
    const changesFaceMode = Object.hasOwn(patch, 'mouthOpen') || Object.hasOwn(patch, 'eyeState')
    let activeFaceMode = element?.activeFaceMode
    if (Object.hasOwn(patch, 'mouthOpen')) activeFaceMode = patch.mouthOpen ? 'talk' : 'idle'
    else if (Object.hasOwn(patch, 'eyeState')) {
      activeFaceMode = patch.eyeState === 2 ? 'blink' : faceMode === 'talk' ? 'talk' : 'idle'
    }
    void applyAppearance(
      { ...selectedAppearance, ...patch },
      element?.faceTransforms ?? {},
      true,
      changesFaceMode ? { activeFaceMode } : undefined
    )
  }

  return {
    applyBaseExpression,
    applyExpressionPreset,
    applyFaceMode,
    chooseFaceSheet,
    updateFaceVariant
  }
}
