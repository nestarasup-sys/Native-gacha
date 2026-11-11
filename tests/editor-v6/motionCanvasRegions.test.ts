import { describe, expect, it, vi } from 'vitest'
import type { MotionPixelCrop } from '../../src/renderer/src/features/editorV6/motion/motionPixelAnalysis'
import { createChangedMotionPixelPatch, cropMotionCanvas, createTransparentMotionPatch, readMotionCanvasCrop } from '../../src/renderer/src/features/editorV6/motion/motionCanvasRegions'

type TestImageData = { width: number; height: number; data: Uint8ClampedArray }

function memoryCanvas(width: number, height: number, rgba = new Uint8ClampedArray(width * height * 4)) {
  const context = {
    getImageData: vi.fn((left: number, top: number, regionWidth: number, regionHeight: number): TestImageData => {
      const data = new Uint8ClampedArray(regionWidth * regionHeight * 4)
      for (let y = 0; y < regionHeight; y++) for (let x = 0; x < regionWidth; x++) {
        const from = ((top + y) * width + left + x) * 4, to = (y * regionWidth + x) * 4
        data.set(rgba.subarray(from, from + 4), to)
      }
      return { width: regionWidth, height: regionHeight, data }
    }),
    createImageData: vi.fn((imageWidth: number, imageHeight: number): TestImageData => ({ width: imageWidth, height: imageHeight, data: new Uint8ClampedArray(imageWidth * imageHeight * 4) })),
    putImageData: vi.fn(),
    drawImage: vi.fn()
  }
  return {
    canvas: { width, height, getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement,
    context
  }
}

function canvasFactory() {
  const made: ReturnType<typeof memoryCanvas>[] = []
  return {
    made,
    create: () => {
      const target = memoryCanvas(0, 0)
      made.push(target)
      return target.canvas
    }
  }
}

describe('Editor V6 motion canvas regions', () => {
  it('copies an exact RGBA changed region and extends edge texels into a two-pixel gutter', () => {
    const rgba = new Uint8ClampedArray(3 * 3 * 4)
    for (let pixel = 0; pixel < 9; pixel++) {
      rgba[pixel * 4] = pixel + 1
      rgba[pixel * 4 + 1] = pixel + 11
      rgba[pixel * 4 + 2] = pixel + 21
      rgba[pixel * 4 + 3] = pixel + 31
    }
    const source = memoryCanvas(3, 3, rgba), targets = canvasFactory()

    const patch = createChangedMotionPixelPatch(source.canvas, { left: 0, top: 1, right: 1, bottom: 2 }, targets.create)

    expect([patch.width, patch.height]).toEqual([6, 6])
    expect(source.context.getImageData).toHaveBeenCalledWith(0, 0, 3, 3)
    const image = targets.made[0]!.context.putImageData.mock.calls[0]![0] as TestImageData
    expect([image.width, image.height]).toEqual([6, 6])
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      const sourceX = Math.max(0, Math.min(2, x - 2)), sourceY = Math.max(0, Math.min(2, y - 1))
      const sourcePixel = sourceY * 3 + sourceX, targetOffset = (y * 6 + x) * 4
      expect([...image.data.slice(targetOffset, targetOffset + 4)]).toEqual([sourcePixel + 1, sourcePixel + 11, sourcePixel + 21, sourcePixel + 31])
    }
    expect(targets.made[0]!.context.putImageData).toHaveBeenCalledWith(image, 0, 0)
  })

  it('reads full-canvas pixels and forwards alpha threshold and fingerprint options', () => {
    const rgba = new Uint8ClampedArray(4 * 3 * 4)
    rgba[(1 * 4 + 2) * 4 + 3] = 11
    const source = memoryCanvas(4, 3, rgba)

    expect(readMotionCanvasCrop(source.canvas, false, 10)).toEqual({ left: 2, top: 1, width: 1, height: 1 })
    expect(source.context.getImageData).toHaveBeenCalledWith(0, 0, 4, 3)
  })

  it('preserves exact copy coordinates and transparent-gutter sizing', () => {
    const source = memoryCanvas(20, 30), targets = canvasFactory(), bounds: MotionPixelCrop = { left: 4, top: 7, width: 5, height: 3 }

    const patch = createTransparentMotionPatch(source.canvas, bounds, 2, targets.create)

    expect([patch.width, patch.height]).toEqual([9, 7])
    expect(targets.made[0]!.context.drawImage).toHaveBeenCalledWith(source.canvas, 4, 7, 5, 3, 2, 2, 5, 3)
  })

  it('crops a mouthless base to the exact requested rectangle', () => {
    const source = memoryCanvas(20, 30), targets = canvasFactory(), bounds: MotionPixelCrop = { left: 4, top: 7, width: 5, height: 3 }

    const crop = cropMotionCanvas(source.canvas, bounds, targets.create)

    expect([crop.width, crop.height]).toEqual([5, 3])
    expect(targets.made[0]!.context.drawImage).toHaveBeenCalledWith(source.canvas, 4, 7, 5, 3, 0, 0, 5, 3)
  })

  it('retains specific errors when a destination canvas has no 2D context', () => {
    const emptyCanvas = { width: 0, height: 0, getContext: vi.fn(() => null) } as unknown as HTMLCanvasElement
    expect(() => createTransparentMotionPatch(memoryCanvas(1, 1).canvas, { left: 0, top: 0, width: 1, height: 1 }, 2, () => emptyCanvas))
      .toThrow('Não foi possível preparar o recorte transparente da boca.')
    expect(() => cropMotionCanvas(memoryCanvas(1, 1).canvas, { left: 0, top: 0, width: 1, height: 1 }, () => emptyCanvas))
      .toThrow('Não foi possível preparar a base do personagem sem boca.')
  })
})
