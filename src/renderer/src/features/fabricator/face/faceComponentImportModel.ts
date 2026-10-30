import type { FaceCatalogItem, FaceComponentAsset, FaceComponentAssetSave, FaceComponentKind, FaceDetailKind, FaceTransform, ModelPart } from '../../../../../shared/fabricator'
import type { AlignableFaceKind, FaceImportAnchor } from './faceImportAlignment.ts'
import { alignImportedFacePiece, fitClosedEyeToOpen } from './faceImportAlignment.ts'
import type { EyeSheetPiece } from './splitEyeSheet.ts'

export type FacePartId = 'eye-left' | 'eye-right' | 'pupil-left' | 'pupil-right' | 'eye-closed-left' | 'eye-closed-right' | 'brow-left' | 'brow-right'
export type FaceComponentCategory = { kind: FaceComponentKind; label: string; parts: [FacePartId, FacePartId]; names: [string, string] }
export type FaceComponentImportEntry = { asset: FaceComponentAssetSave; dataUrl: string }
export type EyeSheetImportPlan = {
  entries: FaceComponentImportEntry[]
  assets: FaceComponentAsset[]
  assigned: Partial<Record<FacePartId, string>>
}

export const faceComponentCategories: FaceComponentCategory[] = [
  { kind: 'eye', label: 'Olhos', parts: ['eye-left', 'eye-right'], names: ['Olho esquerdo', 'Olho direito'] },
  { kind: 'pupil', label: 'Pupilas', parts: ['pupil-left', 'pupil-right'], names: ['Pupila esquerda', 'Pupila direita'] },
  { kind: 'eye-closed', label: 'Olhos fechados', parts: ['eye-closed-left', 'eye-closed-right'], names: ['Olho fechado esquerdo', 'Olho fechado direito'] },
  { kind: 'eyebrow', label: 'Sobrancelhas', parts: ['brow-left', 'brow-right'], names: ['Sobrancelha esquerda', 'Sobrancelha direita'] }
]

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function partCategory(id: FacePartId): FaceComponentCategory {
  return faceComponentCategories.find((category) => category.parts.includes(id))!
}

export function initialFaceComponentTransform(kind: FaceComponentKind, head: ModelPart, width: number, height: number): FaceTransform {
  return {
    x: kind === 'pupil' ? 0 : head.width * (kind === 'eyebrow' ? .38 : .37),
    y: kind === 'pupil' ? 0 : head.height * (kind === 'eyebrow' ? .32 : .46),
    scaleX: kind === 'pupil' ? .35 : head.width * (kind === 'eyebrow' ? .16 : .19) / width,
    scaleY: kind === 'pupil' ? .35 : head.height * (kind === 'eyebrow' ? .12 : .17) / height,
    rotation: 0
  }
}

export function initialFaceDetailTransform(kind: FaceDetailKind, head: ModelPart, width: number, height: number): FaceTransform {
  const targetWidth = kind.startsWith('eye-highlight') ? .075 : kind === 'blush' ? .24 : .3
  const scale = width > 0 && height > 0 ? clamp(head.width * targetWidth / width, .01, 20) : .25
  const x = kind.endsWith('left') ? head.width * .39 : kind.endsWith('right') ? head.width * .61 : head.width * .5
  const y = kind.startsWith('eye-highlight') ? head.height * .48 : kind === 'blush' ? head.height * .68 : head.height * .62
  return { x, y, scaleX: scale, scaleY: scale, rotation: 0 }
}

export function initialFaceCatalogTransform(head: ModelPart, item: Pick<FaceCatalogItem, 'category' | 'pieces'>): FaceTransform {
  const piece = item.pieces[0]
  const targetWidth = item.category === 'nose' ? .075 : .2
  const scale = piece ? clamp(head.width * targetWidth / piece.width, .04, 4) : .25
  return {
    x: head.width * .5,
    y: head.height * (item.category === 'nose' ? .61 : .78),
    scaleX: scale,
    scaleY: scale,
    rotation: 0
  }
}

function fileBaseName(fileName: string, maxLength: number, fallback: string): string {
  return fileName.replace(/\.[^.]+$/, '').slice(0, maxLength) || fallback
}

