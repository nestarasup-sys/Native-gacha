import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6Element } from '../../../../shared/editorV6'
import { editorV6CharacterSnapshotIsCurrent } from '../../../../shared/editorV6CharacterSource.ts'
import { editorV6CharacterEyeSourceRevision, editorV6CharacterHairSourceRevision, editorV6CharacterHeadExtraSourceRevision, editorV6CharacterWardrobeSourceRevision } from './editorV6CharacterSourceRevisions.ts'
import { EDITOR_V6_FACE_RENDER_VERSION } from './faceModeAssets.ts'
import type { EditorV6CharacterRefreshGroup, EditorV6CharacterRefreshPlan, EditorV6CharacterRefreshTarget } from './editorV6CharacterRefreshTypes'

export type { EditorV6CharacterRefreshGroup, EditorV6CharacterRefreshPlan, EditorV6CharacterRefreshTarget } from './editorV6CharacterRefreshTypes'

const poseRevisionKey = (modelSlot: number, poseSlot: number) => `${modelSlot}:${poseSlot}`

/** Collect only the character snapshots that no longer match their sources. */
export function planEditorV6CharacterRefresh(
  project: EditorV6Document,
  availableCharacters: CustomizerCharacter[],
  poseRevisions: Record<string, string>,
  modelRevisions: Record<string, string> = {},
  wardrobeRevisions: Record<string, string> = {},
  hairRevisions: Record<string, string> = {},
  headExtraRevisions: Record<string, string> = {},
  eyeRevisions: Record<string, string> = {}
): EditorV6CharacterRefreshPlan {
  const characters = new Map(availableCharacters.map((character) => [character.id, character]))
  const groups = new Map<string, EditorV6CharacterRefreshGroup>()
  const missingCharacterNames = new Set<string>()
  const addTarget = (kind: EditorV6CharacterRefreshTarget['kind'], id: string, state: EditorV6Element) => {
    if (state.kind !== 'character' || !state.characterId || !state.assetId) return
    const character = characters.get(state.characterId)
    if (!character) {
      if (state.faceRendererVersion !== EDITOR_V6_FACE_RENDER_VERSION) missingCharacterNames.add(state.text)
      return
    }
    const poseSlot = state.poseSlot === undefined ? character.customization.poseSlot : state.poseSlot
    const modelSlot = character.customization.modelSlot ?? 1
    const poseRevision = typeof poseSlot === 'number'
      ? poseRevisions[poseRevisionKey(modelSlot, poseSlot)] ?? 'missing'
      : undefined
    const poseChanged = typeof poseSlot === 'number' && state.poseSourceRevision !== poseRevision
    const modelRevision = modelRevisions[String(modelSlot)]
    const modelChanged = modelRevision !== undefined && state.modelSourceRevision !== modelRevision
    const wardrobeRevision = editorV6CharacterWardrobeSourceRevision(character, wardrobeRevisions)
    const wardrobeChanged = wardrobeRevision !== undefined && state.wardrobeSourceRevision !== wardrobeRevision
    const hairRevision = editorV6CharacterHairSourceRevision(character, hairRevisions)
    const hairChanged = hairRevision !== undefined && state.hairSourceRevision !== hairRevision
    const headExtraRevision = editorV6CharacterHeadExtraSourceRevision(character, headExtraRevisions)
    const headExtraChanged = headExtraRevision !== undefined && state.headExtraSourceRevision !== headExtraRevision
    const eyeRevision = editorV6CharacterEyeSourceRevision(character, eyeRevisions)
    const eyeChanged = eyeRevision !== undefined && state.eyeSourceRevision !== eyeRevision
    if (!poseChanged && !modelChanged && !wardrobeChanged && !hairChanged && !headExtraChanged && !eyeChanged && state.faceRendererVersion === EDITOR_V6_FACE_RENDER_VERSION && editorV6CharacterSnapshotIsCurrent(state, character)) return
    const signature = JSON.stringify([character.id, character.updatedAt, EDITOR_V6_FACE_RENDER_VERSION, poseRevision, poseSlot,
      state.faceAppearance, state.expressionBase, state.faceTransforms, state.activeFaceMode, state.activeExpressionPresetId,
      state.activeExpressionPresetUpdatedAt, state.activeExpressionGaze, state.activeExpressionEffects, modelRevision ?? state.modelSourceRevision ?? null, wardrobeRevision ?? null, hairRevision ?? null, headExtraRevision ?? null, eyeRevision ?? null])
    const group = groups.get(signature) ?? { character, state, targets: [], ...(poseRevision ? { poseRevision } : {}), modelRevision: modelRevision ?? state.modelSourceRevision ?? 'missing', ...(wardrobeRevision ? { wardrobeRevision } : {}), ...(hairRevision ? { hairRevision } : {}), ...(headExtraRevision ? { headExtraRevision } : {}), ...(eyeRevision ? { eyeRevision } : {}) }
    group.targets.push({ kind, id, state })
    groups.set(signature, group)
  }
  for (const element of project.elements) addTarget('element', element.id, element)
  for (const track of project.timeline.tracks) {
    for (const block of track.blocks) if (block.state && block.elementId) addTarget('block', block.id, block.state)
  }
  return { groups: [...groups.values()], missingCharacterNames: [...missingCharacterNames] }
}
