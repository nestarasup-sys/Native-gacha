import type { CustomizerCharacter } from '../../../../shared/customizer'
import { collectCustomizerFaceAssetReferences } from '../../../../shared/customizerFaceAssetReferences.ts'
import { collectCustomizerHairStyleReferences } from '../../../../shared/hairCategories.ts'
import type { FaceAssetKind, FaceComponentAssetSummary, FaceComponentKind, HairStyleSummary, WardrobeSetSummary } from '../../../../shared/fabricator'

export type PoseRevisionSnapshot = { projectId: string; revisions: Record<string, string>; modelRevisions: Record<string, string>; wardrobeRevisions?: Record<string, string>; hairRevisions?: Record<string, string>; headExtraRevisions?: Record<string, string>; eyeRevisions?: Record<string, string> }
export type PoseCatalog = { modelSlot: number; poses: Array<{ slot?: number; updatedAt: string } | null> }
export type ModelCatalog = Array<{ slot: number; updatedAt: string } | null>
export type WardrobeCatalog = { modelSlot: number; sets: Array<Pick<WardrobeSetSummary, 'id' | 'updatedAt'>> }
export type HairCatalog = { modelSlot: number; styles: Array<Pick<HairStyleSummary, 'id' | 'updatedAt'>> }
export type HeadExtraCatalog = { modelSlot: number; assets: Array<Pick<FaceComponentAssetSummary, 'id' | 'updatedAt'>> }
export type EyeCatalog = { modelSlot: number; kind: FaceComponentKind; assets: Array<Pick<FaceComponentAssetSummary, 'id' | 'updatedAt'>> }

export const editorV6EyeAssetKinds: readonly FaceComponentKind[] = ['eye', 'pupil', 'eye-closed', 'eyebrow']

export const editorV6PoseRevisionKey = (modelSlot: number, poseSlot: number) => `${modelSlot}:${poseSlot}`
export const editorV6WardrobeRevisionKey = (modelSlot: number, setId: string) => `${modelSlot}:${setId}`
export const editorV6HairRevisionKey = (modelSlot: number, styleId: string) => `${modelSlot}:${styleId}`
export const editorV6HeadExtraRevisionKey = (modelSlot: number, assetId: string) => `${modelSlot}:${assetId}`
export const editorV6EyeRevisionKey = (modelSlot: number, kind: FaceAssetKind, assetId: string) => `${modelSlot}:${kind}:${assetId}`

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

export function createEditorV6EyeRevisionSnapshot(catalogs: EyeCatalog[]): Record<string, string> {
  return Object.fromEntries(catalogs.flatMap(({ modelSlot, kind, assets }) => assets.map((asset) => [editorV6EyeRevisionKey(modelSlot, kind, asset.id), asset.updatedAt])))
}

function sourceRevision(kind: 'wardrobe' | 'hair' | 'head-extra' | 'eyes', references: Array<[string, string]>): string | undefined {
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

/** Fingerprints the eye DEV pieces selected by this character and its automatic closed-eye variants. */
export function editorV6CharacterEyeSourceRevision(character: CustomizerCharacter, revisions: Record<string, string>): string | undefined {
  const selectedEyes = collectCustomizerFaceAssetReferences(character).flatMap((reference) =>
    reference.assetType === 'face-component' && (reference.kind === 'eye' || reference.kind === 'pupil' || reference.kind === 'eyebrow')
      ? [reference]
      : []
  )
  if (!selectedEyes.length) return undefined

  const references = selectedEyes.map((reference) => {
    const key = editorV6EyeRevisionKey(reference.modelSlot, reference.kind, reference.id)
    return [key, revisions[key] ?? 'missing'] as [string, string]
  })
  const openEyeModelSlots = new Set(selectedEyes.filter((reference) => reference.kind === 'eye').map((reference) => reference.modelSlot))
  for (const modelSlot of openEyeModelSlots) {
    const prefix = `${modelSlot}:eye-closed:`
    for (const [key, updatedAt] of Object.entries(revisions)) {
      if (key.startsWith(prefix)) references.push([key, updatedAt])
    }
  }
  return sourceRevision('eyes', references)
}

export function sameSourceRevisionSnapshot(left: PoseRevisionSnapshot, right: PoseRevisionSnapshot): boolean {
  return samePoseRevisionSnapshot(left.revisions, right.revisions)
    && samePoseRevisionSnapshot(left.modelRevisions, right.modelRevisions)
    && samePoseRevisionSnapshot(left.wardrobeRevisions ?? {}, right.wardrobeRevisions ?? {})
    && samePoseRevisionSnapshot(left.hairRevisions ?? {}, right.hairRevisions ?? {})
    && samePoseRevisionSnapshot(left.headExtraRevisions ?? {}, right.headExtraRevisions ?? {})
    && samePoseRevisionSnapshot(left.eyeRevisions ?? {}, right.eyeRevisions ?? {})
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
