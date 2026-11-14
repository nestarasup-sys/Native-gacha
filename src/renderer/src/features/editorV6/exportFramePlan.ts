import { editorV6CompleteVisualKeys, editorV6VisualKeys } from '../../../../shared/editorV6Export'
import type { EditorV6HairMotionBundle } from '../../../../shared/editorV6HairMotion'
import { hairMotionPoseReactionIsActive } from '../../../../shared/hairMotionEngine'
import type { EditorV6ResolvedScene } from '../../../../shared/editorV6TimelineScene'

type EditorV6ExportFrameLayer = 'background' | 'foreground' | undefined

type ResolveEditorV6ExportFramePlanOptions = {
  scene: EditorV6ResolvedScene
  frame: number
  requestedLayer?: 'background' | 'foreground'
  layeredVideo: boolean
  hairAnimation?: Pick<EditorV6HairMotionBundle, 'poseReactionOnly'>
  hairPoseReactionEnds: ReadonlyMap<string, readonly number[]>
  hasAnimatedHair: (element: EditorV6ResolvedScene['elements'][number]) => boolean
}

/** Resolves per-frame hair activity and visual cache keys for export rendering. */
export function resolveEditorV6ExportFramePlan({
  scene,
  frame,
  requestedLayer,
  layeredVideo,
  hairAnimation,
  hairPoseReactionEnds,
  hasAnimatedHair
}: ResolveEditorV6ExportFramePlanOptions) {
  const activeLayer: EditorV6ExportFrameLayer = layeredVideo ? requestedLayer ?? 'background' : undefined
  const riggedElementIds = new Set<string>()
  let reacting = false
  if (hairAnimation && activeLayer !== 'background') {
    for (const element of scene.elements) {
      if (!hasAnimatedHair(element)) continue
      riggedElementIds.add(element.id)
      if (hairAnimation.poseReactionOnly && !reacting) {
        reacting = hairMotionPoseReactionIsActive(hairPoseReactionEnds.get(element.id) ?? [], frame)
      }
    }
  }
  const activeHair = riggedElementIds.size > 0
  const hairNeedsFrame = activeHair && (!hairAnimation?.poseReactionOnly || reacting)
  const keyScene = { ...scene, mediaVideo: undefined, ...(hairNeedsFrame ? { hairAnimationFrame: frame } : {}) }
  // Pose-reaction frames also depend on expression/effect fields outside the
  // compact projection, so serialize the complete element state once.
  const visualKeys = hairAnimation?.poseReactionOnly
    ? editorV6CompleteVisualKeys(keyScene)
    : editorV6VisualKeys(keyScene)

  return { activeLayer, activeHair, riggedElementIds, reacting, hairNeedsFrame, key: visualKeys.key, layerKeys: visualKeys.layerKeys }
}
