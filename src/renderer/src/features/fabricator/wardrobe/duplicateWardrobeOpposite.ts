import type { ModelPart, WardrobeComponent } from '../../../../../shared/fabricator'
import { modelRigSegmentKind, modelRigSide } from '../../../../../shared/modelRig'
import { fixWardrobeGlue } from '../../../../../shared/wardrobeGlue'

export function oppositeWardrobePart(component: WardrobeComponent, parts: readonly ModelPart[]): ModelPart | null {
  const source = parts.find((part) => part.id === component.attachedPartId)
  if (!source) return null
  const kind = modelRigSegmentKind(source.name)
  const side = modelRigSide(source.name)
  if (!kind || !side || kind === 'head') return null
  const matches = parts.filter((part) => modelRigSegmentKind(part.name) === kind && modelRigSide(part.name) === (side === 'left' ? 'right' : 'left'))
  return matches.length === 1 ? matches[0] : null
}

/** Copies image and placement to the matching source-sheet bone; existing pairs stay intact. */
export function duplicateWardrobeOpposite(component: WardrobeComponent, source: ModelPart, target: ModelPart, id: string, pairId: string): { original: WardrobeComponent; copy: WardrobeComponent } {
  const dx = target.x - source.x; const dy = target.y - source.y
  const side = modelRigSide(target.name)!
  const suffix = side === 'left' ? 'esquerda' : 'direita'
  const baseName = component.name.replace(/\s*(?:·|-)?\s*(?:esquerda|direita|esquerdo|direito)\s*$/i, '')
  const pairShoes = component.category === 'sapato' && !component.sleevePairId
  const original = pairShoes ? { ...component, sleevePairId: pairId, sleeveSide: modelRigSide(source.name)!, sleeveSegment: 'whole' as const } : component
  const { binding: _binding, sleevePairId: _pair, sleeveSegment: _segment, sleeveJointSplit: _split, jointCutOffsetRatio: _cut, ...base } = component
  const frame = component.deformationOriginalFrame
  let copy: WardrobeComponent = {
    ...base, id, name: `${baseName} · ${suffix}`, attachedPartId: target.id, sleeveSide: side,
    x: component.x + dx, y: component.y + dy,
    originX: (component.originX ?? component.x) + dx, originY: (component.originY ?? component.y) + dy,
    ...(frame ? { deformationOriginalFrame: { ...frame, x: frame.x + dx, y: frame.y + dy,
      ...(frame.originX !== undefined ? { originX: frame.originX + dx } : {}),
      ...(frame.originY !== undefined ? { originY: frame.originY + dy } : {}) } } : {}),
    ...(pairShoes ? { sleevePairId: pairId, sleeveSegment: 'whole' as const } : {}),
    glue: { version: 1, mode: 'loose', ...(component.glue?.explicitRelease ? { explicitRelease: true as const } : {}) }
  }
  if (component.glue?.mode === 'fixed' || (component.glue?.mode !== 'loose' && component.binding)) copy = fixWardrobeGlue(copy, target)
  return { original, copy }
}
