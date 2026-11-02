import type { HairPartId } from '../../../../shared/customizer'
import type { FabricatorProject, HairAsset as HairAssetData, HairStyle, HairStyleSummary, HairTransform, HairWorkspace as HairWorkspaceData, ModelPart } from '../../../../shared/fabricator'
import { hairCategories, type HairAssetSide } from '../../../../shared/hairCategories'
import { emptyHairTransform } from '../../../../shared/hairPersistence'

export type HairSide = HairAssetSide
export type HairAsset = HairAssetData
export type HairGridStyle = { front: HairAsset; back: HairAsset; sourceImageDataUrl: string; rowBoundary: number[] }

export const defaultHairCategoriesBySide: Record<HairSide, HairPartId> = {
  front: 'rearHair', back: 'backHair', fringe: 'frontHair'
}

export function headPart(project: FabricatorProject | null): ModelPart | null {
  return project?.parts.find((part) => /cabe[çc]a|head/i.test(part.name)) ?? null
}

export function initialTransform(side: HairSide, head: ModelPart, asset: Pick<HairAsset, 'width' | 'height'>): HairTransform {
  const isFringe = side === 'fringe'
  const width = head.width * (isFringe ? 1.05 : 1.12)
  const height = head.height * (isFringe ? .55 : .92)
  return { x: head.width / 2, y: head.height * (isFringe ? .29 : .49), scaleX: width / asset.width, scaleY: height / asset.height, rotation: 0 }
}

export function emptyHairWorkspace(modelSlot: number, now = () => new Date().toISOString()): HairWorkspaceData {
  return {
    schemaVersion: 1,
    modelSlot,
    front: null,
    back: null,
    fringe: null,
    transforms: { front: emptyHairTransform(), back: emptyHairTransform(), fringe: emptyHairTransform() },
    categoryBySide: defaultHairCategoriesBySide,
    chromaTolerance: 70,
    chromaMode: 'auto',
    updatedAt: now()
  }
}

export function hairStyleSides(style: Pick<HairStyleSummary, 'front' | 'back' | 'fringe'>): HairSide[] {
  return (['front', 'back', 'fringe'] as const).filter((side) => style[side] !== null && style[side] !== undefined)
}

export function removeHairSide(workspace: HairWorkspaceData, side: HairSide, now = () => new Date().toISOString()): HairWorkspaceData {
  const { sourceImageDataUrl: _sourceImageDataUrl, ...withoutSource } = workspace
  return {
    ...withoutSource,
    [side]: null,
    transforms: { ...workspace.transforms, [side]: emptyHairTransform() },
    categoryBySide: { ...workspace.categoryBySide, [side]: defaultHairCategoriesBySide[side] },
    sourceImageSaved: false,
    sourceAppliesToDraft: false,
    updatedAt: now()
  }
}

export function categoriesForHairStyle(style: Pick<HairStyle, 'category' | 'categoryBySide'>): Partial<Record<HairSide, HairPartId>> {
  const categories: Partial<Record<HairSide, HairPartId>> = { ...defaultHairCategoriesBySide }
  if (style.category) {
    const side = hairCategories.find((item) => item.id === style.category)?.side
    if (side) categories[side] = style.category
  }
  return { ...categories, ...style.categoryBySide }
}

export function preserveHairFit(previous: HairTransform, oldAsset: HairAsset | null, nextAsset: HairAsset): HairTransform {
  if (!oldAsset) return previous
  return { ...previous, scaleX: previous.scaleX * oldAsset.width / nextAsset.width, scaleY: previous.scaleY * oldAsset.height / nextAsset.height }
}

export function workspaceFromHairGridStyle(
  modelSlot: number,
  head: ModelPart,
  style: HairGridStyle,
  tolerance: number,
  mode: 'auto' | 'green' | 'checker',
  now = () => new Date().toISOString()
): HairWorkspaceData {
  return {
    ...emptyHairWorkspace(modelSlot, now),
    front: style.front,
    back: style.back,
    transforms: {
      front: initialTransform('front', head, style.front),
      back: initialTransform('back', head, style.back),
      fringe: emptyHairTransform()
    },
    sourceImageDataUrl: style.sourceImageDataUrl,
    sourceImageSaved: true,
    sourceAppliesToDraft: true,
    chromaTolerance: tolerance,
    chromaMode: mode,
    updatedAt: now()
  }
}

export function workspaceFromHairStyle(
  modelSlot: number,
  head: ModelPart,
  style: HairStyle,
  legacyWorkspace: HairWorkspaceData | null,
  now = () => new Date().toISOString()
): HairWorkspaceData {
  const categories = categoriesForHairStyle(style)
  const sourceImageDataUrl = style.sourceImageDataUrl ?? (style.id === 'legacy-workspace' ? legacyWorkspace?.sourceImageDataUrl : undefined)
  return {
    ...emptyHairWorkspace(modelSlot, now),
    front: style.front ? { ...style.front } : null,
    back: style.back ? { ...style.back } : null,
    fringe: style.fringe ? { ...style.fringe } : null,
    transforms: { ...structuredClone(style.transforms), fringe: style.transforms.fringe ?? (style.fringe ? initialTransform('fringe', head, style.fringe) : emptyHairTransform()) },
    categoryBySide: categories,
    ...(sourceImageDataUrl ? { sourceImageDataUrl } : {}),
    sourceImageSaved: Boolean(sourceImageDataUrl),
    sourceAppliesToDraft: style.sourceAppliesToDraft ?? legacyWorkspace?.sourceAppliesToDraft ?? Boolean(sourceImageDataUrl),
    chromaTolerance: style.chromaTolerance ?? legacyWorkspace?.chromaTolerance ?? 70,
    chromaMode: style.chromaMode ?? legacyWorkspace?.chromaMode ?? 'auto',
    updatedAt: now()
  }
}
