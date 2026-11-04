import { describe, expect, it } from 'vitest'
import { editorV6AlphaCropBounds } from '../../src/renderer/src/features/editorV6/motion/motionAlphaCrop'

function oldCrop(pixels: Uint8ClampedArray, width: number, height: number, threshold: number) {
  let left = width, right = -1, top = height, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    if (pixels[offset + 3] > threshold) {
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return right < left ? { left: 0, top: 0, width: 1, height: 1 }
    : { left, top, width: right - left + 1, height: bottom - top + 1 }
}

describe('Editor V6 first-export alpha crop parity', () => {
  it('preserves strict threshold, empty crop, borders and 1x1 corners', () => {
    const width = 19, height = 13, data = new Uint8ClampedArray(width * height * 4)
    expect(editorV6AlphaCropBounds(data, width, height)).toEqual(oldCrop(data, width, height, 8))
    data[3] = 8
    data[(width * height - 1) * 4 + 3] = 9
    expect(editorV6AlphaCropBounds(data, width, height)).toEqual({ left: 18, top: 12, width: 1, height: 1 })
    data[3] = 255
    expect(editorV6AlphaCropBounds(data, width, height)).toEqual({ left: 0, top: 0, width: width, height: height })
    expect(editorV6AlphaCropBounds(data, width, height, 255)).toEqual({ left: 0, top: 0, width: 1, height: 1 })
  })

  it('matches the original pixel loop on 100 deterministic dense/sparse/transparent frames', () => {
    let seed = 0x14d3ba91
    const next = () => {
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return seed >>> 0
    }
    const width = 193, height = 127
    for (let frame = 0; frame < 100; frame++) {
      const pixels = new Uint8ClampedArray(width * height * 4)
      const density = frame % 4
      for (let i = 0; i < width * height; i++) {
        const value = next()
        pixels[i * 4] = value & 255
        pixels[i * 4 + 1] = (value >>> 8) & 255
        pixels[i * 4 + 2] = (value >>> 16) & 255
        pixels[i * 4 + 3] = density === 0 ? 0
          : density === 1 ? ((value % 1024) === 0 ? 255 : 0)
            : density === 2 ? ((value % 100) < 90 ? 254 : 0)
              : (value >>> 24)
      }
      for (const threshold of [0, 8, 32, 127, 254, 255]) {
        expect(editorV6AlphaCropBounds(pixels, width, height, threshold)).toEqual(oldCrop(pixels, width, height, threshold))
      }
    }
  })

  it('matches the original on a large actor with transparent margins and antialiased edges', () => {
    const width = 960, height = 1280, rgba = new Uint8ClampedArray(width * height * 4)
    for (let y = 250; y < 1150; y++) for (let x = 180; x < 790; x++) {
      const distance = Math.min(x - 180, 789 - x, y - 250, 1149 - y)
      rgba[(y * width + x) * 4 + 3] = distance < 5 ? 8 + distance : 255
    }
    for (const threshold of [0, 8, 12, 128]) {
      expect(editorV6AlphaCropBounds(rgba, width, height, threshold)).toEqual(oldCrop(rgba, width, height, threshold))
    }
  })
})
