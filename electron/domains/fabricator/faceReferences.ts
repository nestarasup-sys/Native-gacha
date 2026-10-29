import type { CustomizerCharacter } from '../../../src/shared/customizer'
import type {
  FaceComponentAssetSummary, FaceComponentKind,
  FaceExpressionPreset, FaceExpressionSelections, FaceExpressionWorkspaceDraft, FaceSheetKind
} from '../../../src/shared/fabricator'
import type { CustomizerFaceAssetReference } from '../../../src/shared/customizerFaceAssetReferences'
import { customizerFaceAssetReferenceKey, collectCustomizerFaceAssetReferences } from '../../../src/shared/customizerFaceAssetReferences.ts'

export type FaceExpressionAssetReference = Extract<CustomizerFaceAssetReference, { assetType: 'face-catalog' | 'face-component' }>

export type FaceReferenceSnapshot = {
  characters: readonly Pick<CustomizerCharacter, 'name' | 'customization'>[]
  expressionPresets: readonly FaceExpressionPreset[]
  expressionDraft: FaceExpressionWorkspaceDraft | null
  faceComponents: readonly FaceComponentAssetSummary[]
}

const faceSheetKinds: readonly FaceSheetKind[] = ['eyes', 'eyebrows', 'nose', 'mouth-closed', 'mouth-open']
const componentKindByExpressionPart = {
  eyes: 'eye', pupils: 'pupil', eyebrows: 'eyebrow'
} as const satisfies Record<'eyes' | 'pupils' | 'eyebrows', FaceComponentKind>

function uniqueReferences<T extends CustomizerFaceAssetReference>(references: T[]): T[] {
  const unique = new Map<string, T>()
  for (const reference of references) unique.set(customizerFaceAssetReferenceKey(reference), reference)
  return [...unique.values()]
}

function expressionSelectionReferences(modelSlot: number, value: unknown): FaceExpressionAssetReference[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const selections = value as Partial<FaceExpressionSelections>
  const references: FaceExpressionAssetReference[] = []
  for (const part of ['eyes', 'pupils', 'eyebrows'] as const) {
    const sides = selections[part]
    if (!sides || typeof sides !== 'object' || Array.isArray(sides)) continue
    for (const id of Object.values(sides)) {
      if (typeof id === 'string' && id) references.push({ assetType: 'face-component', modelSlot, id, kind: componentKindByExpressionPart[part] })
    }
  }
  const nose = selections.nose
  if (nose && typeof nose === 'object' && typeof nose.catalogId === 'string' && nose.catalogId) {
    references.push({ assetType: 'face-catalog', modelSlot, id: nose.catalogId, category: 'nose' })
  }
  const mouth = selections.mouth
  if (mouth && typeof mouth === 'object' && typeof mouth.catalogId === 'string' && mouth.catalogId
    && (mouth.kind === 'mouth-closed' || mouth.kind === 'mouth-open')) {
    references.push({ assetType: 'face-catalog', modelSlot, id: mouth.catalogId, category: mouth.kind })
  }
  return uniqueReferences(references)
}

export function collectFaceExpressionPresetReferences(presets: readonly FaceExpressionPreset[]): FaceExpressionAssetReference[] {
  return uniqueReferences(presets.flatMap((preset) => preset && Number.isInteger(preset.modelSlot)
    ? expressionSelectionReferences(preset.modelSlot, preset.selections)
    : []))
}

export function collectFaceExpressionDraftReferences(draft: FaceExpressionWorkspaceDraft | null): FaceExpressionAssetReference[] {
  if (!draft || !Number.isInteger(draft.modelSlot)) return []
  const entries = [draft.current, ...Object.values(draft.workingCopies ?? {})]
  return uniqueReferences(entries.flatMap((entry) => entry
    ? expressionSelectionReferences(draft.modelSlot, entry.selections)
    : []))
}

export function addedFaceExpressionReferences(
  next: readonly FaceExpressionAssetReference[],
  previous: readonly FaceExpressionAssetReference[]
): FaceExpressionAssetReference[] {
  const previousKeys = new Set(previous.map(customizerFaceAssetReferenceKey))
  return uniqueReferences(next.filter((reference) => !previousKeys.has(customizerFaceAssetReferenceKey(reference))))
}

