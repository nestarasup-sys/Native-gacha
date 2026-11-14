import type { NativeImage } from 'electron'

const PAINT_TOKEN_SIZE = 24
const PAINT_TOKEN_CELL_SIZE = 4
const PAINT_TOKEN_COLUMNS = 6

/**
 * Validate the compositor marker and expose BGRA scene bytes from a *single*
 * readback. The marker occupies a strip below the scene so the scene bytes are
 * already contiguous and can be passed to FFmpeg without a per-row copy.
 *
 * This works only for exact 1x BGRA readbacks with the expected scene width;
 * unexpected geometry is rejected so the caller can retry or fail rather than
 * rescale silently. When an output is provided (layered video), one contiguous
 * copy appends the scene into that reusable frame. Otherwise the returned view
 * retains the `toBitmap()` buffer until its FFmpeg write callback completes.
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
    || size.width !== width || size.height < height + PAINT_TOKEN_SIZE) return null

  const bitmap = image.toBitmap({ scaleFactor: 1 })
  if (bitmap.length !== size.width * size.height * 4) return null

  // The marker sits in the strip after the scene; validate it before exposing
  // a zero-copy scene view or copying into the layered frame. BGRA channel +2
  // carries the marker value.
  for (let bit = 0; bit < 24; bit++) {
    const cellX = (bit % PAINT_TOKEN_COLUMNS) * PAINT_TOKEN_CELL_SIZE + PAINT_TOKEN_CELL_SIZE / 2
    const cellY = height + Math.floor(bit / PAINT_TOKEN_COLUMNS) * PAINT_TOKEN_CELL_SIZE + PAINT_TOKEN_CELL_SIZE / 2
    const offset = (cellY * size.width + cellX) * 4
    const actual = bitmap[offset + 2] > 127
    const expected = ((token >>> bit) & 1) === 1
    if (actual !== expected || bitmap[offset + 3] < 254) return null
  }

  if (output) {
    bitmap.copy(output, outputOffset, 0, outputBytes)
    return output
  }
  return bitmap.subarray(0, outputBytes)
}
