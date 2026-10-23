/** Conservative structural diagnostics for saved poses, never a visual pass/fail. */
import type { FabricatorPose, FabricatorProject, WardrobeSet } from './fabricator'
import { wardrobeGlueState } from './wardrobeGlue.ts'
import { mapWardrobeComponentToPose, wardrobePosePadding } from './wardrobePose.ts'

export type WardrobePoseAuditResult = {
  slot: number
  name: string
  status: 'ok' | 'attention' | 'incompatible'
  warnings: string[]
  checkedComponents: number
}

/** Does not render, mutate or write. Large deformations produce warnings, not claims of visual failure. */
export function inspectWardrobePose(model: FabricatorProject, set: WardrobeSet, pose: FabricatorPose): WardrobePoseAuditResult {
  const warnings: string[] = []
  let incompatible = false
  const source = new Map(model.parts.map(part => [part.id, part]))
  const posed = new Map(pose.parts.map(part => [part.id, part]))
  if (pose.sourceModelSlot !== model.slot) { incompatible = true; warnings.push('Pose pertence a outro modelo.') }
  if (pose.sourceModelUpdatedAt !== model.updatedAt) warnings.push('Pose salva em outra revisão do modelo.')
  for(const component of set.components) {
    const base = source.get(component.attachedPartId)
    const bone = posed.get(component.attachedPartId)
    if (!base || !bone) {
      incompatible = true
      warnings.push(`${component.name}: parte do corpo não encontrada na pose ou no modelo.`)
      continue
    }
    const state = wardrobeGlueState(component,base)
    if (state === 'orphan' || state === 'loose') {
      incompatible = true
      warnings.push(`${component.name}: roupa não fixada à parte corporal.`)
      continue
    }
    if (state === 'stale') warnings.push(`${component.name}: grude requer revisão da origem.`)
    const { kneeOverlap,edgePadding } = wardrobePosePadding(component,set.components)
    const transform = mapWardrobeComponentToPose(component,base,bone,kneeOverlap,edgePadding)
    const numbers = [...[transform.localLeft,transform.localTop,transform.renderWidth,transform.renderHeight,transform.scaleX,transform.scaleY],
      ...transform.matrix.slice(7,-1).split(',').map(Number)]
    if (!numbers.every(Number.isFinite)) {
      incompatible = true
      warnings.push(`${component.name}: transformação numérica inválida.`)
      continue
    }
    const sourceWidth = component.glue?.sourceFrame?.width ?? base.sourceTransform?.width ?? base.width
    const sourceHeight = component.glue?.sourceFrame?.height ?? base.sourceTransform?.height ?? base.height
    const factorX = bone.width / Math.max(1,sourceWidth)
    const factorY = bone.height / Math.max(1,sourceHeight)
    if (factorX > 3 || factorY > 3 || factorX < .25 || factorY < .25) {
      warnings.push(`${component.name}: a pose redimensiona muito a parte corporal.`)
    }
    const localDistance = Math.hypot(transform.localLeft + transform.renderWidth/2,
      transform.localTop + transform.renderHeight/2)
    const boneDiagonal = Math.hypot(Math.max(1,sourceWidth),Math.max(1,sourceHeight))
    if (localDistance > 2.5*boneDiagonal) {
      warnings.push(`${component.name}: encaixe muito afastado da parte corporal.`)
    }
  }
  return {slot:pose.slot,name:pose.name,status:incompatible?'incompatible':warnings.length?'attention':'ok',
    warnings,checkedComponents:set.components.length}
}
