import { mixStageElement } from '../videoCharacterInterpolation'
import { videoCharacterElementSize } from '../videoStageGeometry'
import type { StudioElement } from '../studio'
import type { VideoSceneFrame, VideoSceneLayer } from '../videoSceneIR'

export type PlannedSnapshotSprite = Readonly<{
  imageDataUrl: string
  element: Pick<StudioElement, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX'>
  opacity: number
}>

type ElementLayer = Extract<VideoSceneLayer, { type: 'element' }>

/**
 * Lightweight snapshot fallback for the new GPU preview. The canonical
 * evaluator already supplies the absolute transition; turn only the *visible*
 * character into a pair of persistent textures. No per-frame PNG generation,
 * pose prerender loop or mutation of the authored StudioDocument.
 *
 * This blends whole saved snapshots, NOT independent facial/PT sprites. The
 * catalog rig compositor is still required for exact mouth/blink/pupil parity.
 */
export function planSnapshotSprites(
  layer: ElementLayer,
  characters: VideoSceneFrame['characters']
): PlannedSnapshotSprite[] {
  const still = (imageDataUrl: string | undefined, element: StudioElement): PlannedSnapshotSprite[] => {
    if (!imageDataUrl) return []
    const size = videoCharacterElementSize(element)
    return [{ imageDataUrl, element: {
      x: element.x, y: element.y, width: size.width, height: size.height,
      rotation: element.rotation, flipX: element.flipX
    }, opacity: 1 }]
  }
  if (layer.kind !== 'character') return still(layer.assetDataUrl, layer.element)
  const character = characters.find(item => item.elementId === layer.element.id)
  const transition = character?.transition
  if (!transition) return still(layer.assetDataUrl, layer.element)

  const t = Math.max(0, Math.min(1, transition.easedProgress))
  // Match the canonical character interpolation for rotation (shortest arc),
  // character dimensions and the stage transform applied after interpolation.
  const geometry = { ...mixStageElement(transition.from.element, transition.to.element, t),
    ...character.stageTransform }
  const size = videoCharacterElementSize(geometry)
  const element = {
    x: geometry.x, y: geometry.y, width: size.width, height: size.height,
    rotation: geometry.rotation, flipX: geometry.flipX
  }
  const from = transition.from.imageDataUrl || layer.assetDataUrl
  const to = transition.to.imageDataUrl
  if (!from && !to) return []
  if (!from) return [{ imageDataUrl: to!, element, opacity: 1 }]
  if (!to || t <= 0 || from === to) return [{ imageDataUrl: from, element, opacity: 1 }]
  if (t >= 1) return [{ imageDataUrl: to, element, opacity: 1 }]
  return [
    { imageDataUrl: from, element, opacity: 1 - t },
    { imageDataUrl: to, element, opacity: t }
  ]
}
