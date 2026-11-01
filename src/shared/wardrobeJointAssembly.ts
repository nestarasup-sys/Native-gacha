import type { ModelPart } from './fabricator'

export type WardrobeJointAssemblyPoint = { x: number; y: number }

/** Position a lower limb segment at its assembled-model offset from the upper segment. */
export function wardrobeJointAssemblyOffset(
  sourceUpper: Pick<ModelPart, 'x' | 'y' | 'width' | 'height'>,
  sourceLower: Pick<ModelPart, 'x' | 'y' | 'width' | 'height'>,
  mountedUpper: Pick<ModelPart, 'x' | 'y' | 'width' | 'height'>,
  mountedLower: Pick<ModelPart, 'x' | 'y' | 'width' | 'height'>
): WardrobeJointAssemblyPoint {
  const sourceUpperCenter = { x: sourceUpper.x + sourceUpper.width / 2, y: sourceUpper.y + sourceUpper.height / 2 }
  const sourceLowerCenter = { x: sourceLower.x + sourceLower.width / 2, y: sourceLower.y + sourceLower.height / 2 }
  const mountedUpperCenter = { x: mountedUpper.x + mountedUpper.width / 2, y: mountedUpper.y + mountedUpper.height / 2 }
  const mountedLowerCenter = { x: mountedLower.x + mountedLower.width / 2, y: mountedLower.y + mountedLower.height / 2 }
  return {
    x: sourceUpperCenter.x + mountedLowerCenter.x - mountedUpperCenter.x - sourceLowerCenter.x,
    y: sourceUpperCenter.y + mountedLowerCenter.y - mountedUpperCenter.y - sourceLowerCenter.y
  }
}
