import type { CustomizerCharacter } from '../../../../shared/customizer'
import { editorV6CharacterSnapshotIsCurrent } from '../../../../shared/editorV6CharacterSource.ts'
import type { EditorV6Document, EditorV6Element } from '../../../../shared/editorV6'
import {
  editorV6CharacterEyeSourceRevision,
  editorV6CharacterHairSourceRevision,
  editorV6CharacterHeadExtraSourceRevision,
  editorV6CharacterWardrobeSourceRevision,
  editorV6PoseRevisionKey
} from './editorV6CharacterSourceRevisions.ts'
import type { PoseRevisionSnapshot } from './editorV6CharacterSourceRevisions.ts'

export * from './editorV6CharacterSourceRevisions.ts'

export function sameCustomizerCharacterCatalog(left: CustomizerCharacter[], right: CustomizerCharacter[]): boolean {
  return left.length === right.length && left.every((character, index) => {
    const candidate = right[index]
    if (!candidate) return false
    return candidate.id === character.id
      && candidate.updatedAt === character.updatedAt
      && candidate.name === character.name
      && (candidate.customization.modelSlot ?? 1) === (character.customization.modelSlot ?? 1)
      && JSON.stringify(candidate.customization) === JSON.stringify(character.customization)
  })
}

function editorV6CharacterStates(project: EditorV6Document | null): EditorV6Element[] {
  if (!project) return []
  return [
    ...project.elements,
    ...project.timeline.tracks.flatMap((track) => track.blocks.flatMap((block) => block.state ? [block.state] : []))
  ]
}

/** Resolves whether cached character artwork must be refreshed before playback or export. */
export function resolveEditorV6CharacterSourceRefresh({
  project, characterById, poseSourceSnapshot, faceRendererVersion
}: {
  project: EditorV6Document | null
  characterById: ReadonlyMap<string, CustomizerCharacter>
  poseSourceSnapshot: PoseRevisionSnapshot | null
  faceRendererVersion: number
}): {
  characterStates: EditorV6Element[]
  poseRefreshRequired: boolean
  wardrobeRefreshRequired: boolean
  hairRefreshRequired: boolean
  headExtraRefreshRequired: boolean
  eyeRefreshRequired: boolean
  faceAssetRefreshRequired: boolean
} {
  const characterStates = editorV6CharacterStates(project)
  const poseRefreshRequired = characterStates.some((state) => {
    if (state.kind !== 'character' || !state.characterId) return false
    const character = characterById.get(state.characterId)
    if (!character) return false
    const poseSlot = state.poseSlot === undefined ? character.customization.poseSlot : state.poseSlot
    if (!poseSourceSnapshot) return true
    const modelSlot = character.customization.modelSlot ?? 1
    const modelRevision = poseSourceSnapshot.modelRevisions?.[String(modelSlot)]
    const poseChanged = typeof poseSlot === 'number'
      && state.poseSourceRevision !== (poseSourceSnapshot.revisions[editorV6PoseRevisionKey(modelSlot, poseSlot)] ?? 'missing')
    return poseChanged
      || (modelRevision !== undefined && state.modelSourceRevision !== modelRevision)
  })
  const wardrobeRefreshRequired = characterStates.some((state) => {
    if (state.kind !== 'character' || !state.characterId) return false
    const character = characterById.get(state.characterId)
    if (!character) return false
    const currentRevision = editorV6CharacterWardrobeSourceRevision(character, poseSourceSnapshot?.wardrobeRevisions ?? {})
    return currentRevision !== undefined && state.wardrobeSourceRevision !== currentRevision
  })
  const hairRefreshRequired = characterStates.some((state) => {
    if (state.kind !== 'character' || !state.characterId) return false
    const character = characterById.get(state.characterId)
    if (!character) return false
    const currentRevision = editorV6CharacterHairSourceRevision(character, poseSourceSnapshot?.hairRevisions ?? {})
    return currentRevision !== undefined && state.hairSourceRevision !== currentRevision
  })
  const headExtraRefreshRequired = characterStates.some((state) => {
    if (state.kind !== 'character' || !state.characterId) return false
    const character = characterById.get(state.characterId)
    if (!character) return false
    const currentRevision = editorV6CharacterHeadExtraSourceRevision(character, poseSourceSnapshot?.headExtraRevisions ?? {})
    return currentRevision !== undefined && state.headExtraSourceRevision !== currentRevision
  })
  const eyeRefreshRequired = characterStates.some((state) => {
    if (state.kind !== 'character' || !state.characterId) return false
    const character = characterById.get(state.characterId)
    if (!character) return false
    const currentRevision = editorV6CharacterEyeSourceRevision(character, poseSourceSnapshot?.eyeRevisions ?? {})
    return currentRevision !== undefined && state.eyeSourceRevision !== currentRevision
  })
  const faceAssetRefreshRequired = Boolean(project && (poseRefreshRequired || characterStates.some((state) => {
    if (state.kind !== 'character') return false
    const character = characterById.get(state.characterId ?? '')
    return state.faceRendererVersion !== faceRendererVersion
      || Boolean(character && !editorV6CharacterSnapshotIsCurrent(state, character))
  }) || wardrobeRefreshRequired || hairRefreshRequired || headExtraRefreshRequired || eyeRefreshRequired))

  return { characterStates, poseRefreshRequired, wardrobeRefreshRequired, hairRefreshRequired, headExtraRefreshRequired, eyeRefreshRequired, faceAssetRefreshRequired }
}
