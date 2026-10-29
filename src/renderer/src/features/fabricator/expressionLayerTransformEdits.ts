import type {
  FaceComponentAsset,
  FaceExpressionSelections,
  FaceExpressionTransforms,
  FaceTransform,
  PtPupilOverrides
} from '../../../../shared/fabricator'

export type ExpressionLayerKey = keyof FaceExpressionTransforms
type PairedExpressionLayerKey = ExpressionLayerKey
type PtPupilSide = 'left' | 'right'
type PtPupilTransformPatch = Partial<Pick<FaceTransform, 'x' | 'y' | 'rotation'>>

export function expressionLayerKey(
  kind: 'eye' | 'pupil' | 'eyebrow',
  side: 'left' | 'right'
): ExpressionLayerKey {
  if (kind === 'eye') return side === 'left' ? 'eyeLeft' : 'eyeRight'
  if (kind === 'pupil') return side === 'left' ? 'pupilLeft' : 'pupilRight'
  return side === 'left' ? 'browLeft' : 'browRight'
}

/** Resolves whether the selected right-side asset is displayed as a mirrored left asset. */
export function expressionLayerUsesMirroredX(
  layer: ExpressionLayerKey,
  selections: FaceExpressionSelections,
  assets: Record<string, Pick<FaceComponentAsset, 'rightSidePositioned'> | undefined>
): boolean {
  if (!layer.endsWith('Right')) return false
  const assetId = layer.startsWith('eye') ? selections.eyes.right
    : layer.startsWith('pupil') ? selections.pupils.right
      : layer.startsWith('brow') ? selections.eyebrows.right : null
  return assetId ? assets[assetId]?.rightSidePositioned !== true : true
}

/** Applies one transform edit and, when linked, maps its delta to the paired layer. */
export function updateExpressionLayerTransform(
  transforms: FaceExpressionTransforms,
  layer: ExpressionLayerKey,
  patch: Partial<FaceTransform>,
  options: {
    linked: boolean
    pairedLayer?: PairedExpressionLayerKey
    sourceMirroredX: boolean
    pairedMirroredX: boolean
  }
): FaceExpressionTransforms {
  const before = transforms[layer]
  const after = { ...before, ...patch }
  const pairedLayer = options.linked ? options.pairedLayer : undefined
  if (!pairedLayer) return { ...transforms, [layer]: after }

  const pairedBefore = transforms[pairedLayer]
  const pairedAfter = { ...pairedBefore }
  if (patch.x !== undefined) {
    const sourceDirection = options.sourceMirroredX ? -1 : 1
    const pairedDirection = options.pairedMirroredX ? -1 : 1
    pairedAfter.x += (after.x - before.x) * sourceDirection / pairedDirection
  }
  if (patch.y !== undefined) pairedAfter.y += after.y - before.y
  if (patch.scaleX !== undefined) {
    pairedAfter.scaleX = clamp(pairedBefore.scaleX * after.scaleX / before.scaleX, .02, 4)
  }
  if (patch.scaleY !== undefined) {
    pairedAfter.scaleY = clamp(pairedBefore.scaleY * after.scaleY / before.scaleY, .02, 4)
  }
  if (patch.rotation !== undefined) {
    pairedAfter.rotation = clamp(pairedBefore.rotation - (after.rotation - before.rotation), -180, 180)
  }
  if (patch.flipX !== undefined) {
    pairedAfter.flipX = Boolean(pairedBefore.flipX) !== (Boolean(before.flipX) !== Boolean(after.flipX))
  }
  return { ...transforms, [layer]: after, [pairedLayer]: pairedAfter }
}

/** Updates PT pupil coordinates while leaving the normal expression transforms untouched. */
export function updateExpressionPtPupils(
  overrides: PtPupilOverrides,
  side: PtPupilSide,
  patch: PtPupilTransformPatch,
  options: {
    linked: boolean
    visibleTransforms: FaceExpressionTransforms
    mirroredX: Record<PtPupilSide, boolean>
  }
): PtPupilOverrides {
  const layer = side === 'left' ? 'pupilLeft' : 'pupilRight'
  const pairedSide = side === 'left' ? 'right' : 'left'
  const pairedLayer = pairedSide === 'left' ? 'pupilLeft' : 'pupilRight'
  const visible = options.visibleTransforms[layer]
  const before = overrides[side] ?? { x: visible.x, y: visible.y, rotation: visible.rotation }
  const after = { ...before, ...patch }
  const next: PtPupilOverrides = { ...overrides, [side]: after }
  if (!options.linked) return next

  const pairedVisible = options.visibleTransforms[pairedLayer]
  const pairedBefore = overrides[pairedSide] ?? {
    x: pairedVisible.x, y: pairedVisible.y, rotation: pairedVisible.rotation
  }
  const pairedAfter = { ...pairedBefore }
  if (patch.x !== undefined) {
    const sourceDirection = options.mirroredX[side] ? -1 : 1
    const pairedDirection = options.mirroredX[pairedSide] ? -1 : 1
    pairedAfter.x += (after.x - before.x) * sourceDirection / pairedDirection
  }
  if (patch.y !== undefined) pairedAfter.y += after.y - before.y
  if (patch.rotation !== undefined) pairedAfter.rotation -= after.rotation - before.rotation
  next[pairedSide] = pairedAfter
  return next
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
