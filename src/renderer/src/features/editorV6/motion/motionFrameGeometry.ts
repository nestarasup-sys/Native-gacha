import type { EditorV6Element } from '../../../../../shared/editorV6'
import { motionAngle, motionLerp } from '../../../../../shared/editorV6MotionInterpolation'
import { motionEndpointScale } from './motionEndpointScale'
import type { MotionPixelCrop } from './motionPixelAnalysis'

export type MotionElementScale = { x: number; y: number }
export type MotionElementScalePair = { from: MotionElementScale; to: MotionElementScale }

/** Resolves endpoint scales and preserves the historical fallback for legacy actors without source-canvas width. */
export function resolveEditorV6MotionElementScales(
  from: EditorV6Element,
  to: EditorV6Element,
  fromCrop: MotionPixelCrop,
  toCrop: MotionPixelCrop
): MotionElementScalePair {
  const sharedCharacterCanvasWidth = from.characterCanvasWidth ?? to.characterCanvasWidth
  const fromScale = motionEndpointScale(from, fromCrop)
  let toScale = motionEndpointScale(to, toCrop)
  const sameLegacyElementSize = !sharedCharacterCanvasWidth
    && from.width === to.width && from.height === to.height
    && (from.characterScale ?? 100) === (to.characterScale ?? 100)
    && (from.characterWidthScale ?? 100) === (to.characterWidthScale ?? 100)
    && (from.characterHeightScale ?? 100) === (to.characterHeightScale ?? 100)
  if (sameLegacyElementSize) toScale = fromScale
  return { from: fromScale, to: toScale }
}

type InterpolateMotionFrameGeometryOptions = {
  from: EditorV6Element
  to: EditorV6Element
  fromCrop: MotionPixelCrop
  toCrop: MotionPixelCrop
  endpointScales: MotionElementScalePair
  crop: MotionPixelCrop
  progress: number
}

export type MotionFrameGeometry = { x: number; y: number; width: number; height: number; rotation: number; flipX: boolean }

/** Maps a rendered crop to its interpolated timeline rectangle and rotation. */
export function interpolateEditorV6MotionFrameGeometry({
  from,
  to,
  fromCrop,
  toCrop,
  endpointScales,
  crop,
  progress
}: InterpolateMotionFrameGeometryOptions): MotionFrameGeometry {
  const sx = motionLerp(endpointScales.from.x, endpointScales.to.x, progress)
  const sy = motionLerp(endpointScales.from.y, endpointScales.to.y, progress)
  const originX = motionLerp(-(fromCrop.left + fromCrop.width / 2) * endpointScales.from.x, -(toCrop.left + toCrop.width / 2) * endpointScales.to.x, progress)
  const originY = motionLerp(-(fromCrop.top + fromCrop.height / 2) * endpointScales.from.y, -(toCrop.top + toCrop.height / 2) * endpointScales.to.y, progress)
  const rotation = motionAngle(from.rotation, to.rotation, progress)
  const flipX = Boolean(progress < .5 ? from.flipX : to.flipX)
  const dx = (originX + (crop.left + crop.width / 2) * sx) * (flipX ? -1 : 1)
  const dy = originY + (crop.top + crop.height / 2) * sy
  const radians = rotation * Math.PI / 180
  return {
    x: motionLerp(from.x, to.x, progress) + (dx * Math.cos(radians) - dy * Math.sin(radians)) / 19.2,
    y: motionLerp(from.y, to.y, progress) + (dx * Math.sin(radians) + dy * Math.cos(radians)) / 10.8,
    width: crop.width * sx / 19.2,
    height: crop.height * sy / 10.8,
    rotation,
    flipX
  }
}
