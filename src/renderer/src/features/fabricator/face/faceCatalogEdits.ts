import type { FaceAssetSave, FaceCatalogItem, FaceCatalogItemSave, FaceTransform } from '../../../../../shared/fabricator.ts'
import { clamp } from './faceComponentImportModel.ts'

export function faceCatalogItemForSave(item: FaceCatalogItem): FaceCatalogItemSave {
  const { dataUrl: _sheetData, ...sheet } = item.sheet
  return { ...item, sheet, pieces: item.pieces.map(({ dataUrl: _pieceData, ...piece }) => piece) }
}

export function faceCatalogImagesForSave(item: FaceCatalogItem): FaceAssetSave[] {
  if (!item.id.startsWith('legacy_')) return []
  return [
    { id: `sheet-${item.category}`, dataUrl: item.sheet.dataUrl },
    ...item.pieces.map((piece) => ({ id: piece.id, dataUrl: piece.dataUrl }))
  ]
}

export function faceCatalogImagesForImport(item: FaceCatalogItem): FaceAssetSave[] {
  return [
    { id: `sheet-${item.category}`, dataUrl: item.sheet.dataUrl },
    ...item.pieces.map((piece) => ({ id: piece.id, dataUrl: piece.dataUrl }))
  ]
}

export function alignFaceCatalogMouthPreviewTransform(
  transform: FaceTransform,
  closedItem: FaceCatalogItem | undefined,
  activeItem: FaceCatalogItem | undefined
): FaceTransform {
  const closedBase = closedItem?.transforms.mouth
  const activeBase = activeItem?.transforms.mouth
  if (!closedBase || !activeBase || closedBase.scaleX <= 0 || closedBase.scaleY <= 0) return transform
  return {
    ...transform,
    scaleX: transform.scaleX * activeBase.scaleX / closedBase.scaleX,
    scaleY: transform.scaleY * activeBase.scaleY / closedBase.scaleY
  }
}

/** Keeps open-mouth scale differences proportional while editing the shared mouth placement. */
export function planFaceCatalogTransformEdits(
  items: readonly FaceCatalogItem[],
  selected: FaceCatalogItem,
  patch: Partial<FaceTransform>,
  updatedAt: string
): FaceCatalogItem[] {
  if (selected.category === 'nose') {
    const current = selected.transforms.nose
    if (!current) return []
    return [{
      ...selected,
      transforms: { ...selected.transforms, nose: { ...current, ...patch } },
      updatedAt
    }]
  }

  if (selected.category !== 'mouth-closed' && selected.category !== 'mouth-open') return []
  const mouthItems = items.filter((item) => item.modelSlot === selected.modelSlot
    && (item.category === 'mouth-closed' || item.category === 'mouth-open'))
  const current = mouthItems.find((item) => item.category === 'mouth-closed')?.transforms.mouth
    ?? selected.transforms.mouth
  if (!current) return []

  const shared = { ...current, ...patch }
  return (mouthItems.length > 0 ? mouthItems : [selected]).map((item) => {
    const itemBase = item.transforms.mouth ?? current
    const mouthTransform = item.category === 'mouth-open' ? {
      ...shared,
      scaleX: shared.scaleX * itemBase.scaleX / current.scaleX,
      scaleY: shared.scaleY * itemBase.scaleY / current.scaleY
    } : shared
    return {
      ...item,
      transforms: { ...item.transforms, mouth: mouthTransform },
      updatedAt
    }
  })
}

export function planFaceCatalogVariantEdit(item: FaceCatalogItem, index: number, updatedAt: string): FaceCatalogItem {
  return item.category === 'nose'
    ? { ...item, selectedNose: index, updatedAt }
    : { ...item, selectedExpression: index, updatedAt }
}

export function planFaceCatalogOpacityEdit(item: FaceCatalogItem, opacity: number, updatedAt: string): FaceCatalogItem | null {
  if (item.category !== 'nose') return null
  return { ...item, opacity: clamp(opacity, 0, 1), updatedAt }
}
