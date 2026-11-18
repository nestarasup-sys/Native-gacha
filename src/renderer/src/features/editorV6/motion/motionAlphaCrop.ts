/**
 * Visible-alpha bounds for a native RGBA frame, with the same strict threshold
 * and empty-image fallback as the original per-pixel Math.min/max loop.
 *
 * Scan 32-bit RGBA words from both row edges and stop at the first visible
 * pixel. Alpha inside those bounds cannot change the crop. Character captures
 * are aligned ImageData buffers, so this avoids four byte reads per pixel and
 * skips dense row interiors. Unaligned views retain the byte-safe path.
 */
const PIXEL_ALPHA_SHIFT = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 4 ? 24 : 0

export function editorV6AlphaCropBounds(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 8
): { left: number; top: number; width: number; height: number } {
  if (pixels.byteOffset % 4 === 0 && pixels.byteLength % 4 === 0) {
    const words = new Uint32Array(pixels.buffer, pixels.byteOffset, pixels.byteLength / 4)
    const alphaMask = 0xff << PIXEL_ALPHA_SHIFT
    let left = width, right = -1, top = height, bottom = -1
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width
      let firstVisible = rowOffset
      const rowEnd = rowOffset + width
      while (firstVisible < rowEnd && ((words[firstVisible] & alphaMask) >>> PIXEL_ALPHA_SHIFT) <= alphaThreshold) firstVisible++
      if (firstVisible >= rowEnd) continue
      let lastVisible = rowEnd - 1
      while (((words[lastVisible] & alphaMask) >>> PIXEL_ALPHA_SHIFT) <= alphaThreshold) lastVisible--
      const rowFirst = firstVisible - rowOffset
      const rowLast = lastVisible - rowOffset
      if (rowFirst < left) left = rowFirst
      if (rowLast > right) right = rowLast
      if (top === height) top = y
      bottom = y
    }
    return right < left
      ? { left: 0, top: 0, width: 1, height: 1 }
      : { left, top, width: right - left + 1, height: bottom - top + 1 }
  }

  let left = width, right = -1, top = height, bottom = -1
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4
    const rowEnd = rowOffset + width * 4
    let firstVisible = rowOffset + 3
    while (firstVisible < rowEnd && pixels[firstVisible] <= alphaThreshold) firstVisible += 4
    if (firstVisible >= rowEnd) continue
    let lastVisible = rowEnd - 1
    while (pixels[lastVisible] <= alphaThreshold) lastVisible -= 4
    const rowFirst = (firstVisible - rowOffset - 3) / 4
    const rowLast = (lastVisible - rowOffset - 3) / 4
    if (rowFirst < left) left = rowFirst
    if (rowLast > right) right = rowLast
    if (top === height) top = y
    bottom = y
  }
  return right < left
    ? { left: 0, top: 0, width: 1, height: 1 }
    : { left, top, width: right - left + 1, height: bottom - top + 1 }
}
