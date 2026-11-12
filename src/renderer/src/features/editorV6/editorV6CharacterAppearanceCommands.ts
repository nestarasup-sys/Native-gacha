import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6Element, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import { faceRenderGeometry } from '../../characters/characterGeometry'
import {
  editorV6CharacterEyeSourceRevision,
  editorV6CharacterHairSourceRevision,
  editorV6CharacterHeadExtraSourceRevision,
  editorV6CharacterWardrobeSourceRevision,
  editorV6PoseRevisionKey,
  type PoseRevisionSnapshot
} from './editorV6CharacterSourceRevisions'
import { EDITOR_V6_FACE_RENDER_VERSION } from './faceModeAssets'
import type { PreparedEditorV6FaceRenderer } from './faceModeAssets'
import type { EditorV6FaceAppearanceExpressionState, PreparedEditorV6FaceAppearance, prepareEditorV6FaceAppearance } from './editorV6FaceAppearancePreparation'
import type { PreparedEditorV6PoseChange, prepareEditorV6PoseChange } from './editorV6PosePreparation'

type FaceRendererAccess = {
  withRenderer<T>(
    character: CustomizerCharacter,
    poseSourceRevision: string | undefined,
    modelSourceRevision: string | undefined,
    operation: (renderer: PreparedEditorV6FaceRenderer) => Promise<T>
  ): Promise<T | null>
}

type Dependencies = {
  activeProject: EditorV6Document | null
  selectedElement: EditorV6Element | null
  selectedCharacter: CustomizerCharacter | null
  faceBusy: boolean
  setFaceBusy: (busy: boolean) => void
  facePreview: FaceRendererAccess
  sceneRef: { current: HTMLDivElement | null }
  poseSourceSnapshot: PoseRevisionSnapshot | null
  prepareFaceAppearance: (
    input: Parameters<typeof prepareEditorV6FaceAppearance>[0],
    renderer: PreparedEditorV6FaceRenderer
  ) => Promise<PreparedEditorV6FaceAppearance>
  preparePoseChange: (input: Parameters<typeof prepareEditorV6PoseChange>[0]) => Promise<PreparedEditorV6PoseChange>
  changeScene: (update: (project: EditorV6Document) => EditorV6Document) => void
  patchDocument: (update: (project: EditorV6Document) => EditorV6Document) => void
  setError: (message: string | null) => void
  now?: () => string
}

/** Coordinates face/pose preparation with the project snapshot and its source revisions. */
export function createEditorV6CharacterAppearanceCommands(dependencies: Dependencies) {
  const now = dependencies.now ?? (() => new Date().toISOString())

  const applyFaceAppearance = async (
    appearance: CustomizerFaceAppearance,
    faceTransforms: EditorV6FaceTransforms = dependencies.selectedElement?.faceTransforms ?? {},
    record = true,
    expressionState?: EditorV6FaceAppearanceExpressionState
  ) => {
    const project = dependencies.activeProject
    const element = dependencies.selectedElement
    const character = dependencies.selectedCharacter
    if (!project || element?.kind !== 'character' || !character || !element.assetId || dependencies.faceBusy) return

    dependencies.setFaceBusy(true)
    try {
      const characterCopy: CustomizerCharacter = {
        ...character,
        customization: { ...character.customization, poseSlot: element.poseSlot === undefined ? character.customization.poseSlot : element.poseSlot, faceAppearance: appearance }
      }
      const assetId = element.assetId
      const prepared = await dependencies.facePreview.withRenderer(characterCopy, element.poseSourceRevision, element.modelSourceRevision, (renderer) =>
        dependencies.prepareFaceAppearance({ character, element, appearance, faceTransforms, expressionState }, renderer)
      )
      if (!prepared) return

      const { baseMode, rendered, baked, previousCrop } = prepared
      const faceModeAssetIds = { ...baked.assetIds, [baseMode]: assetId }
      const elementId = element.id
      const update = (current: EditorV6Document): EditorV6Document => ({
        ...current,
        elements: current.elements.map((candidate) => candidate.id === elementId ? {
          ...candidate,
          ...expressionState,
          faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION,
          faceModeAssetIds,
          ...faceRenderGeometry(candidate, rendered, baked.crop, dependencies.sceneRef.current?.clientWidth ?? 1000, dependencies.sceneRef.current?.clientHeight ?? 562, previousCrop),
          faceAppearance: appearance,
          faceTransforms,
          characterSourceUpdatedAt: character.updatedAt
        } : candidate),
        assets: [...current.assets.map((asset) => asset.id === assetId ? { ...asset, dataUrl: baked.dataUrl, mimeType: 'image/png' as const } : asset), ...baked.extraAssets],
        updatedAt: now()
      })
      if (record) dependencies.changeScene(update)
      else dependencies.patchDocument(update)
      dependencies.setError(null)
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar a peça facial neste projeto.')
    } finally {
      dependencies.setFaceBusy(false)
    }
  }

  const applyPose = async (poseSlot: number | null) => {
    const project = dependencies.activeProject
    const element = dependencies.selectedElement
    const character = dependencies.selectedCharacter
    if (!project || element?.kind !== 'character' || !character || !element.assetId || dependencies.faceBusy) return

    dependencies.setFaceBusy(true)
    try {
      const { baseMode, baked, geometry } = await dependencies.preparePoseChange({ character, element, poseSlot })
      const elementId = element.id
      const assetId = element.assetId
      const revisions = dependencies.poseSourceSnapshot
      const modelSlot = character.customization.modelSlot ?? 1
      const wardrobeSourceRevision = editorV6CharacterWardrobeSourceRevision(character, revisions?.wardrobeRevisions ?? {})
      const hairSourceRevision = editorV6CharacterHairSourceRevision(character, revisions?.hairRevisions ?? {})
      const headExtraSourceRevision = editorV6CharacterHeadExtraSourceRevision(character, revisions?.headExtraRevisions ?? {})
      const eyeSourceRevision = editorV6CharacterEyeSourceRevision(character, revisions?.eyeRevisions ?? {})

      dependencies.changeScene((current) => ({
        ...current,
        elements: current.elements.map((candidate) => candidate.id === elementId ? {
          ...candidate,
          poseSlot,
          ...geometry,
          ...(typeof poseSlot === 'number' ? { poseSourceRevision: revisions?.revisions[editorV6PoseRevisionKey(modelSlot, poseSlot)] ?? 'missing' } : { poseSourceRevision: undefined }),
          faceModeAssetIds: { ...baked.assetIds, [baseMode]: assetId },
          characterSourceUpdatedAt: character.updatedAt,
          wardrobeSourceRevision,
          hairSourceRevision,
          headExtraSourceRevision,
          eyeSourceRevision
        } : candidate),
        assets: [...current.assets.map((asset) => asset.id === assetId ? { ...asset, dataUrl: baked.dataUrl, mimeType: 'image/png' as const } : asset), ...baked.extraAssets],
        updatedAt: now()
      }))
      dependencies.setError(null)
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar a pose neste projeto.')
    } finally {
      dependencies.setFaceBusy(false)
    }
  }

  return { applyFaceAppearance, applyPose }
}