export function createEyeSheetImportPlan({
  pieces, fileName, modelSlot, head, anchors, createId = () => crypto.randomUUID(), now = () => new Date().toISOString()
}: {
  pieces: readonly EyeSheetPiece[]
  fileName: string
  modelSlot: number
  head: ModelPart
  anchors?: Partial<Record<AlignableFaceKind, FaceImportAnchor>>
  createId?: () => string
  now?: () => string
}): EyeSheetImportPlan {
  const baseName = fileBaseName(fileName, 90, 'Olhos')
  const pairId = createId()
  const entries: FaceComponentImportEntry[] = []
  const assets: FaceComponentAsset[] = []
  const assigned: Partial<Record<FacePartId, string>> = {}

  for (const piece of pieces) {
    const category = faceComponentCategories.find((entry) => entry.kind === piece.kind)!
    for (const [index, side] of category.parts.entries()) {
      const baseTransform = initialFaceComponentTransform(piece.kind, head, piece.width, piece.height)
      const defaultTransform: FaceTransform = index === 0 ? baseTransform : {
        ...baseTransform,
        x: piece.kind === 'pupil' ? -baseTransform.x : head.width - baseTransform.x,
        rotation: -baseTransform.rotation,
        flipX: true
      }
      const anchor = anchors?.[piece.kind]
      let transform = anchor ? alignImportedFacePiece(piece.kind, index === 0 ? 'left' : 'right', piece.width, piece.height, anchor) : defaultTransform

      if (piece.kind === 'eye-closed') {
        const openEye = assets.find((asset) => asset.kind === 'eye' && Boolean(asset.rightSidePositioned) === Boolean(index))
        if (openEye) transform = fitClosedEyeToOpen({ width: piece.width, defaultTransform: transform, rightSidePositioned: index === 1 }, openEye, head, index === 1)
      }
      if (transform.scaleX > 20) throw new Error('O olho fechado desta folha é estreito demais para acompanhar a largura do olho aberto.')

      const asset: FaceComponentAssetSave = {
        schemaVersion: 1,
        id: createId(),
        modelSlot,
        kind: piece.kind,
        name: `${baseName} · ${category.names[index]}`.slice(0, 120),
        width: piece.width,
        height: piece.height,
        defaultTransform: transform,
        rightSidePositioned: index === 1,
        pairId,
        updatedAt: now()
      }
      entries.push({ asset, dataUrl: piece.dataUrl })
      assets.push({ ...asset, dataUrl: piece.dataUrl })
      assigned[side] = asset.id
    }
  }

  return { entries, assets, assigned }
}

export function createEyebrowImportPlan({
  fileName, modelSlot, head, width, height, dataUrl, createId = () => crypto.randomUUID(), now = () => new Date().toISOString()
}: {
  fileName: string
  modelSlot: number
  head: ModelPart
  width: number
  height: number
  dataUrl: string
  createId?: () => string
  now?: () => string
}): { entries: FaceComponentImportEntry[]; leftId: string; rightId: string } {
  const baseName = fileBaseName(fileName, 90, 'Sobrancelha')
  const pairId = createId()
  const updatedAt = now()
  const leftTransform = initialFaceComponentTransform('eyebrow', head, width, height)
  const left: FaceComponentAssetSave = {
    schemaVersion: 1,
    id: createId(),
    modelSlot,
    kind: 'eyebrow',
    name: `${baseName} · Sobrancelha esquerda`.slice(0, 120),
    width,
    height,
    defaultTransform: leftTransform,
    pairId,
    updatedAt
  }
  const right: FaceComponentAssetSave = {
    ...left,
    id: createId(),
    name: `${baseName} · Sobrancelha direita`.slice(0, 120),
    rightSidePositioned: true,
    defaultTransform: {
      ...leftTransform,
      x: head.width - leftTransform.x,
      rotation: -leftTransform.rotation,
      flipX: !leftTransform.flipX
    }
  }

  return { entries: [{ asset: left, dataUrl }, { asset: right, dataUrl }], leftId: left.id, rightId: right.id }
}

export function createFaceDetailImportEntry({
  kind, fileName, fallbackName, modelSlot, head, width, height, dataUrl, createId = () => crypto.randomUUID(), now = () => new Date().toISOString()
}: {
  kind: FaceDetailKind
  fileName: string
  fallbackName: string
  modelSlot: number
  head: ModelPart
  width: number
  height: number
  dataUrl: string
  createId?: () => string
  now?: () => string
}): FaceComponentImportEntry {
  const asset: FaceComponentAssetSave = {
    schemaVersion: 1,
    id: createId(),
    modelSlot,
    kind,
    name: fileBaseName(fileName, 110, fallbackName),
    width,
    height,
    defaultTransform: initialFaceDetailTransform(kind, head, width, height),
    updatedAt: now()
  }
  return { asset, dataUrl }
}
