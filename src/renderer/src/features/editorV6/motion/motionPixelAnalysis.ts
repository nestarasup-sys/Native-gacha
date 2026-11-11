import { editorV6AlphaCropBounds } from './motionAlphaCrop'

export type MotionPixelBounds = { left: number; top: number; right: number; bottom: number }
export type MotionPixelCrop = { left: number; top: number; width: number; height: number; fingerprint?: number }

/** Returns the inclusive rectangle containing every RGBA difference. */
export function changedMotionPixelBounds(reference: Uint8ClampedArray, next: Uint8ClampedArray, width: number, height: number): MotionPixelBounds | undefined {
  let left = width, right = -1, top = height, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    if (!motionPixelChanged(reference, next, offset, offset)) continue
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  return right < left ? undefined : { left, top, right, bottom }
}

function motionPixelChanged(reference: Uint8ClampedArray, next: Uint8ClampedArray, referenceOffset: number, nextOffset: number): boolean {
  return reference[referenceOffset] !== next[nextOffset] || reference[referenceOffset + 1] !== next[nextOffset + 1]
    || reference[referenceOffset + 2] !== next[nextOffset + 2] || reference[referenceOffset + 3] !== next[nextOffset + 3]
}

/** Calculates an alpha crop, optionally preserving the historical ordered RGBA fingerprint. */
export function motionCropFromPixels(pixels: Uint8ClampedArray, width: number, height: number, fingerprint = false, alphaThreshold = 8): MotionPixelCrop {
  if (!fingerprint) return editorV6AlphaCropBounds(pixels, width, height, alphaThreshold)

  let left = width, right = -1, top = height, bottom = -1
  let hash = 2166136261
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    if (pixels[offset + 3] > alphaThreshold) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
    for (let channel = 0; channel < 4; channel++) hash = Math.imul(hash ^ pixels[offset + channel], 16777619)
  }
  if (right < left) return { left: 0, top: 0, width: 1, height: 1, fingerprint: hash >>> 0 }
  return { left, top, width: right - left + 1, height: bottom - top + 1, fingerprint: hash >>> 0 }
}

export function normalizedMotionReplacementBounds(changed: MotionPixelBounds, patch: MotionPixelBounds, padding = 2) {
  const left = Math.max(patch.left, changed.left - padding), top = Math.max(patch.top, changed.top - padding)
  const right = Math.min(patch.right, changed.right + padding), bottom = Math.min(patch.bottom, changed.bottom + padding)
  const width = patch.right - patch.left + 1, height = patch.bottom - patch.top + 1
  return { x: (left - patch.left) / width, y: (top - patch.top) / height,
    width: (right - left + 1) / width, height: (bottom - top + 1) / height }
}

export function unionMotionPixelBounds(current: MotionPixelBounds | undefined, next: MotionPixelBounds): MotionPixelBounds {
  return current ? { left: Math.min(current.left, next.left), top: Math.min(current.top, next.top), right: Math.max(current.right, next.right), bottom: Math.max(current.bottom, next.bottom) } : next
}

export function unionMotionCrops(left: MotionPixelCrop, right: MotionPixelCrop): MotionPixelCrop {
  const x = Math.min(left.left, right.left), y = Math.min(left.top, right.top)
  return { left: x, top: y, width: Math.max(left.left + left.width, right.left + right.width) - x, height: Math.max(left.top + left.height, right.top + right.height) - y }
}
