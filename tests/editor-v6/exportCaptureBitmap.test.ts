import { describe, expect, it, vi } from 'vitest'
import { captureEditorV6FrameBitmap } from '../../electron/domains/editorV6/exportCaptureBitmap'

function makeCapture(width: number, height: number, token: number, extraHeight = 24) {
  const stride = width
  const bytes = Buffer.alloc(stride * (height + extraHeight) * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * stride + x) * 4
    bytes[offset] = (y * 17 + x) & 255
    bytes[offset + 1] = (y * 3 + x * 7) & 255
    bytes[offset + 2] = (x * 11 + y * 13) & 255
    bytes[offset + 3] = 255
  }
  for (let bit = 0; bit < 24; bit++) {
    const x = (bit % 6) * 4 + 2
    const y = height + Math.floor(bit / 6) * 4 + 2
    const index = (y * stride + x) * 4
    bytes[index] = bytes[index + 1] = bytes[index + 2] = (token >>> bit) & 1 ? 255 : 0
    bytes[index + 3] = 255
  }
  const image = {
    getSize: vi.fn(() => ({ width: stride, height: height + extraHeight })),
    toBitmap: vi.fn(() => bytes)
  }
  return { bytes, image, stride }
}

describe('Editor V6 single-readback frame capture', () => {
  it('returns a zero-copy view of contiguous scene pixels and validates the bottom token', () => {
    const width = 32, height = 20
    const { bytes, image } = makeCapture(width, height, 0xa31f06)
    const result = captureEditorV6FrameBitmap(image, width, height, 0xa31f06)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(width * height * 4)
    expect(result).toEqual(bytes.subarray(0, width * height * 4))
    expect(result!.buffer).toBe(bytes.buffer)
    expect(result!.byteOffset).toBe(bytes.byteOffset)
    expect(image.toBitmap).toHaveBeenCalledTimes(1)
  })

  it('keeps stacked video background and foreground contiguous with one exact-token BGRA readback', () => {
    const width = 32, layerHeight = 20
    const captureHeight = layerHeight * 2
    const token = 0x120011
    const { image, bytes } = makeCapture(width, captureHeight, token)
    const layerBytes = width * layerHeight * 4
    bytes.fill(12, 0, layerBytes)
    bytes.fill(99, layerBytes, layerBytes * 2)

    const combined = captureEditorV6FrameBitmap(image, width, captureHeight, token)
    expect(combined).toHaveLength(layerBytes * 2)
    expect(combined!.subarray(0, layerBytes).every(byte => byte === 12)).toBe(true)
    expect(combined!.subarray(layerBytes).every(byte => byte === 99)).toBe(true)
    expect(combined!.buffer).toBe(bytes.buffer)
    expect(image.toBitmap).toHaveBeenCalledOnce()
    expect(captureEditorV6FrameBitmap(image, width, captureHeight, token ^ 1)).toBeNull()
  })

  it('rejects a stale token without modifying or cropping its scene data', () => {
    const { image } = makeCapture(24, 20, 0x999999)
    expect(captureEditorV6FrameBitmap(image, 24, 20, 0x999998)).toBeNull()
    expect(image.toBitmap).toHaveBeenCalledTimes(1)
  })

  it('writes into a reusable output slice without changing the neighboring layer', () => {
    const width = 32, height = 20
    const { bytes, image, stride } = makeCapture(width, height, 0xa31f06)
    const output = Buffer.alloc(width * height * 4 * 2, 0x7f)
    const secondLayerBefore = Buffer.from(output.subarray(width * height * 4))
    const result = captureEditorV6FrameBitmap(image, width, height, 0xa31f06, output, 0)
    const expected = Buffer.alloc(width * height * 4)
    for (let y = 0; y < height; y++) bytes.copy(expected, y * width * 4, y * stride * 4, y * stride * 4 + width * 4)
    expect(result).toBe(output)
    expect(output.subarray(0, width * height * 4)).toEqual(expected)
    expect(output.subarray(width * height * 4)).toEqual(secondLayerBefore)
  })

  it('rejects undersized reusable output before writing pixels', () => {
    const { image } = makeCapture(24, 20, 1)
    const output = Buffer.alloc(24 * 20 * 4 - 1, 0x7f)
    expect(captureEditorV6FrameBitmap(image, 24, 20, 1, output)).toBeNull()
    expect(output.every((value) => value === 0x7f)).toBe(true)
  })

  it('rejects transparent or invalid compositor token cells', () => {
    const { image, bytes, stride } = makeCapture(24, 20, 1)
    const firstCell = ((20 + 2) * stride + 2) * 4
    bytes[firstCell + 3] = 0
    expect(captureEditorV6FrameBitmap(image, 24, 20, 1)).toBeNull()
  })

  it('does not silently resize scale-factor mismatches or incomplete buffers', () => {
    const { image } = makeCapture(24, 20, 0xffffff)
    image.getSize.mockReturnValue({ width: 25, height: 44 })
    expect(captureEditorV6FrameBitmap(image, 24, 20, 0xffffff)).toBeNull()
    image.getSize.mockReturnValue({ width: 24, height: 43 })
    expect(captureEditorV6FrameBitmap(image, 24, 20, 0xffffff)).toBeNull()
    image.getSize.mockReturnValue({ width: 24, height: 44 })
    image.toBitmap.mockReturnValue(Buffer.alloc(24 * 44 * 4 - 1))
    expect(captureEditorV6FrameBitmap(image, 24, 20, 0xffffff)).toBeNull()
    expect(captureEditorV6FrameBitmap(image, 0, 20, 0xffffff)).toBeNull()
  })
})
