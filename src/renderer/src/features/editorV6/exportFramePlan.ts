import { editorV6LayerVisualKeys, editorV6VisualKey } from '../../../../shared/editorV6Export'
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
  const activeHair = Boolean(hairAnimation && activeLayer !== 'background' && scene.elements.some(hasAnimatedHair))
  const reacting = Boolean(hairAnimation?.poseReactionOnly && activeHair && scene.elements.some(element =>
    hasAnimatedHair(element) && hairMotionPoseReactionIsActive(hairPoseReactionEnds.get(element.id) ?? [], frame)
  ))
  const hairNeedsFrame = activeHair && (!hairAnimation?.poseReactionOnly || reacting)
  const baseKey = editorV6VisualKey({ ...scene, mediaVideo: undefined, ...(hairNeedsFrame ? { hairAnimationFrame: frame } : {}) })
  const baseLayerKeys = editorV6LayerVisualKeys({ ...scene, ...(hairNeedsFrame ? { hairAnimationFrame: frame } : {}) })
  // Original visual keys omit some expression and effect properties. For a
  // resting pose reaction, retain the complete scene identity in both keys.
  const signature = hairAnimation?.poseReactionOnly ? JSON.stringify(scene.elements) : null
  const key = signature === null ? baseKey : JSON.stringify([baseKey, signature])
  const layerKeys = signature === null ? baseLayerKeys : {
    ...baseLayerKeys,
    foreground: JSON.stringify([baseLayerKeys.foreground, signature])
  }

  return { activeLayer, activeHair, reacting, hairNeedsFrame, key, layerKeys }
}
