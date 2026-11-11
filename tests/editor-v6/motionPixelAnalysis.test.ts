import { describe, expect, it } from 'vitest'
import { changedMotionPixelBounds, motionCropFromPixels, normalizedMotionReplacementBounds, unionMotionCrops, unionMotionPixelBounds } from '../../src/renderer/src/features/editorV6/motion/motionPixelAnalysis'

function rgba(width: number, height: number) {
  return new Uint8ClampedArray(width * height * 4)
}

function setPixel(pixels: Uint8ClampedArray, width: number, x: number, y: number, color: readonly [number, number, number, number]) {
  pixels.set(color, (y * width + x) * 4)
}

describe('Editor V6 motion pixel analysis', () => {
  it('finds inclusive bounds for RGB and alpha changes and returns undefined for identical frames', () => {
    const reference = rgba(4, 3)
    const next = reference.slice()
    setPixel(next, 4, 0, 2, [1, 0, 0, 0])
    setPixel(next, 4, 3, 0, [0, 0, 0, 1])

    expect(changedMotionPixelBounds(reference, next, 4, 3)).toEqual({ left: 0, top: 0, right: 3, bottom: 2 })
    expect(changedMotionPixelBounds(reference, reference, 4, 3)).toBeUndefined()
  })

  it('uses alpha strictly greater than the threshold and keeps the transparent fallback crop', () => {
    const pixels = rgba(4, 3)
    setPixel(pixels, 4, 1, 1, [0, 0, 0, 8])
    setPixel(pixels, 4, 3, 2, [0, 0, 0, 9])

    expect(motionCropFromPixels(pixels, 4, 3)).toEqual({ left: 3, top: 2, width: 1, height: 1 })
    expect(motionCropFromPixels(rgba(2, 2), 2, 2)).toEqual({ left: 0, top: 0, width: 1, height: 1 })
  })

  it('preserves the ordered RGBA fingerprint even when the crop is fully transparent', () => {
    const pixels = new Uint8ClampedArray([1, 2, 3, 0, 4, 5, 6, 0])
    expect(motionCropFromPixels(pixels, 2, 1, true)).toEqual({ left: 0, top: 0, width: 1, height: 1, fingerprint: 3438637464 })
  })

  it('pads and clips normalized replacement bounds against the atlas patch', () => {
    expect(normalizedMotionReplacementBounds(
      { left: 5, top: 6, right: 7, bottom: 8 },
      { left: 4, top: 4, right: 11, bottom: 11 }
    )).toEqual({ x: 0, y: 0, width: 0.75, height: 0.875 })
    expect(normalizedMotionReplacementBounds(
      { left: 5, top: 6, right: 7, bottom: 8 },
      { left: 0, top: 0, right: 20, bottom: 20 }, 0
    )).toEqual({ x: 5 / 21, y: 6 / 21, width: 3 / 21, height: 3 / 21 })
  })

  it('unites inclusive pixel bounds and rectangular crops', () => {
    expect(unionMotionPixelBounds(undefined, { left: 3, top: 4, right: 5, bottom: 6 })).toEqual({ left: 3, top: 4, right: 5, bottom: 6 })
    expect(unionMotionPixelBounds(
      { left: 3, top: 4, right: 5, bottom: 6 }, { left: 1, top: 5, right: 4, bottom: 8 }
    )).toEqual({ left: 1, top: 4, right: 5, bottom: 8 })
    expect(unionMotionCrops(
      { left: 3, top: 4, width: 3, height: 3 }, { left: 1, top: 5, width: 4, height: 4 }
    )).toEqual({ left: 1, top: 4, width: 5, height: 5 })
  })
})
