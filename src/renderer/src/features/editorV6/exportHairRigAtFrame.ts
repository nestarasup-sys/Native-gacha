import { interpolateEditorV6HairMotionRig, type EditorV6HairMotionRig } from '../../../../shared/editorV6HairMotion'
import type { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { motionEase } from '../../../../shared/editorV6MotionInterpolation'
import type { createEditorV6ExportHairMotionPlanIndex } from './exportHairMotionPlanIndex'

type Scene = ReturnType<typeof resolveEditorV6SceneAtFrame>
type SceneElement = Scene['elements'][number]
type MotionPlanIndex = ReturnType<typeof createEditorV6ExportHairMotionPlanIndex>
type ResolvedHairRig = { rig: EditorV6HairMotionRig; crop?: EditorV6HairMotionRig['sourceCrop']; element: SceneElement }

/** Resolves export rig geometry from an authored frame and the prepared motion indexes. */
export function createEditorV6ExportHairRigAtFrame(index: MotionPlanIndex) {
  const hairRigAtFrame = (element: SceneElement, frame: number): ResolvedHairRig | undefined => {
    const elementId = element.id
    if (element.motionSprite) {
      const indexed = index.hairTransitionIndex.get(elementId, frame)
      const transition = indexed?.transition
      if (transition?.from && transition.to) {
        const sample = indexed?.poseSample
        const hairlessFrame = indexed?.atlasFrame
        if (sample && hairlessFrame) {
          return {
            rig: interpolateEditorV6HairMotionRig(transition.from, transition.to, motionEase(sample.progress)),
            crop: hairlessFrame.crop,
            element: { ...element, x: hairlessFrame.x, y: hairlessFrame.y, width: hairlessFrame.width, height: hairlessFrame.height, rotation: hairlessFrame.rotation, flipX: hairlessFrame.flipX }
          }
        }
      }
      const expressionPlan = index.expressionOnlyPlansByElement.get(elementId)?.find(plan => frame > plan.startFrame && frame < plan.endFrame)
      if (expressionPlan) {
        const rig = (expressionPlan.from.assetId ? index.hairRigs.get(`${elementId}:${expressionPlan.from.assetId}`) : undefined)
          ?? index.hairPoseRigs.get(`${elementId}:${expressionPlan.from.poseSlot ?? 'base'}`)
        if (rig) return { rig, element: expressionPlan.from }
      }
    }
    const rig = element.assetId ? index.hairRigs.get(`${element.id}:${element.assetId}`) : undefined
    return rig ? { rig, element } : undefined
  }

  return { hairRigAtFrame }
}