export function addedFaceExpressionPresetReferences(
  next: readonly FaceExpressionPreset[],
  previous: readonly (FaceExpressionPreset | null)[]
): FaceExpressionAssetReference[] {
  const previousById = new Map<string, FaceExpressionPreset>()
  for (const preset of previous) {
    if (preset && Number.isInteger(preset.modelSlot) && preset.id) {
      previousById.set(`${preset.modelSlot}:${preset.id}`, preset)
    }
  }
  return uniqueReferences(next.flatMap((preset) => {
    if (!preset) return []
    const nextReferences = collectFaceExpressionPresetReferences([preset])
    const existing = previousById.get(`${preset.modelSlot}:${preset.id}`)
    const previousReferences = existing ? collectFaceExpressionPresetReferences([existing]) : []
    return addedFaceExpressionReferences(nextReferences, previousReferences)
  }))
}

/** Compare drafts by their stable expression IDs so unrelated edits preserve old broken references. */
export function addedFaceExpressionDraftReferences(
  next: FaceExpressionWorkspaceDraft,
  previous: FaceExpressionWorkspaceDraft | null
): FaceExpressionAssetReference[] {
  const previousById = new Map<string, FaceExpressionAssetReference[]>()
  if (previous) {
    for (const entry of [previous.current, ...Object.values(previous.workingCopies ?? {})]) {
      if (entry) previousById.set(entry.id, expressionSelectionReferences(previous.modelSlot, entry.selections))
    }
  }
  const added = [next.current, ...Object.values(next.workingCopies ?? {})].flatMap((entry) => {
    if (!entry) return []
    return addedFaceExpressionReferences(
      expressionSelectionReferences(next.modelSlot, entry.selections),
      previousById.get(entry.id) ?? []
    )
  })
  return uniqueReferences(added)
}

function referencesForCharacter(snapshot: FaceReferenceSnapshot, predicate: (reference: CustomizerFaceAssetReference) => boolean): string[] {
  return snapshot.characters.filter((character) => collectCustomizerFaceAssetReferences(character).some(predicate))
    .map((character) => `personagem “${character.name}”`)
}

function referencesForExpressions(snapshot: FaceReferenceSnapshot, predicate: (reference: FaceExpressionAssetReference) => boolean): string[] {
  const owners = snapshot.expressionPresets.filter((preset) => collectFaceExpressionPresetReferences([preset]).some(predicate))
    .map((preset) => `preset “${preset.name}”`)
  return snapshot.expressionDraft && collectFaceExpressionDraftReferences(snapshot.expressionDraft).some(predicate)
    ? [...owners, 'rascunho de Expressões DEV']
    : owners
}

function throwWhenReferenced(label: string, owners: readonly string[]): void {
  if (!owners.length) return
  throw new Error(`Não é possível excluir ${label}: está sendo usado por ${owners.slice(0, 5).join(', ')}. Remova ou substitua o vínculo primeiro.`)
}

export function assertFaceSetHasNoReferences(snapshot: FaceReferenceSnapshot, modelSlot: number, setId: string): void {
  const aliases = new Set(faceSheetKinds.map((category) => `legacy_${setId}_${category}`))
  const isReference = (reference: CustomizerFaceAssetReference) => reference.modelSlot === modelSlot
    && (reference.assetType === 'face-set' && reference.id === setId
      || reference.assetType === 'face-catalog' && aliases.has(reference.id))
  const owners = [
    ...referencesForCharacter(snapshot, isReference),
    ...referencesForExpressions(snapshot, (reference) => isReference(reference))
  ]
  throwWhenReferenced('este conjunto facial', owners)
}

export function assertFaceCatalogItemHasNoReferences(snapshot: FaceReferenceSnapshot, modelSlot: number, id: string): void {
  const isReference = (reference: CustomizerFaceAssetReference) => reference.assetType === 'face-catalog'
    && reference.modelSlot === modelSlot && reference.id === id
  throwWhenReferenced('esta peça facial', [
    ...referencesForCharacter(snapshot, isReference),
    ...referencesForExpressions(snapshot, isReference)
  ])
}

export function assertFaceComponentHasNoReferences(
  snapshot: FaceReferenceSnapshot,
  modelSlot: number,
  id: string,
  assetName: string
): void {
  const isReference = (reference: CustomizerFaceAssetReference) => reference.assetType === 'face-component'
    && reference.modelSlot === modelSlot && reference.id === id
  const owners = [
    ...referencesForCharacter(snapshot, isReference),
    ...referencesForExpressions(snapshot, isReference),
    ...snapshot.faceComponents.filter((asset) => asset.id !== id && asset.pairId === id)
      .map((asset) => `asset facial “${asset.name}” pareado com “${assetName}”`)
  ]
  throwWhenReferenced(`o asset facial “${assetName}”`, owners)
}
