import type { FabricatorProject, WardrobeComponent } from '../../../../../shared/fabricator'
import { bindWardrobeComponent } from '../../../../../shared/wardrobePose.ts'

function sameBinding(
  current: WardrobeComponent['binding'],
  expected: NonNullable<WardrobeComponent['binding']>
): boolean {
  return current?.boneId === expected.boneId
    && Math.abs(current.localCenterX - expected.localCenterX) < 0.00001
    && Math.abs(current.localCenterY - expected.localCenterY) < 0.00001
    && Math.abs(current.widthRatio - expected.widthRatio) < 0.00001
    && Math.abs(current.heightRatio - expected.heightRatio) < 0.00001
    && Math.abs(current.relativeRotation - expected.relativeRotation) < 0.00001
    && Math.abs(current.boneWidth - expected.boneWidth) < 0.00001
    && Math.abs(current.boneHeight - expected.boneHeight) < 0.00001
    && Math.abs(current.boneRotation - expected.boneRotation) < 0.00001
}

export function rebindWardrobeComponents(
  components: WardrobeComponent[],
  reference: FabricatorProject
): { components: WardrobeComponent[]; changed: boolean } {
  const bones = new Map(reference.parts.map((part) => [part.id, part]))
  let changed = false
  const rebound = components.map((component) => {
    const bone = bones.get(component.attachedPartId)
    if (!bone || component.glue?.mode === 'fixed' || component.glue?.mode === 'loose') return component
    const expected = bindWardrobeComponent(component, bone)
    if (sameBinding(component.binding, expected)) return component
    changed = true
    return { ...component, binding: expected }
  })
  return { components: changed ? rebound : components, changed }
}
