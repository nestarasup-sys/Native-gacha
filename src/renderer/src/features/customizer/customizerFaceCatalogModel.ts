import type { FaceCatalogItem, FaceCatalogItemSummary, FaceComponentAsset, FaceComponentAssetSummary, FaceComponentKind, FaceSheetKind } from '../../../../shared/fabricator'
import type { CustomizerFaceAppearance, FaceComponentPartId, HairColorRole } from '../../../../shared/customizer'
import { isRightFaceAsset } from '../../../../shared/faceLibrarySelection'

export type FaceLibraryPartId = FaceComponentPartId

export const customizerFaceParts: Array<{ id: FaceLibraryPartId; label: string; category: FaceComponentKind; element?: 'eye-left' | 'eye-right' | 'brow-left' | 'brow-right'; side: 'left' | 'right' }> = [
  { id: 'eye-left', label: 'Olho esquerdo', category: 'eye', element: 'eye-left', side: 'left' },
  { id: 'eye-right', label: 'Olho direito', category: 'eye', element: 'eye-right', side: 'right' },
  { id: 'pupil-left', label: 'Pupila esquerda', category: 'pupil', side: 'left' },
  { id: 'pupil-right', label: 'Pupila direita', category: 'pupil', side: 'right' },
  { id: 'brow-left', label: 'Sobrancelha esquerda', category: 'eyebrow', element: 'brow-left', side: 'left' },
  { id: 'brow-right', label: 'Sobrancelha direita', category: 'eyebrow', element: 'brow-right', side: 'right' }
]

export const facePartColorControls: Array<{ id: HairColorRole; label: string; fallback: string }> = [
  { id: 'base', label: 'Base', fallback: '#55404d' }, { id: 'fade', label: 'Degradê', fallback: '#8a687e' },
  { id: 'outline', label: 'Contorno', fallback: '#251e2c' }, { id: 'highlight', label: 'Luzes', fallback: '#d6b7c7' },
  { id: 'accent', label: 'Acento', fallback: '#bd7198' }
]

const skinTonePresets = [
  { id: '#f5ddcb', name: 'Porcelana' },
  { id: '#edc5a5', name: 'Clara' },
  { id: '#dba47d', name: 'Pêssego' },
  { id: '#c88961', name: 'Dourada' },
  { id: '#a96d4c', name: 'Média' },
  { id: '#754a36', name: 'Escura' },
  { id: '#493027', name: 'Retinta' }
] as const

export const customizerSkinTonePresets = [skinTonePresets[0], skinTonePresets[1], skinTonePresets[2], skinTonePresets[4], skinTonePresets[6]]
export { skinTonePresets }

export const mirroredFaceThumbnailIds = new Set<FaceComponentPartId>(['eye-right', 'pupil-right', 'brow-right'])

export function facePartCatalogId(appearance: CustomizerFaceAppearance | undefined, part: typeof customizerFaceParts[number]): string | null | undefined {
  return appearance?.components?.[part.id]?.assetId
}

export function facePartSourceId(part: typeof customizerFaceParts[number]): FaceLibraryPartId {
  return part.id
}

export function hasSelectedFaceAsset(appearance: CustomizerFaceAppearance): boolean {
  return Boolean(appearance.setId
    || appearance.eyeCatalogId || appearance.eyeLeftCatalogId || appearance.eyeRightCatalogId
    || appearance.eyebrowCatalogId || appearance.eyebrowLeftCatalogId || appearance.eyebrowRightCatalogId
    || appearance.noseCatalogId || appearance.mouthClosedCatalogId || appearance.mouthOpenCatalogId
    || Object.values(appearance.components ?? {}).some((component) => component?.assetId)
    || Object.values(appearance.faceDetails ?? {}).some(Boolean)
    || Object.values(appearance.headExtras ?? {}).some(Boolean))
}

export function wrapSlotIndex(index: number, slotCount: number): number {
  return slotCount > 0 ? (index % slotCount + slotCount) % slotCount : 0
}

export function sameFaceAssetPair(left: FaceComponentAssetSummary, right: FaceComponentAssetSummary, details: Record<string, FaceComponentAsset>): boolean {
  if (left.kind !== right.kind || !isRightFaceAsset(right)) return false
  if (left.pairId || right.pairId) return Boolean(left.pairId && left.pairId === right.pairId || right.pairId === left.id)
  const leftDetail = details[left.id]
  const rightDetail = details[right.id]
  const baseName = (name: string) => name.replace(/ · (?:Olho|Olho aberto|Olho fechado|Pupila|Sobrancelha) (?:esquerd[oa]|direit[oa])$/i, '')
  return Boolean(leftDetail && rightDetail && !isRightFaceAsset(left) && baseName(left.name) === baseName(right.name) && leftDetail.dataUrl === rightDetail.dataUrl)
}

