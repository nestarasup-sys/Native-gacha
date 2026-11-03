/** Remove green spill only along the transparent edge of an imported sheet. */
export function cleanWardrobeGreenEdges(pixels: Uint8ClampedArray, width: number, height: number, background: number[]): void {
  const transparent = new Uint8Array(width * height)
  for (let i = 0; i < transparent.length; i += 1) transparent[i] = pixels[i * 4 + 3] <= 24 ? 1 : 0

  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = y * width + x
    const at = i * 4
    if (pixels[at + 3] <= 24) continue
    let edge = false
    for (let dy = -1; dy <= 1 && !edge; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx; const ny = y + dy
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && transparent[ny * width + nx]) { edge = true; break }
    }
    if (!edge) continue
    const red = pixels[at]; const green = pixels[at + 1]; const blue = pixels[at + 2]
    const neutral = Math.max(red, blue)
    const distance = Math.hypot(red - background[0], green - background[1], blue - background[2])
    if (green > neutral && distance < 200) {
      const strength = Math.min(1, (200 - distance) / 60)
      pixels[at + 1] = Math.round(green - (green - neutral) * strength)
    }
  }
}

/** Re-key green pixels connected to transparent edges of an already isolated garment. */
export function reprocessWardrobeGreenChroma(pixels: Uint8ClampedArray, width: number, height: number): number {
  const count = width * height
  const original = pixels.slice()
  const visited = new Uint8Array(count)
  const queue = new Uint32Array(count)
  let read = 0; let write = 0
  const candidate = (i: number) => {
    const at = i * 4
    const red = pixels[at]; const green = pixels[at + 1]; const blue = pixels[at + 2]
    return pixels[at + 3] > 0 && green >= 100 && green - Math.max(red, blue) >= 45 && green > red * 1.25 && green > blue * 1.15
  }
  const enqueue = (i: number) => {
    if (!visited[i] && candidate(i)) { visited[i] = 1; queue[write++] = i }
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = y * width + x
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
      pixels[(i - 1) * 4 + 3] <= 24 || pixels[(i + 1) * 4 + 3] <= 24 ||
      pixels[(i - width) * 4 + 3] <= 24 || pixels[(i + width) * 4 + 3] <= 24) enqueue(i)
  }
  while (read < write) {
    const i = queue[read++]; const x = i % width; const y = Math.floor(i / width)
    pixels[i * 4 + 3] = 0
    if (x > 0) enqueue(i - 1)
    if (x + 1 < width) enqueue(i + 1)
    if (y > 0) enqueue(i - width)
    if (y + 1 < height) enqueue(i + width)
  }
  cleanWardrobeGreenEdges(pixels, width, height, [0, 255, 0])
  let changed = 0
  for (let i = 0; i < count; i += 1) {
    const at = i * 4
    if (pixels[at + 1] !== original[at + 1] || pixels[at + 3] !== original[at + 3]) changed += 1
  }
  return changed
}
