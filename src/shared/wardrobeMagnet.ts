/** Optional snap guides in the ORIGINAL unmounted sheet. No bone or PNG writes. */
import type { ModelPart, WardrobeComponent } from './fabricator'
import { wardrobeSourceFrame } from './wardrobeGlue.ts'

type Point = { x: number; y: number }
export type WardrobeMagnetResult = { x: number; y: number; snappedX: boolean; snappedY: boolean; targetId: string }

function closestEdge(position: number, size: number, targetPosition: number, targetSize: number, threshold: number): number {
  const candidates = [0, size / 2, size].flatMap(offset =>
    [0, targetSize / 2, targetSize].map(to => targetPosition + to - position - offset))
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate) < Math.abs(best) && Math.abs(candidate) <= threshold ? candidate : best, threshold + 1)
}

/** Does not establish a binding. Snap hints adjust x/y only and respect a fixed target ID. */
export function snapWardrobePlacement(
  component: Pick<WardrobeComponent, 'x' | 'y' | 'width' | 'height'>,
  target: ModelPart | undefined,
  threshold = 12
): WardrobeMagnetResult | null {
  if (!target || !Number.isFinite(threshold) || threshold <= 0 || threshold > 100) return null
  const frame = wardrobeSourceFrame(target)
  if (![component.x,component.y,component.width,component.height,frame.x,frame.y,frame.width,frame.height].every(Number.isFinite)
      || component.width <= 0 || component.height <= 0 || frame.width <= 0 || frame.height <= 0) return null
  const dx = closestEdge(component.x,component.width,frame.x,frame.width,threshold)
  const dy = closestEdge(component.y,component.height,frame.y,frame.height,threshold)
  const snappedX = Math.abs(dx) <= threshold
  const snappedY = Math.abs(dy) <= threshold
  if (!snappedX && !snappedY) return null
  return { x: component.x + (snappedX ? dx : 0), y: component.y + (snappedY ? dy : 0),
    snappedX, snappedY, targetId: target.id }
}

/** Magnetic UI may identify a body limb by ID but must not override manual placement. */
export function magneticGuides(result: WardrobeMagnetResult | null): Point | null {
  return result ? { x: result.x, y: result.y } : null
}
