import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Asset, EditorV6Element, EditorV6FaceRenderMode, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { FaceExpressionEffects, FaceExpressionPreset } from '../../../../shared/fabricator'

export type EditorV6CharacterRefreshTarget = { kind: 'element' | 'block'; id: string; state: EditorV6Element }
export type EditorV6CharacterRefreshGroup = {
  character: CustomizerCharacter
  state: EditorV6Element
  targets: EditorV6CharacterRefreshTarget[]
  poseRevision?: string
  modelRevision: string
  wardrobeRevision?: string
  hairRevision?: string
  headExtraRevision?: string
  eyeRevision?: string
}
export type EditorV6CharacterRefreshPlan = {
  groups: EditorV6CharacterRefreshGroup[]
  missingCharacterNames: string[]
}
export type EditorV6CharacterRefreshRenderJob = Omit<EditorV6CharacterRefreshGroup, 'state'> & {
  sourceKey: string
  rendererKey: string
  characterCopy: CustomizerCharacter
  appearance: CustomizerFaceAppearance | undefined
  expressionBase: EditorV6Element['expressionBase'] | undefined
  faceTransforms: EditorV6FaceTransforms | undefined
  effects: FaceExpressionEffects | undefined
  faceMode: EditorV6FaceRenderMode
  preset: FaceExpressionPreset | null
}
export type EditorV6CharacterRefreshResult = {
  nextElements: Map<string, EditorV6Element>
  nextBlocks: Map<string, EditorV6Element>
  /** Captured input states prevent a delayed bake from overwriting newer edits. */
  expectedElementStates?: Map<string, string>
  expectedBlockStates?: Map<string, string>
  refreshedAssets: EditorV6Asset[]
  staleAssetIds: Set<string>
}
