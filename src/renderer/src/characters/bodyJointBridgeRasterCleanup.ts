const pixelLuminance = (red: number, green: number, blue: number) => red * 0.2126 + green * 0.7152 + blue * 0.0722

function median(values: number[]): number {
  values.sort((first, second) => first - second)
  return values[Math.floor(values.length / 2)] ?? 0
}

/** Removes isolated dark contour fragments introduced by resampling the body seam mesh. */
export function suppressBodyJointBridgeContourSpeckles(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  rasterScale = 1
): number {
  const pixelCount = width * height
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1
    || !Number.isSafeInteger(pixelCount) || pixelCount < 25 || pixelCount > 2_000_000 || pixels.length !== pixelCount * 4) return 0

  const opaqueLuminance = new Uint32Array(256)
  let opaqueCount = 0
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4
    if (pixels[offset + 3] < 200) continue
    const luminance = Math.round(pixelLuminance(pixels[offset], pixels[offset + 1], pixels[offset + 2]))
    opaqueLuminance[luminance] += 1
    opaqueCount += 1
  }
  if (opaqueCount < 25) return 0

  const medianTarget = Math.ceil(opaqueCount / 2)
  let medianLuminance = 0
  let cumulative = 0
  for (; medianLuminance < opaqueLuminance.length - 1; medianLuminance += 1) {
    cumulative += opaqueLuminance[medianLuminance]
    if (cumulative >= medianTarget) break
  }
  if (medianLuminance < 8) return 0

  const darkCutoff = Math.max(0, Math.min(medianLuminance * 0.62, medianLuminance - Math.max(6, medianLuminance * 0.28)))
  const dark = new Uint8Array(pixelCount)
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4
    if (pixels[offset + 3] < 96) continue
    dark[index] = pixelLuminance(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < darkCutoff ? 1 : 0
  }

  const scale = Number.isFinite(rasterScale) ? Math.max(0.5, Math.min(10, rasterScale)) : 1
  const maximumComponentDimension = Math.max(8, Math.ceil(scale * 4) + 2)
  const maximumComponentArea = Math.max(32, Math.ceil(scale * scale * 16))
  const neighborhoodRadius = Math.max(2, Math.ceil(scale * 1.5))
  const visited = new Uint8Array(pixelCount)
  let correctedPixels = 0

  for (let start = 0; start < pixelCount; start += 1) {
    if (!dark[start] || visited[start]) continue
    const pending = [start]
    const component: number[] = []
    visited[start] = 1
    let minX = width, minY = height, maxX = -1, maxY = -1
    while (pending.length) {
      const index = pending.pop()!
      const x = index % width
      const y = Math.floor(index / width)
      component.push(index)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (!offsetX && !offsetY) continue
        const nextX = x + offsetX, nextY = y + offsetY
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue
        const next = nextY * width + nextX
        if (dark[next] && !visited[next]) { visited[next] = 1; pending.push(next) }
      }
    }

    const componentWidth = maxX - minX + 1
    const componentHeight = maxY - minY + 1
    if (component.length > maximumComponentArea
      || componentWidth > maximumComponentDimension
      || componentHeight > maximumComponentDimension) continue

    const redSamples: number[] = [], greenSamples: number[] = [], blueSamples: number[] = []
    for (let y = Math.max(0, minY - neighborhoodRadius); y <= Math.min(height - 1, maxY + neighborhoodRadius); y += 1) {
      for (let x = Math.max(0, minX - neighborhoodRadius); x <= Math.min(width - 1, maxX + neighborhoodRadius); x += 1) {
        const index = y * width + x
        if (dark[index]) continue
        const offset = index * 4
        if (pixels[offset + 3] < 160) continue
        redSamples.push(pixels[offset])
        greenSamples.push(pixels[offset + 1])
        blueSamples.push(pixels[offset + 2])
      }
    }
    if (redSamples.length < 5) continue

    const red = median(redSamples), green = median(greenSamples), blue = median(blueSamples)
    for (const index of component) {
      const offset = index * 4
      pixels[offset] = red
      pixels[offset + 1] = green
      pixels[offset + 2] = blue
      correctedPixels += 1
    }
  }

  return correctedPixels
}
