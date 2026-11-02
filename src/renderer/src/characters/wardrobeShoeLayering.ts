import type { ModelPart } from '../../../shared/fabricator'
import { modelRigSegmentKind, modelRigSide } from '../../../shared/modelRig'

type ShoeAttachment = {
  attachedPartId: string
  sleeveSide?: 'left' | 'right'
}

export type ShoeBehindShinPlacement = {
  shinPartId: string | null
  renderAfterPartId: string
}

function distanceBetweenParts(left: ModelPart, right: ModelPart): number {
  const leftScale = Math.max(1, left.width, left.height)
  const rightScale = Math.max(1, right.width, right.height)
  const x = (left.x + left.width / 2) - (right.x + right.width / 2)
  const y = (left.y + left.height / 2) - (right.y + right.height / 2)
  return Math.hypot(x / Math.max(leftScale, rightScale), y / Math.max(leftScale, rightScale))
}

/** Resolves the matching shin and waits until both it and the shoe's bone are drawn. */
export function resolveShoeBehindShinPlacement(
  shoe: ShoeAttachment,
  targetBone: ModelPart,
  bodyParts: readonly ModelPart[],
  bodyOrder: readonly string[]
): ShoeBehindShinPlacement {
  const target = bodyParts.find((part) => part.id === shoe.attachedPartId) ?? targetBone
  const side = shoe.sleeveSide ?? modelRigSide(target.name)
  const lowerLegs = bodyParts.filter((part) => modelRigSegmentKind(part.name) === 'lower-leg')
  const matchingLowerLegs = lowerLegs.filter((part) => {
    const partSide = modelRigSide(part.name)
    return !side || !partSide || partSide === side
  })
  const closestShin = matchingLowerLegs
    .sort((left, right) => distanceBetweenParts(target, left) - distanceBetweenParts(target, right))[0]
  const anchors = [target.id, closestShin?.id].filter((id): id is string => Boolean(id))
  const lastAnchorIndex = Math.max(...anchors.map((id) => bodyOrder.indexOf(id)).filter((index) => index >= 0))
  return {
    shinPartId: closestShin?.id ?? null,
    renderAfterPartId: lastAnchorIndex >= 0 ? bodyOrder[lastAnchorIndex] : targetBone.id
  }
}
