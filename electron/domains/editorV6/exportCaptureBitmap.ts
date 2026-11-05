import type { NativeImage } from 'electron'

const PAINT_TOKEN_SIZE = 24
const PAINT_TOKEN_CELL_SIZE = 4
const PAINT_TOKEN_COLUMNS = 6

/**
 * Validate the compositor marker and extract BGRA scene bytes from a *single*
 * readback. The previous path called toBitmap() to inspect the marker, then
 * cropped a NativeImage and converted it again for every exported frame.
 *
 * This works only for exact 1x BGRA readbacks; any unexpected bitmap geometry
 * is rejected so the caller can retry or fail rather than rescale silently.
 * Callers may provide an owned reusable destination; otherwise this function
 * allocates one only after the marker is validated.
 */
export function captureEditorV6FrameBitmap(
  image: Pick<NativeImage, 'getSize' | 'toBitmap'>,
  width: number,
  height: number,
  token: number,
  output?: Buffer,
  outputOffset = 0
): Buffer | null {
  const size = image.getSize()
  const outputBytes = width * height * 4
  const requiredOutputBytes = outputOffset + outputBytes
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || !Number.isSafeInteger(outputOffset) || outputOffset < 0
    || !Number.isSafeInteger(outputBytes) || !Number.isSafeInteger(requiredOutputBytes) || output && output.length < requiredOutputBytes
    || size.width < width + PAINT_TOKEN_SIZE || size.height < height) return null

  const bitmap = image.toBitmap({ scaleFactor: 1 })
  if (bitmap.length !== size.width * size.height * 4) return null

  // The marker sits outside the 16:9 scene; detect stale frames before
  // allocating the output copy. BGRA: channel +2 carries the marker value.
  for (let bit = 0; bit < 24; bit++) {
    const cellX = width + (bit % PAINT_TOKEN_COLUMNS) * PAINT_TOKEN_CELL_SIZE + PAINT_TOKEN_CELL_SIZE / 2
    const cellY = Math.floor(bit / PAINT_TOKEN_COLUMNS) * PAINT_TOKEN_CELL_SIZE + PAINT_TOKEN_CELL_SIZE / 2
    const offset = (cellY * size.width + cellX) * 4
    const actual = bitmap[offset + 2] > 127
    const expected = ((token >>> bit) & 1) === 1
    if (actual !== expected || bitmap[offset + 3] < 254) return null
  }

  const target = output ?? Buffer.allocUnsafe(requiredOutputBytes)
  const rowBytes = width * 4
  const stride = size.width * 4
  for (let row = 0; row < height; row++) {
    bitmap.copy(target, outputOffset + row * rowBytes, row * stride, row * stride + rowBytes)
  }
  return target
}