export const customizerFaceCatalogLayoutParts = [
  { id: 'nose', label: 'Nariz', help: 'Nenhuma peça salva' },
  { id: 'eye-highlight-left', label: 'Destaque do olho esquerdo', help: 'Nenhuma peça salva' },
  { id: 'mouth', label: 'Boca', help: 'Fechada ou aberta' },
  { id: 'eye-highlight-right', label: 'Destaque do olho direito', help: 'Nenhuma peça salva' },
  { id: 'blush', label: 'Blush', help: 'Nenhuma peça salva' },
  { id: 'facial-shadow', label: 'Sombra facial', help: 'Nenhuma peça salva' }
] as const

export type FaceCatalogLayoutPart = typeof customizerFaceCatalogLayoutParts[number]['id']
export type FaceCatalogChoice =
  | { type: 'catalog'; summary: FaceCatalogItemSummary; piece: FaceCatalogItem['pieces'][number] }
  | { type: 'detail'; summary: FaceComponentAssetSummary; asset: FaceComponentAsset }

type FaceCatalogModelInput = {
  faceCatalogItems: FaceCatalogItemSummary[]
  faceCatalogDetails: Record<string, FaceCatalogItem>
  faceComponentAssets: FaceComponentAssetSummary[]
  faceComponentDetails: Record<string, FaceComponentAsset>
  appearance: CustomizerFaceAppearance | undefined
}

/** Builds the shared choice and selection model for the face catalog's two views. */
export function createCustomizerFaceCatalogModel({
  faceCatalogItems,
  faceCatalogDetails,
  faceComponentAssets,
  faceComponentDetails,
  appearance
}: FaceCatalogModelInput) {
  const optionsForCategory = (category: FaceComponentKind) => {
    const candidates = faceComponentAssets.filter((asset) => asset.kind === category)
    return candidates.filter((asset) => !isRightFaceAsset(asset) || !candidates.some((candidate) =>
      !isRightFaceAsset(candidate) && sameFaceAssetPair(candidate, asset, faceComponentDetails)
    ))
  }

  const choicesForSheet = (category: FaceSheetKind): FaceCatalogChoice[] => faceCatalogItems
    .filter((summary) => summary.category === category)
    .flatMap((summary) => faceCatalogDetails[`${summary.modelSlot}:${summary.id}`]?.pieces
      .filter((piece) => piece.sheet === category)
      .map((piece) => ({ type: 'catalog' as const, summary, piece })) ?? [])

  const choicesForPart = (part: FaceCatalogLayoutPart): FaceCatalogChoice[] => part === 'nose'
    ? choicesForSheet('nose')
    : part === 'mouth'
      ? choicesForSheet(appearance?.mouthOpen ? 'mouth-open' : 'mouth-closed')
      : faceComponentAssets.filter((summary) => summary.kind === part).flatMap((summary): FaceCatalogChoice[] => {
        const asset = faceComponentDetails[summary.id]
        return asset && asset.kind === part ? [{ type: 'detail', summary, asset }] : []
      })

  const selectedIdForPart = (part: FaceCatalogLayoutPart) => part === 'nose'
    ? appearance?.noseCatalogId
    : part === 'mouth'
      ? appearance?.mouthOpen ? appearance.mouthOpenCatalogId : appearance?.mouthClosedCatalogId
      : appearance?.faceDetails?.[part]

  const selectedVariantForPart = (part: FaceCatalogLayoutPart) => part === 'nose'
    ? appearance?.noseIndex ?? 0
    : part === 'mouth' ? appearance?.expressionIndex ?? 0 : 0

  const isChoiceSelected = (part: FaceCatalogLayoutPart, choice: FaceCatalogChoice) => {
    if (choice.type === 'detail') return choice.summary.id === selectedIdForPart(part)
    return choice.summary.id === selectedIdForPart(part) && choice.piece.index === selectedVariantForPart(part)
  }

  return { optionsForCategory, choicesForPart, selectedIdForPart, isChoiceSelected }
}
