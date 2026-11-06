import type { CharacterGender, HairPartId } from '../../../../shared/customizer'
import type { HairAsset, HairStyle, HairStyleAsset, HairStyleSave, HairStyleSummary, HairWorkspace } from '../../../../shared/fabricator'
import { hairCategories, type HairAssetSide } from '../../../../shared/hairCategories'
import { normalizeHairTransforms } from '../../../../shared/hairPersistence'
import { defaultHairCategoriesBySide } from './hairWorkspaceModel'
export { defaultHairCategoriesBySide } from './hairWorkspaceModel'

export type HairStyleSaveCommandInput = {
  workspace: HairWorkspace
  modelSlot: number
  styleName: string
  gender?: CharacterGender
  existing?: HairStyleSummary | null
}

export type HairStyleSaveCommandDependencies = {
  saveHairStyle: (modelSlot: number, style: HairStyleSave, assets: HairStyleAsset[]) => Promise<void>
  createId: () => string
  now: () => string
}

function assetMetadata(asset: HairAsset | null) {
  if (!asset) return null
  return {
    width: asset.width,
    height: asset.height,
    ...(asset.hasDeformationOriginal ? {
      hasDeformationOriginal: true,
      deformationOriginalWidth: asset.deformationOriginalWidth,
      deformationOriginalHeight: asset.deformationOriginalHeight,
      deformationOriginalTransform: asset.deformationOriginalTransform
    } : {})
  }
}

export async function saveHairStyleDraft(
  input: HairStyleSaveCommandInput,
  dependencies: HairStyleSaveCommandDependencies
): Promise<HairStyle> {
  const { workspace, modelSlot, styleName } = input
  const existing = input.existing ?? undefined
  const id = existing?.id ?? dependencies.createId()
  const now = dependencies.now()
  const gender = input.gender ?? existing?.gender
  const front = workspace.front
  const back = workspace.back
  const fringe = workspace.fringe ?? null
  const sourceImageDataUrl = workspace.sourceImageDataUrl
  const saved: HairStyleSave = {
    schemaVersion: 1,
    id,
    modelSlot,
    name: styleName.trim().slice(0, 80),
    ...(gender ? { gender } : {}),
    categoryBySide: Object.fromEntries((['front', 'back', 'fringe'] as const)
      .filter((side) => Boolean(workspace[side]))
      .map((side) => [side, workspace.categoryBySide?.[side] ?? defaultHairCategoriesBySide[side]])) as Partial<Record<HairAssetSide, HairPartId>>,
    front: assetMetadata(front),
    back: assetMetadata(back),
    fringe: assetMetadata(fringe),
    transforms: workspace.transforms,
    sourceImageSaved: Boolean(sourceImageDataUrl),
    sourceAppliesToDraft: Boolean(sourceImageDataUrl) && workspace.sourceAppliesToDraft !== false,
    chromaTolerance: workspace.chromaTolerance ?? 70,
    chromaMode: workspace.chromaMode ?? 'auto',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }
  saved.transforms = normalizeHairTransforms(saved)

  const assets: HairStyleAsset[] = []
  for (const side of ['front', 'back', 'fringe'] as const) {
    const asset = workspace[side]
    if (!asset) continue
    assets.push({ id: side, dataUrl: asset.dataUrl })
    if (asset.hasDeformationOriginal) {
      if (!asset.deformationOriginalDataUrl) {
        throw new Error(`Cópia original ausente para restaurar ${hairCategories.find((item) => item.side === side)?.label ?? 'a peça de cabelo'}.`)
      }
      assets.push({ id: `${side}-deform-original` as HairStyleAsset['id'], dataUrl: asset.deformationOriginalDataUrl })
    }
  }
  if (sourceImageDataUrl) assets.push({ id: 'source', dataUrl: sourceImageDataUrl })

  await dependencies.saveHairStyle(modelSlot, saved, assets)
  return {
    ...saved,
    front: saved.front && front ? { ...front } : null,
    back: saved.back && back ? { ...back } : null,
    fringe: saved.fringe && fringe ? { ...fringe } : null,
    ...(sourceImageDataUrl ? { sourceImageDataUrl } : {})
  }
}
