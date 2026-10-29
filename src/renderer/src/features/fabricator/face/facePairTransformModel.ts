import type { FaceComponentAsset, FaceComponentKind, FaceDetailKind, ModelPart } from '../../../../../shared/fabricator'

type FacePairCategory = FaceComponentKind | FaceDetailKind | 'nose' | 'mouth'
type FacePairAsset = Pick<FaceComponentAsset, 'id' | 'kind' | 'width' | 'height' | 'defaultTransform' | 'rightSidePositioned'>

export type FacePairTransformMetrics = {
  pairHeightAsset?: FacePairAsset
  pairX: number
  pairY: number
  eyeSeparation: number
  eyeSeparationMax: number
  pairWidthPercent: number
  pairHeightPercent: number
}

/** Derives the shared pair controls while preserving legacy mirrored-asset positioning. */
export function deriveFacePairTransformMetrics({
  head,
  category,
  movementLeftAsset,
  movementRightAsset,
  leftPairAsset,
  leftEyeForPupil
}: {
  head: Pick<ModelPart, 'width' | 'height'> | null
  category: FacePairCategory
  movementLeftAsset?: FacePairAsset
  movementRightAsset?: FacePairAsset
  leftPairAsset?: FacePairAsset
  leftEyeForPupil?: FacePairAsset
}): FacePairTransformMetrics {
  let rightPairX = 0
  if (head && movementLeftAsset) {
    if (movementRightAsset && movementRightAsset.id !== movementLeftAsset.id) {
      const useSavedRightPosition = movementRightAsset.rightSidePositioned || category === 'pupil'
      rightPairX = useSavedRightPosition
        ? movementRightAsset.defaultTransform.x
        : head.width - movementRightAsset.defaultTransform.x
    } else {
      rightPairX = category === 'pupil'
        ? -movementLeftAsset.defaultTransform.x
        : head.width - movementLeftAsset.defaultTransform.x
    }
  }
  const pairX = movementLeftAsset ? (movementLeftAsset.defaultTransform.x + rightPairX) / 2 : 0
  const eyeSeparation = category === 'eye' && movementLeftAsset
    ? Math.max(0, rightPairX - movementLeftAsset.defaultTransform.x)
    : 0
  const eyeSeparationMax = head ? Math.max(1, 2 * Math.min(pairX, head.width - pairX)) : 1
  const pairRightAsset = movementRightAsset && movementRightAsset.id !== movementLeftAsset?.id
    ? movementRightAsset
    : movementLeftAsset
  const pairY = movementLeftAsset
    ? (movementLeftAsset.defaultTransform.y + (pairRightAsset?.defaultTransform.y ?? movementLeftAsset.defaultTransform.y)) / 2
    : 0
  const pairHeightAsset = category === 'eye-closed' ? leftPairAsset : movementLeftAsset
  let pairWidthSource = movementLeftAsset?.width ?? 1
  if (movementLeftAsset?.kind === 'pupil') {
    pairWidthSource = leftEyeForPupil
      ? leftEyeForPupil.width * leftEyeForPupil.defaultTransform.scaleX
      : head
        ? head.width * .19
        : 1
  }
  let pairHeightSource = pairHeightAsset?.height ?? 1
  if (pairHeightAsset?.kind === 'pupil') {
    pairHeightSource = leftEyeForPupil
      ? leftEyeForPupil.height * leftEyeForPupil.defaultTransform.scaleY
      : head
        ? head.height * .17
        : 1
  }

  return {
    pairHeightAsset,
    pairX,
    pairY,
    eyeSeparation,
    eyeSeparationMax,
    pairWidthPercent: head && movementLeftAsset
      ? pairWidthSource * movementLeftAsset.defaultTransform.scaleX / head.width * 100
      : 0,
    pairHeightPercent: head && pairHeightAsset
      ? pairHeightSource * pairHeightAsset.defaultTransform.scaleY / head.height * 100
      : 0
  }
}
