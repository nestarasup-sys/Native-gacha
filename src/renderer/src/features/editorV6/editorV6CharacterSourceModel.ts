import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6Element } from '../../../../shared/editorV6'
import { collectCustomizerHairStyleReferences } from '../../../../shared/hairCategories.ts'
import type { FaceComponentAssetSummary, HairStyleSummary, WardrobeSetSummary } from '../../../../shared/fabricator'

export type PoseRevisionSnapshot = { projectId: string; revisions: Record<string, string>; modelRevisions: Record<string, string>; wardrobeRevisions?: Record<string, string>; hairRevisions?: Record<string, string>; headExtraRevisions?: Record<string, string> }
export type PoseCatalog = { modelSlot: number; poses: Array<{ slot?: number; updatedAt: string } | null> }
export type ModelCatalog = Array<{ slot: number; updatedAt: string } | null>
export type WardrobeCatalog = { modelSlot: number; sets: Array<Pick<WardrobeSetSummary, 'id' | 'updatedAt'>> }
export type HairCatalog = { modelSlot: number; styles: Array<Pick<HairStyleSummary, 'id' | 'updatedAt'>> }
export type HeadExtraCatalog = { modelSlot: number; assets: Array<Pick<FaceComponentAssetSummary, 'id' | 'updatedAt'>> }

export const editorV6PoseRevisionKey = (modelSlot: number, poseSlot: number) => `${modelSlot}:${poseSlot}`
export const editorV6WardrobeRevisionKey = (modelSlot: number, setId: string) => `${modelSlot}:${setId}`
export const editorV6HairRevisionKey = (modelSlot: number, styleId: string) => `${modelSlot}:${styleId}`
export const editorV6HeadExtraRevisionKey = (modelSlot: number, assetId: string) => `${modelSlot}:${assetId}`

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

export function createEditorV6WardrobeRevisionSnapshot(catalogs: WardrobeCatalog[]): Record<string, string> {
  return Object.fromEntries(catalogs.flatMap(({ modelSlot, sets }) => sets.map((set) => [editorV6WardrobeRevisionKey(modelSlot, set.id), set.updatedAt])))
}

export function createEditorV6HairRevisionSnapshot(catalogs: HairCatalog[]): Record<string, string> {
  return Object.fromEntries(catalogs.flatMap(({ modelSlot, styles }) => styles.map((style) => [editorV6HairRevisionKey(modelSlot, style.id), style.updatedAt])))
}

export function createEditorV6HeadExtraRevisionSnapshot(catalogs: HeadExtraCatalog[]): Record<string, string> {
  return Object.fromEntries(catalogs.flatMap(({ modelSlot, assets }) => assets.map((asset) => [editorV6HeadExtraRevisionKey(modelSlot, asset.id), asset.updatedAt])))
}

function sourceRevision(kind: 'wardrobe' | 'hair' | 'head-extra', references: Array<[string, string]>): string | undefined {
  const normalized = [...new Map(references).entries()].sort(([left], [right]) => left.localeCompare(right))
  if (!normalized.length) return undefined
  const source = JSON.stringify(normalized)
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${kind}-v1:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

/** Fingerprints only the wardrobe sets referenced by this character. */
export function editorV6CharacterWardrobeSourceRevision(character: CustomizerCharacter, revisions: Record<string, string>): string | undefined {
  const references = (character.customization.wardrobeGroups ?? []).map((group) => {
    const key = editorV6WardrobeRevisionKey(group.modelSlot, group.setId)
    return [key, revisions[key] ?? 'missing'] as [string, string]
  })
  return sourceRevision('wardrobe', references)
}

/** Fingerprints the hair styles actually selected by this character, including legacy aliases. */
export function editorV6CharacterHairSourceRevision(character: CustomizerCharacter, revisions: Record<string, string>): string | undefined {
  const references = collectCustomizerHairStyleReferences(character).map(({ modelSlot, id }) => {
    const key = editorV6HairRevisionKey(modelSlot, id)
    return [key, revisions[key] ?? 'missing'] as [string, string]
  })
  return sourceRevision('hair', references)
}

/** Fingerprints only the head extras selected from Cabeças extra DEV for this character. */
export function editorV6CharacterHeadExtraSourceRevision(character: CustomizerCharacter, revisions: Record<string, string>): string | undefined {
  const appearance = character.customization.faceAppearance
  if (!appearance) return undefined
  const references = Object.values(appearance.headExtras ?? {}).flatMap((id) => {
    if (!id) return []
    const key = editorV6HeadExtraRevisionKey(appearance.modelSlot, id)
    return [[key, revisions[key] ?? 'missing'] as [string, string]]
  })
  return sourceRevision('head-extra', references)
}

export function sameSourceRevisionSnapshot(left: PoseRevisionSnapshot, right: PoseRevisionSnapshot): boolean {
  return samePoseRevisionSnapshot(left.revisions, right.revisions)
    && samePoseRevisionSnapshot(left.modelRevisions, right.modelRevisions)
    && samePoseRevisionSnapshot(left.wardrobeRevisions ?? {}, right.wardrobeRevisions ?? {})
    && samePoseRevisionSnapshot(left.hairRevisions ?? {}, right.hairRevisions ?? {})
    && samePoseRevisionSnapshot(left.headExtraRevisions ?? {}, right.headExtraRevisions ?? {})
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
  wardrobeRefreshRequired: boolean
  hairRefreshRequired: boolean
  headExtraRefreshRequired: boolean
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
  const faceAssetRefreshRequired = Boolean(project && (poseRefreshRequired || characterStates.some((state) => {
    if (state.kind !== 'character') return false
    const character = characterById.get(state.characterId ?? '')
    return state.faceRendererVersion !== faceRendererVersion
      || Boolean(character && state.characterSourceUpdatedAt !== character.updatedAt)
  }) || wardrobeRefreshRequired || hairRefreshRequired || headExtraRefreshRequired))

  return { characterStates, poseRefreshRequired, wardrobeRefreshRequired, hairRefreshRequired, headExtraRefreshRequired, faceAssetRefreshRequired }
}
