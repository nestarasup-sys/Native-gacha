/**
 * Experimental, read-only scene draw plan for a very restricted raster subset.
 * No renderer consumes this output in production. Its only purpose is to give
 * native/Canvas/GPU experiments the same frame geometry as the Editor V6 SVG.
 *
 * A nonempty unsupported list MUST prohibit using a native backend.
 * This does not promise RGBA parity even for an apparently supported scene:
 * pixel parity is a separate, required qualification step.
 */
import type { EditorV6ResolvedScene } from './editorV6TimelineScene'
import { editorV6ElementSize } from './editorV6SceneModel'

export type EditorV6DrawSprite = Readonly<{
  id: string
  assetId: string
  sourceKind: 'character' | 'image'
  centerX: number
  centerY: number
  width: number
  height: number
  rotationDegrees: number
  flipX: boolean
  /** Source atlas crop; rendered into the same destination rect as the SVG viewport. */
  sourceRect?: Readonly<{ x: number; y: number; width: number; height: number; atlasWidth: number; atlasHeight: number }>
}>
export type EditorV6DrawPlanBlocker = Readonly<{
  elementId: string | null
  feature: 'animated-hair' | 'video' | 'background-image' | 'unsupported-element'
    | 'missing-asset' | 'motion-sprite' | 'mouth-patch' | 'invalid-geometry'
}>
export type EditorV6ExperimentalDrawPlan = Readonly<{
  schemaVersion: 1
  frame: number
  backgroundColor: string
  commands: ReadonlyArray<EditorV6DrawSprite>
  unsupported: ReadonlyArray<EditorV6DrawPlanBlocker>
  /** Even if true, a renderer still needs pixel parity before production use. */
  geometryOnlyCandidate: boolean
}>

/**
 * Explicit hair input is mandatory: the ordinary resolved scene has no flag
 * telling us whether export-only dynamic hair is active.
 */
export function createEditorV6ExperimentalDrawPlan(
  scene: EditorV6ResolvedScene,
  context: { animatedHair: boolean }
): EditorV6ExperimentalDrawPlan {
  const unsupported: EditorV6DrawPlanBlocker[] = []
  const commands: EditorV6DrawSprite[] = []
  const block = (elementId: string | null, feature: EditorV6DrawPlanBlocker['feature']) => {
    unsupported.push({ elementId, feature })
  }
  if (context.animatedHair) block(null, 'animated-hair')
  if (scene.mediaVideo) block(null, 'video')
  if (scene.background.backgroundAssetId) block(null, 'background-image')

  for (const element of scene.elements) {
    if (element.kind !== 'image' && element.kind !== 'character') {
      block(element.id, 'unsupported-element')
      continue
    }
    if (!element.assetId) { block(element.id, 'missing-asset'); continue }
    if (element.motionSprite && (element.kind !== 'character' || element.mouthPatch)) { block(element.id, 'motion-sprite'); continue }
    if (element.mouthPatch) { block(element.id, 'mouth-patch'); continue }

    const size = editorV6ElementSize(element)
    const centerX = (50 + element.x) * 19.2, centerY = (50 + element.y) * 10.8
    const width = size.width * 19.2, height = size.height * 10.8
    if (![centerX, centerY, width, height, element.rotation].every(Number.isFinite)
      || width <= 0 || height <= 0) {
      block(element.id, 'invalid-geometry')
      continue
    }
    // SceneSurface uses identical stage-unit conversion, order, rotation and
    // horizontal mirroring; neither faces nor raw pixels are created here.
    commands.push({
      id: element.id, assetId: element.assetId, sourceKind: element.kind,
      centerX, centerY, width, height,
      rotationDegrees: element.rotation, flipX: Boolean(element.flipX),
      ...(element.motionSprite ? { sourceRect: { ...element.motionSprite } } : {})
    })
  }

  return {
    schemaVersion: 1, frame: scene.frame,
    backgroundColor: scene.background.backgroundColor,
    commands, unsupported,
    geometryOnlyCandidate: unsupported.length === 0
  }
}
