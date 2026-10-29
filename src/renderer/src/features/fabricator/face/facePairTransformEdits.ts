import type { FaceComponentAsset, FaceComponentKind, ModelPart } from '../../../../../shared/fabricator.ts'
import { clamp } from './faceComponentImportModel.ts'
import type { FacePartId } from './faceComponentImportModel.ts'

type PairAxis = 'x' | 'y'
type PairScaleAxis = 'scaleX' | 'scaleY'
type FaceAssetSelection = Partial<Record<FacePartId, string>>
type PairDetails = Record<string, FaceComponentAsset>
type LinkedParts = Record<FaceComponentKind, boolean>

/** Calculates a shared movement without mutating either selected asset. */
export function planFacePairMove({
  kind, axis, target, relative, head, left, right
}: {
  kind: FaceComponentKind
  axis: PairAxis
  target: number
  relative?: boolean
  head: Pick<ModelPart, 'width' | 'height'>
  left: FaceComponentAsset
  right: FaceComponentAsset
}): [number, number] | null {
  const leftValue = left.defaultTransform[axis]
  const rightValue = right.defaultTransform[axis]
  const center = (leftValue + rightValue) / 2
  const limit = axis === 'x' ? head.width : head.height
  const desired = (relative ? center + target : target) - center
  const delta = kind === 'pupil'
    ? desired
    : clamp(desired, Math.max(-leftValue, -rightValue), Math.min(limit - leftValue, limit - rightValue))
  if (Math.abs(delta) < .001) return null
  return [leftValue + delta, rightValue + delta]
}

/** Preserves the eye pair center and limits the requested separation to the head bounds. */
export function planEyeSeparation(leftX: number, rightX: number, headWidth: number, target: number): [number, number] {
  const center = clamp((leftX + rightX) / 2, 0, headWidth)
  const maximum = 2 * Math.min(center, headWidth - center)
  const separation = clamp(target, 0, maximum)
  return [center - separation / 2, center + separation / 2]
}

/** Resolves the source dimensions for linked eyes and pupils before calculating both scales. */
export function planFacePairResize({
  pair, kind, axis, targetPercent, head, selectedAssets, details, linked
}: {
  pair: readonly [FaceComponentAsset, FaceComponentAsset]
  kind: FaceComponentKind
  axis: PairScaleAxis
  targetPercent: number
  head: Pick<ModelPart, 'width' | 'height'>
  selectedAssets: FaceAssetSelection
  details: PairDetails
  linked: LinkedParts
}): [number, number] {
  const scaledKind = kind === 'eye-closed' && axis === 'scaleX' ? 'eye' : kind
  const dimension = axis === 'scaleX' ? 'width' : 'height'
  const headSize = head[dimension]
  const scaleFor = (asset: FaceComponentAsset, index: number) => {
    let sourceSize = index === 1 && linked[scaledKind] ? pair[0][dimension] : asset[dimension]
    if (scaledKind === 'pupil') {
      const side = index === 0 ? 'eye-left' : 'eye-right'
      const eye = details[selectedAssets[side] ?? ''] ?? details[selectedAssets['eye-left'] ?? '']
      const sourceEye = index === 1 && linked.eye ? details[selectedAssets['eye-left'] ?? ''] ?? eye : eye
      sourceSize = sourceEye && eye
        ? sourceEye[dimension] * eye.defaultTransform[axis]
        : headSize * (axis === 'scaleX' ? .19 : .17)
    }
    return clamp(targetPercent / 100 * headSize / sourceSize, .01, 20)
  }
  return [scaleFor(pair[0], 0), scaleFor(pair[1], 1)]
}
