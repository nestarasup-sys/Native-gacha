/**
 * Visible-alpha bounds for a native RGBA frame, with the same strict threshold
 * and empty-image fallback as the original per-pixel Math.min/max loop.
 *
 * Aggregating the left/right extrema once per occupied row reduces arithmetic
 * and branches on large dense sprites. Does not allocate per-row buffers.
 */
export function editorV6AlphaCropBounds(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 8
): { left: number; top: number; width: number; height: number } {
  let left = width, right = -1, top = height, bottom = -1
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4
    let rowFirst = width, rowLast = -1
    for (let x = 0; x < width; x++) {
      if (pixels[rowOffset + x * 4 + 3] > alphaThreshold) {
        if (rowFirst === width) rowFirst = x
        rowLast = x
      }
    }
    if (rowLast < 0) continue
    if (rowFirst < left) left = rowFirst
    if (rowLast > right) right = rowLast
    if (top === height) top = y
    bottom = y
  }
  return right < left
    ? { left: 0, top: 0, width: 1, height: 1 }
    : { left, top, width: right - left + 1, height: bottom - top + 1 }
}
