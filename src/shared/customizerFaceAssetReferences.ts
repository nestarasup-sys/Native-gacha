import type { CustomizerCharacter, FaceComponentPartId } from './customizer'
import type { FaceAssetKind, FaceComponentKind, FaceDetailKind, FaceSheetKind } from './fabricator'

export type CustomizerFaceAssetReference =
  | { assetType: 'face-set'; modelSlot: number; id: string }
  | { assetType: 'face-catalog'; modelSlot: number; id: string; category: FaceSheetKind }
  | { assetType: 'face-component'; modelSlot: number; id: string; kind: FaceAssetKind }

const catalogFields: ReadonlyArray<[keyof NonNullable<CustomizerCharacter['customization']['faceAppearance']>, FaceSheetKind]> = [
  ['eyeCatalogId', 'eyes'], ['eyeLeftCatalogId', 'eyes'], ['eyeRightCatalogId', 'eyes'],
  ['eyebrowCatalogId', 'eyebrows'], ['eyebrowLeftCatalogId', 'eyebrows'], ['eyebrowRightCatalogId', 'eyebrows'],
  ['noseCatalogId', 'nose'], ['mouthClosedCatalogId', 'mouth-closed'], ['mouthOpenCatalogId', 'mouth-open']
]

const componentKindByPart: Record<FaceComponentPartId, FaceComponentKind> = {
  'eye-left': 'eye', 'eye-right': 'eye',
  'pupil-left': 'pupil', 'pupil-right': 'pupil',
  'brow-left': 'eyebrow', 'brow-right': 'eyebrow'
}

function uniqueReferences(references: CustomizerFaceAssetReference[]): CustomizerFaceAssetReference[] {
  const unique = new Map<string, CustomizerFaceAssetReference>()
  for (const reference of references) {
    const discriminator = reference.assetType === 'face-catalog' ? reference.category
      : reference.assetType === 'face-component' ? reference.kind : ''
    unique.set(`${reference.modelSlot}:${reference.assetType}:${reference.id}:${discriminator}`, reference)
  }
  return [...unique.values()]
}

export function customizerFaceAssetReferenceKey(reference: CustomizerFaceAssetReference): string {
  const discriminator = reference.assetType === 'face-catalog' ? reference.category
    : reference.assetType === 'face-component' ? reference.kind : ''
  return `${reference.modelSlot}:${reference.assetType}:${reference.id}:${discriminator}`
}

/** IDs persisted in a character's face appearance, separated by Fabricator catalog type. */
export function collectCustomizerFaceAssetReferences(
  character: Pick<CustomizerCharacter, 'customization'>
): CustomizerFaceAssetReference[] {
  const appearance = character.customization.faceAppearance
  if (!appearance) return []
  const references: CustomizerFaceAssetReference[] = []

  for (const [field, category] of catalogFields) {
    const id = appearance[field]
    if (typeof id === 'string' && id) references.push({ assetType: 'face-catalog', modelSlot: appearance.modelSlot, id, category })
  }
  for (const part of Object.keys(componentKindByPart) as FaceComponentPartId[]) {
    const id = appearance.components?.[part]?.assetId
    if (id) references.push({ assetType: 'face-component', modelSlot: appearance.modelSlot, id, kind: componentKindByPart[part] })
  }
  for (const kind of ['eye-highlight-left', 'eye-highlight-right', 'blush', 'facial-shadow'] as FaceDetailKind[]) {
    const id = appearance.faceDetails?.[kind]
    if (id) references.push({ assetType: 'face-component', modelSlot: appearance.modelSlot, id, kind })
  }
  for (const id of Object.values(appearance.headExtras ?? {})) {
    if (id) references.push({ assetType: 'face-component', modelSlot: appearance.modelSlot, id, kind: 'head-extra' })
  }
  // Renderers use the legacy set only when no catalog sheet or eye/brow component
  // is selected. Keep stale setId values out of the reference graph after migration.
  const hasCatalogFaceSelection = references.some((reference) => reference.assetType === 'face-catalog'
    || reference.assetType === 'face-component'
      && (reference.kind === 'eye' || reference.kind === 'pupil' || reference.kind === 'eyebrow'))
  if (appearance.setId && !hasCatalogFaceSelection) {
    references.push({ assetType: 'face-set', modelSlot: appearance.modelSlot, id: appearance.setId })
  }
  return uniqueReferences(references)
}
