import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Asset, EditorV6Element } from '../../../../shared/editorV6'

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
export type EditorV6CharacterRefreshResult = {
  nextElements: Map<string, EditorV6Element>
  nextBlocks: Map<string, EditorV6Element>
  /** Captured input states prevent a delayed bake from overwriting newer edits. */
  expectedElementStates?: Map<string, string>
  expectedBlockStates?: Map<string, string>
  refreshedAssets: EditorV6Asset[]
  staleAssetIds: Set<string>
}
