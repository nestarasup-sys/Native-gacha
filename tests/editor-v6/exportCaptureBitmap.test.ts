import { describe, expect, it, vi } from 'vitest'
import { captureEditorV6FrameBitmap } from '../../electron/domains/editorV6/exportCaptureBitmap'

function makeCapture(width: number, height: number, token: number, padding = 24) {
  const stride = width + padding
  const bytes = Buffer.alloc(stride * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * stride + x) * 4
    bytes[offset] = (y * 17 + x) & 255
    bytes[offset + 1] = (y * 3 + x * 7) & 255
    bytes[offset + 2] = (x * 11 + y * 13) & 255
    bytes[offset + 3] = 255
  }
  for (let bit = 0; bit < 24; bit++) {
    const x = width + (bit % 6) * 4 + 2
    const y = Math.floor(bit / 6) * 4 + 2
    const index = (y * stride + x) * 4
    bytes[index] = bytes[index + 1] = bytes[index + 2] = (token >>> bit) & 1 ? 255 : 0
    bytes[index + 3] = 255
  }
  const image = {
    getSize: vi.fn(() => ({ width: stride, height })),
    toBitmap: vi.fn(() => bytes)
  }
  return { bytes, image, stride }
}

describe('Editor V6 single-readback frame capture', () => {
  it('copies only the scene pixels, in BGRA row order, with exactly one toBitmap call', () => {
    const width = 32, height = 20
    const { bytes, image, stride } = makeCapture(width, height, 0xa31f06, 28)
    const result = captureEditorV6FrameBitmap(image, width, height, 0xa31f06)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(width * height * 4)
    const expected = Buffer.alloc(width * height * 4)
    for (let y = 0; y < height; y++) bytes.copy(expected, y * width * 4, y * stride * 4, y * stride * 4 + width * 4)
    expect(result).toEqual(expected)
    expect(image.toBitmap).toHaveBeenCalledTimes(1)
    bytes.fill(0)
    expect(result).toEqual(expected)
  })

  it('rejects a stale token without modifying or cropping its scene data', () => {
    const { image } = makeCapture(24, 20, 0x999999)
    expect(captureEditorV6FrameBitmap(image, 24, 20, 0x999998)).toBeNull()
    expect(image.toBitmap).toHaveBeenCalledTimes(1)
  })

  it('rejects transparent or invalid compositor token cells', () => {
    const { image, bytes, stride } = makeCapture(24, 20, 1)
    const firstCell = (2 * stride + 24 + 2) * 4
    bytes[firstCell + 3] = 0
    expect(captureEditorV6FrameBitmap(image, 24, 20, 1)).toBeNull()
  })

  it('does not silently resize scale-factor mismatches or incomplete buffers', () => {
    const { image } = makeCapture(24, 20, 0xffffff)
    image.getSize.mockReturnValue({ width: 49, height: 20 })
    expect(captureEditorV6FrameBitmap(image, 24, 20, 0xffffff)).toBeNull()
    expect(captureEditorV6FrameBitmap(image, 0, 20, 0xffffff)).toBeNull()
  })
})
