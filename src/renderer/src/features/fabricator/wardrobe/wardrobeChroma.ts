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
