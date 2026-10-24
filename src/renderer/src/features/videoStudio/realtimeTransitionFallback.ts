import type { StudioElement } from '../../../../shared/studio'
import { mixStageElement, smoothProgress, transitionProgress } from '../../../../shared/videoCharacterInterpolation'
import type { CharacterTransition } from './characterTransitions'

/**
 * Instant, deterministic visual fallback when the real Gacha render is slower
 * than a 15-frame animation window. Uses the *authored* start/end snapshots;
 * never renders a different pose/preset or writes an approximate frame to disk.
 *
 * Geometry follows the exact stage interpolation curve. Artwork is a two-layer
 * alpha dissolve (not articulated pose morphing) and is preview-only.
 */
export type RealtimeTransitionFallback = Readonly<{
  element: StudioElement
  fromImageDataUrl: string
  toImageDataUrl: string
  progress: number
}>

export function evaluateRealtimeTransitionFallback(
  transition: CharacterTransition,
  frame: number,
): RealtimeTransitionFallback | null {
  if (!(frame > transition.startFrame && frame < transition.boundaryFrame)) return null
  const progress = smoothProgress(transitionProgress(transition, frame))
  return {
    element: mixStageElement(transition.from.element, transition.to.element, progress),
    fromImageDataUrl: transition.from.imageDataUrl,
    toImageDataUrl: transition.to.imageDataUrl,
    progress,
  }
}
