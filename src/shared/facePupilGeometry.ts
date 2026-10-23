/**
 * Shared inverse of the face editor pupil preview projection.
 *
 * The eye's CSS element is rotated, and the mask can be flipped. Its inner
 * pupil offset is divided by that flip factor, so the visual displacement
 * is screenRotation * [mirroredSourceX ? -x : x, y]. Do not apply the eye flip
 * a second time: that is what made right pupils jump backwards.
 *
 * Mouse movement is intentionally unbounded. The eye mask clips pixels, not
 * authoring coordinates. This keeps Olhos DEV and Presets DEV consistent.
 */
export type PupilDragMapping = {
  rotationDegrees: number
  mirrorSourceX: boolean
  modelPerPixelX: number
  modelPerPixelY: number
}
export function pupilScreenOffset(x: number, y: number, rotationDegrees: number, mirrorSourceX: boolean) {
  const radians=rotationDegrees*Math.PI/180
  const localX=x*(mirrorSourceX?-1:1)
  return {x:localX*Math.cos(radians)-y*Math.sin(radians),
    y:localX*Math.sin(radians)+y*Math.cos(radians)}
}
export function pupilDeltaFromDrag(dxPixels: number, dyPixels: number, mapping: PupilDragMapping) {
  const {rotationDegrees,mirrorSourceX,modelPerPixelX,modelPerPixelY}=mapping
  if (![dxPixels,dyPixels,rotationDegrees,modelPerPixelX,modelPerPixelY].every(Number.isFinite)
    || modelPerPixelX<=0 || modelPerPixelY<=0) throw Error('Movimento de pupila inválido.')
  const x=dxPixels*modelPerPixelX,y=dyPixels*modelPerPixelY
  const radians=rotationDegrees*Math.PI/180
  return {x:(x*Math.cos(radians)+y*Math.sin(radians))*(mirrorSourceX?-1:1),
    y:-x*Math.sin(radians)+y*Math.cos(radians)}
}
/** A physical-right asset is already oriented on the right. Otherwise the
 * same source image is mirrored for the right eye. */
export function pupilSourceMirrored(side: 'left'|'right',rightSidePositioned: boolean): boolean {
  return side==='right' && !rightSidePositioned
}
