import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6FaceTransforms } from '../../../../shared/editorV6'
import type { FaceCatalogItem, FaceComponentAsset, FaceExpressionEffects, FaceExpressionPreset } from '../../../../shared/fabricator'
import { buildEditorV6ExpressionAppearance, buildEditorV6ExpressionTransforms, resolveEditorV6ExpressionBase } from './expressionTransforms'
import { editorV6FaceModeForElement } from './faceModeAssets'
import { resolveRefreshedFaceAppearance } from './editorV6RefreshAppearance'
import type { EditorV6CharacterRefreshGroup, EditorV6CharacterRefreshRenderJob } from './editorV6CharacterRefreshTypes'

type Dependencies = {
  loadPreset: (modelSlot: number, id: string) => Promise<FaceExpressionPreset | null>
  loadFaceCatalogItem: (modelSlot: number, id: string) => Promise<FaceCatalogItem | null>
  loadFaceComponentAsset: (modelSlot: number, id: string) => Promise<FaceComponentAsset | null>
}

/** Resolve the latest face state and renderer identity for one refresh group. */
export async function prepareEditorV6CharacterRefreshJob(
  group: EditorV6CharacterRefreshGroup,
  dependencies: Dependencies
): Promise<EditorV6CharacterRefreshRenderJob> {
  const { character, state, targets, poseRevision, modelRevision, wardrobeRevision, hairRevision, headExtraRevision, eyeRevision } = group
  const sourceAppearance = character.customization.faceAppearance
  const appearanceFallback = sourceAppearance ?? state.faceAppearance ?? state.expressionBase?.appearance
  const previousBase = appearanceFallback ? resolveEditorV6ExpressionBase(state, appearanceFallback) : undefined
  const sceneTransforms = Object.fromEntries(Object.entries(state.faceTransforms ?? {})
    .filter(([key]) => !key.startsWith('expression-component:') && !key.startsWith('expression:')))
  const expressionBase = sourceAppearance
    ? { appearance: structuredClone(sourceAppearance), transforms: sceneTransforms }
    : previousBase
  const modelSlot = character.customization.modelSlot ?? 1
  const currentFaceTransforms = state.faceTransforms as EditorV6FaceTransforms | undefined
  const preset = state.activeExpressionPresetId
    ? await dependencies.loadPreset(modelSlot, state.activeExpressionPresetId)
    : null
  const appearance = preset && expressionBase?.appearance
    ? await buildEditorV6ExpressionAppearance(preset, expressionBase.appearance,
      (id) => dependencies.loadFaceCatalogItem(preset.modelSlot, id))
    : resolveRefreshedFaceAppearance(state, character) ?? expressionBase?.appearance
  const faceTransforms = preset && appearance && expressionBase
    ? await buildEditorV6ExpressionTransforms(preset, appearance, expressionBase.transforms,
      (id) => dependencies.loadFaceComponentAsset(preset.modelSlot, id),
      (id) => dependencies.loadFaceCatalogItem(preset.modelSlot, id), state.activeExpressionGaze ?? 'right')
    : sourceAppearance
      ? expressionBase?.transforms ?? currentFaceTransforms
      : currentFaceTransforms ?? expressionBase?.transforms
  const effects: FaceExpressionEffects | undefined = preset?.effects ?? state.activeExpressionEffects
  const faceMode = editorV6FaceModeForElement(state, appearance)
  const characterCopy: CustomizerCharacter = {
    ...character,
    customization: {
      ...character.customization,
      poseSlot: state.poseSlot === undefined ? character.customization.poseSlot : state.poseSlot,
      faceAppearance: appearance
    }
  }
  const sourceKey = JSON.stringify([
    character.id, character.updatedAt, characterCopy.customization.modelSlot ?? 1,
    characterCopy.customization.poseSlot, modelRevision ?? null, poseRevision ?? null,
    wardrobeRevision ?? null, hairRevision ?? null, headExtraRevision ?? null, eyeRevision ?? null
  ])
  // Legacy face sets bake state into one image, so their complete appearance is part of renderer identity.
  const rendererKey = JSON.stringify([sourceKey, appearance?.modelSlot ?? null, appearance?.setId ? appearance : null])

  return {
    character,
    targets,
    ...(poseRevision ? { poseRevision } : {}),
    modelRevision,
    ...(wardrobeRevision ? { wardrobeRevision } : {}),
    ...(hairRevision ? { hairRevision } : {}),
    ...(headExtraRevision ? { headExtraRevision } : {}),
    ...(eyeRevision ? { eyeRevision } : {}),
    sourceKey,
    rendererKey,
    characterCopy,
    appearance,
    expressionBase,
    faceTransforms,
    effects,
    faceMode,
    preset
  }
}
