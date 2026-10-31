export type HairCropBounds = { left: number; top: number; right: number; bottom: number }

/**
 * Detects 8-connected opaque silhouette parts, ignores tiny detached specks,
 * and returns a padded crop around the remaining artwork. The image buffer is
 * the isolated cell copy, so removing rejected pixels cannot affect the source.
 */
export function findHairCropBounds(rgba: Uint8ClampedArray, width: number, height: number, paddingPercent = 4): HairCropBounds {
  const pixelCount = width * height
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length < pixelCount * 4) {
    throw new Error('Não foi possível analisar os limites do cabelo.')
  }

  const visited = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  // Match the wardrobe importer’s scale-aware speck floor, with a low ceiling
  // so detached details in high-resolution hair remain part of the silhouette.
  const minimumComponentPixels = Math.max(4, Math.min(96, Math.floor(pixelCount * .00001)))
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  let queueWrite = 0
  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (visited[seed] || rgba[seed * 4 + 3] <= 10) continue
    const start = queueWrite
    let read = start
    queue[queueWrite++] = seed
    visited[seed] = 1
    let componentLeft = seed % width
    let componentRight = componentLeft
    let componentTop = Math.floor(seed / width)
    let componentBottom = componentTop
    while (read < queueWrite) {
      const pixel = queue[read++]
      const x = pixel % width
      const y = Math.floor(pixel / width)
      componentLeft = Math.min(componentLeft, x)
      componentRight = Math.max(componentRight, x)
      componentTop = Math.min(componentTop, y)
      componentBottom = Math.max(componentBottom, y)
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const next = ny * width + nx
        if (visited[next] || rgba[next * 4 + 3] <= 10) continue
        visited[next] = 1
        queue[queueWrite++] = next
      }
    }
    const componentSize = queueWrite - start
    if (componentSize < minimumComponentPixels) {
      for (let cursor = start; cursor < queueWrite; cursor += 1) rgba[queue[cursor] * 4 + 3] = 0
      continue
    }
    left = Math.min(left, componentLeft)
    top = Math.min(top, componentTop)
    right = Math.max(right, componentRight)
    bottom = Math.max(bottom, componentBottom)
  }
  if (right < left || bottom < top) throw new Error('Não encontrei uma silhueta de cabelo grande o bastante nessa área. Confira as linhas de corte.')

  const boundedPadding = Math.max(0, Math.min(12, Number.isFinite(paddingPercent) ? paddingPercent : 4))
  const calculatedPadding = Math.round(Math.max(right - left + 1, bottom - top + 1) * boundedPadding / 100)
  const padding = boundedPadding === 0 ? 0 : Math.max(2, calculatedPadding)
  return {
    left: Math.max(0, left - padding),
    top: Math.max(0, top - padding),
    right: Math.min(width - 1, right + padding),
    bottom: Math.min(height - 1, bottom + padding)
  }
}
