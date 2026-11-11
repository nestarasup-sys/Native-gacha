import type { EditorV6Document } from '../../../../shared/editorV6'
import { hairMotionPoseReactionEndFrames } from '../../../../shared/hairMotionEngine'
import type { EditorV6HairMotionBundle, EditorV6HairMotionRig, EditorV6HairMotionTransition } from '../../../../shared/editorV6HairMotion'
import { editorV6MotionChangesHairGeometry, editorV6MotionHasCompleteFaceAtlas, editorV6MotionPlans } from '../../../../shared/editorV6Motion'
import { createExportHairTransitionFrameIndex } from './exportHairTransitionIndex'

type MotionPlan = ReturnType<typeof editorV6MotionPlans>[number]
type IndexedHairTransition = {
  elementId: string
  key: string
  startFrame: number
  endFrame: number
  samples: MotionPlan['samples']
  from?: EditorV6HairMotionRig
  to?: EditorV6HairMotionRig
  physicsFrom?: EditorV6HairMotionRig
  physicsTo?: EditorV6HairMotionRig
  fromElement: MotionPlan['from']
  toElement: MotionPlan['to']
  atlas?: EditorV6HairMotionTransition
}

/** Pre-indexes motion plans and prepared hair assets once for an export worker. */
export function createEditorV6ExportHairMotionPlanIndex(project: EditorV6Document, hairAnimation?: EditorV6HairMotionBundle) {
  const hairRigs = new Map((hairAnimation?.rigs ?? []).map((rig) => [`${rig.elementId}:${rig.assetId}`, rig]))
  const hairPoseRigs = new Map<string, EditorV6HairMotionRig>()
  for (const rig of hairAnimation?.rigs ?? []) {
    const key = `${rig.elementId}:${rig.poseSlot ?? 'base'}`
    if (!hairPoseRigs.has(key)) hairPoseRigs.set(key, rig)
  }
  const hairRigForElement = (element: { id: string; assetId?: string; poseSlot?: number | null }) => {
    const direct = element.assetId ? hairRigs.get(`${element.id}:${element.assetId}`) : undefined
    const poseSlot = element.poseSlot ?? direct?.poseSlot
    return hairPoseRigs.get(`${element.id}:${poseSlot ?? 'base'}`) ?? direct
  }

  const motionBlocks = new Map(project.timeline.tracks.flatMap((track) => track.blocks.map((block) => [block.id, block] as const)))
  const motionPlans = editorV6MotionPlans(project)
  const transitions: IndexedHairTransition[] = []
  const preparedTransitions = new Map((hairAnimation?.motionTransitions ?? []).map((transition) => [`${transition.elementId}:${transition.key}`, transition]))
  const expressionOnlyPlansByElement = new Map<string, typeof motionPlans>()
  for (const plan of motionPlans) {
    // One-shot pose reaction keeps the canonical full-character motion atlas;
    // it needs end-of-pose events, not interpolated hairless layers.
    if (hairAnimation?.poseReactionOnly || motionBlocks.get(plan.blockId)?.incomingMotion?.key !== plan.key) continue
    // Face-only plans keep their normal motionSprite and face atlas. They must
    // not replace an in-flight hair pose atlas.
    if (!editorV6MotionChangesHairGeometry(plan)) {
      if (editorV6MotionHasCompleteFaceAtlas(plan, motionBlocks.get(plan.blockId)?.incomingMotion)) {
        const entries = expressionOnlyPlansByElement.get(plan.elementId) ?? []
        entries.push(plan)
        expressionOnlyPlansByElement.set(plan.elementId, entries)
      }
      continue
    }
    const from = plan.from.assetId ? hairRigs.get(`${plan.elementId}:${plan.from.assetId}`) : undefined
    const to = plan.to.assetId ? hairRigs.get(`${plan.elementId}:${plan.to.assetId}`) : undefined
    transitions.push({
      elementId: plan.elementId,
      key: plan.key,
      startFrame: plan.startFrame,
      endFrame: plan.endFrame,
      samples: plan.samples,
      from,
      to,
      physicsFrom: hairRigForElement(plan.from),
      physicsTo: hairRigForElement(plan.to),
      fromElement: plan.from,
      toElement: plan.to,
      atlas: preparedTransitions.get(`${plan.elementId}:${plan.key}`)
    })
  }

  // Keep the first eligible prepared transition when authored ranges overlap.
  const hairTransitionIndex = createExportHairTransitionFrameIndex(transitions)
  // Reactions use timeline plans even when the UI export has no prepared atlas.
  const hairPoseReactionEnds = hairAnimation?.poseReactionOnly
    ? hairMotionPoseReactionEndFrames(motionPlans.map((plan) => ({ elementId: plan.elementId, endFrame: plan.endFrame, fromElement: plan.from, toElement: plan.to })))
    : new Map<string, number[]>()

  return {
    hairRigs,
    hairPoseRigs,
    hairRigForElement,
    expressionOnlyPlansByElement,
    hairTransitionIndex,
    hairPoseReactionEnds,
    transitionForFrame: (elementId: string, frame: number) => hairTransitionIndex.get(elementId, frame)?.transition
  }
}
