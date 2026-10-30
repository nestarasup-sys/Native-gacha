import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6Element } from '../../../../shared/editorV6'

export type PoseRevisionSnapshot = { projectId: string; revisions: Record<string, string>; modelRevisions: Record<string, string> }
export type PoseCatalog = { modelSlot: number; poses: Array<{ slot?: number; updatedAt: string } | null> }
export type ModelCatalog = Array<{ slot: number; updatedAt: string } | null>

export const editorV6PoseRevisionKey = (modelSlot: number, poseSlot: number) => `${modelSlot}:${poseSlot}`

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

export function samePoseRevisionSnapshot(left: Record<string, string>, right: Record<string, string>): boolean {
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key])
}

export function createEditorV6ModelRevisionSnapshot(models: ModelCatalog): Record<string, string> {
  return Object.fromEntries(models.flatMap((model) => model ? [[String(model.slot), model.updatedAt]] : []))
}

export function sameSourceRevisionSnapshot(left: PoseRevisionSnapshot, right: PoseRevisionSnapshot): boolean {
  return samePoseRevisionSnapshot(left.revisions, right.revisions)
    && samePoseRevisionSnapshot(left.modelRevisions, right.modelRevisions)
}

export function createEditorV6PoseRevisionSnapshot(catalogs: PoseCatalog[]): Record<string, string> {
  const revisions: Record<string, string> = {}
  for (const { modelSlot, poses } of catalogs) {
    poses.forEach((pose, index) => {
      const slot = pose?.slot ?? index + 1
      revisions[editorV6PoseRevisionKey(modelSlot, slot)] = pose?.updatedAt ?? 'missing'
    })
  }
  return revisions
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
  const faceAssetRefreshRequired = Boolean(project && (poseRefreshRequired || characterStates.some((state) => {
    if (state.kind !== 'character') return false
    const character = characterById.get(state.characterId ?? '')
    return state.faceRendererVersion !== faceRendererVersion
      || Boolean(character && state.characterSourceUpdatedAt !== character.updatedAt)
  })))

  return { characterStates, poseRefreshRequired, faceAssetRefreshRequired }
}
