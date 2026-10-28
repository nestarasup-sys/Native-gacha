import type { FaceCatalogItem, FaceComponentAsset, FaceComponentAssetSummary, FaceElementKind } from '../../../shared/fabricator'
import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'
import { isRightFaceAsset } from '../../../shared/faceLibrarySelection'

export { isRightFaceAsset }

export const faceElementOrder: FaceElementKind[] = ['brow-left', 'brow-right', 'eye-left', 'eye-right', 'nose', 'mouth']

export function transferEyeCloseAdjustment(openBase: FaceComponentAsset['defaultTransform'], openCurrent: FaceComponentAsset['defaultTransform'], closedBase: FaceComponentAsset['defaultTransform']): FaceComponentAsset['defaultTransform'] {
  return {
    ...closedBase,
    x: closedBase.x + openCurrent.x - openBase.x,
    y: closedBase.y + openCurrent.y - openBase.y,
    scaleX: closedBase.scaleX * openCurrent.scaleX / openBase.scaleX,
    scaleY: closedBase.scaleY * openCurrent.scaleY / openBase.scaleY,
    rotation: closedBase.rotation + openCurrent.rotation - openBase.rotation,
    flipX: Boolean(closedBase.flipX) !== (Boolean(openCurrent.flipX) !== Boolean(openBase.flipX))
  }
}

export function alignMouthTransformToClosedBase(transform: FaceComponentAsset['defaultTransform'], closedItem: FaceCatalogItem | undefined, activeItem: FaceCatalogItem): FaceComponentAsset['defaultTransform'] {
  const closedBase = closedItem?.transforms.mouth
  const activeBase = activeItem.transforms.mouth
  if (!closedBase || !activeBase || closedBase.scaleX <= 0 || closedBase.scaleY <= 0) return transform
  return {
    ...transform,
    scaleX: transform.scaleX * activeBase.scaleX / closedBase.scaleX,
    scaleY: transform.scaleY * activeBase.scaleY / closedBase.scaleY
  }
}

function componentSheetName(name: string): string {
  return name.replace(/(?:\s*[·-]\s*(?:Olho(?:\s+(?:aberto|fechado))?|Pupila|Sobrancelha)(?:\s+(?:esquerda|direita|esquerdo|direito))?)+$/i, '').trim().toLocaleLowerCase()
}

function closedEyeSimilarity(openEye: FaceComponentAsset, closedEye: FaceComponentAsset): number {
  const open = openEye.defaultTransform
  const closed = closedEye.defaultTransform
  const renderedOpenWidth = openEye.width * open.scaleX
  const renderedOpenHeight = openEye.height * open.scaleY
  const renderedClosedWidth = closedEye.width * closed.scaleX
  const renderedClosedHeight = closedEye.height * closed.scaleY
  return Math.hypot(closed.x - open.x, closed.y - open.y)
    + Math.abs(Math.log(renderedClosedWidth / renderedOpenWidth)) * 15
    + Math.abs(Math.log(renderedClosedHeight / renderedOpenHeight)) * 15
    + Math.abs(closed.rotation - open.rotation) / 10
}

export type ClosedEyeAssetResolver = (openEye: FaceComponentAsset, side: 'left' | 'right') => Promise<FaceComponentAsset | null>

export function createClosedEyeAssetResolver(modelSlot: number, assetProvider: CharacterRenderAssetProvider): ClosedEyeAssetResolver {
  let closedEyeAssetsPromise: Promise<FaceComponentAsset[]> | null = null

  return async (openEye, side) => {
    if (!closedEyeAssetsPromise) {
      closedEyeAssetsPromise = assetProvider.listFaceComponentAssets(modelSlot, 'eye-closed').then(async (summaries) => {
        const details = await Promise.all(summaries.map((summary) => assetProvider.loadFaceComponentAsset(modelSlot, summary.id)))
        return details.filter((asset): asset is FaceComponentAsset => Boolean(asset?.kind === 'eye-closed'))
      })
    }
    const candidates = (await closedEyeAssetsPromise).filter((asset) => isRightFaceAsset(asset) === (side === 'right'))
    const openBaseName = componentSheetName(openEye.name)
    const paired = candidates.filter((asset) => Boolean(openEye.pairId && openEye.pairId === asset.pairId))
    if (paired.length) return paired.sort((left, right) => closedEyeSimilarity(openEye, left) - closedEyeSimilarity(openEye, right))[0]
    const sameSheet = candidates.filter((asset) => componentSheetName(asset.name) === openBaseName)
    if (sameSheet.length) return sameSheet.sort((left, right) => closedEyeSimilarity(openEye, left) - closedEyeSimilarity(openEye, right))[0]
    return candidates.length === 1 ? candidates[0] : null
  }
}
