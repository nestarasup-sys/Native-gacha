type Region = { x: number; y: number; width: number; height: number; pixels: number[] }

/** Connected alpha masks prevent neighboring sprites from leaking into a crop. */
export function detectSleeveSilhouettes(image: Pick<ImageData, 'width' | 'height' | 'data'>): Region[] {
  const { width, height, data } = image
  const visited = new Uint8Array(width * height)
  const regions: Region[] = []
  for (let seed = 0; seed < visited.length; seed++) {
    if (visited[seed] || data[seed * 4 + 3] <= 8) continue
    const pixels = [seed]; visited[seed] = 1
    let minX = seed % width, maxX = minX, minY = Math.floor(seed / width), maxY = minY
    for (let cursor = 0; cursor < pixels.length; cursor++) {
      const pixel = pixels[cursor], x = pixel % width, y = Math.floor(pixel / width)
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
        const next = ny * width + nx
        if (visited[next] || data[next * 4 + 3] <= 8) continue
        visited[next] = 1; pixels.push(next)
      }
    }
    regions.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixels })
  }
  const largest = regions.reduce((maximum, region) => Math.max(maximum, region.pixels.length), 0)
  const sprites = regions.filter(region => region.pixels.length >= Math.max(4, largest * .003))
  if (sprites.length !== 12) throw new Error(`Reconheci ${sprites.length} silhuetas, mas a folha precisa ter 12 mangas separadas. Confira se nenhuma está encostada em outra e se o fundo é uniforme ou transparente. Nenhum recorte foi importado.`)
  // Cluster by column first: long sleeves can cross the nominal quarter-row boundaries.
  sprites.sort((a, b) => a.x + a.width / 2 - b.x - b.width / 2)
  const columns = [sprites.slice(0, 4), sprites.slice(4, 8), sprites.slice(8, 12)]
  columns.forEach(column => column.sort((a, b) => a.y + a.height / 2 - b.y - b.height / 2))
  return Array.from({ length: 12 }, (_, index) => columns[index % 3][Math.floor(index / 3)])
}
