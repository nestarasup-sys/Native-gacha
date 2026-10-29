export type EyeSheetPixelPiece = {
  kind: 'eye' | 'pupil' | 'eye-closed'
  width: number
  height: number
  pixels: Uint8ClampedArray
}

type Gap = { start: number; end: number; length: number }

function backgroundColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] | null {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1]
  const samples = corners.map((pixel) => [...data.subarray(pixel * 4, pixel * 4 + 4)])
  if (samples.some((sample) => sample[3] < 245)) return null
  const average = [0, 1, 2].map((channel) => Math.round(samples.reduce((total, sample) => total + sample[channel], 0) / samples.length)) as [number, number, number]
  return samples.every((sample) => Math.hypot(sample[0] - average[0], sample[1] - average[1], sample[2] - average[2]) < 25) ? average : null
}

function createPixelQueue(maximumSize: number) {
  let values = new Int32Array(Math.max(1, Math.min(maximumSize, 64 * 1024)))
  let first = 0
  let last = 0
  let count = 0

  return {
    push(value: number) {
      if (count === values.length) {
        const capacity = Math.min(maximumSize, values.length * 2)
        const grown = new Int32Array(capacity)
        for (let index = 0; index < count; index += 1) grown[index] = values[(first + index) % values.length]
        values = grown
        first = 0
        last = count
      }
      values[last] = value
      last = (last + 1) % values.length
      count += 1
    },
    shift(): number | undefined {
      if (count === 0) return undefined
      const value = values[first]
      first = (first + 1) % values.length
      count -= 1
      return value
    }
  }
}

function clearEdgeBackground(data: Uint8ClampedArray, width: number, height: number, background: [number, number, number]) {
  const pixelCount = width * height
  const visited = new Uint8Array(pixelCount)
  const queue = createPixelQueue(pixelCount)
  const add = (pixel: number) => {
    if (visited[pixel]) return
    visited[pixel] = 1
    const offset = pixel * 4
    if (data[offset + 3] < 16 || Math.hypot(data[offset] - background[0], data[offset + 1] - background[1], data[offset + 2] - background[2]) <= 35) queue.push(pixel)
  }

  for (let x = 0; x < width; x += 1) { add(x); add((height - 1) * width + x) }
  for (let y = 0; y < height; y += 1) { add(y * width); add(y * width + width - 1) }
  let pixel: number | undefined
  while ((pixel = queue.shift()) !== undefined) {
    data[pixel * 4 + 3] = 0
    const x = pixel % width
    const y = Math.floor(pixel / width)
    if (x > 0) add(pixel - 1)
    if (x + 1 < width) add(pixel + 1)
    if (y > 0) add(pixel - width)
    if (y + 1 < height) add(pixel + width)
  }
}

function findSeparators(data: Uint8ClampedArray, width: number, height: number): [number, number] {
  const occupied = new Uint8Array(height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 20) continue
      occupied[y] = 1
      break
    }
  }
  const first = occupied.indexOf(1)
  const last = occupied.lastIndexOf(1)
  if (first < 0) throw new Error('A folha não contém peças visíveis.')
  const gaps: Gap[] = []
  for (let y = first + 1; y < last;) {
    if (occupied[y]) { y += 1; continue }
    const start = y
    while (y < last && !occupied[y]) y += 1
    gaps.push({ start, end: y, length: y - start })
  }
  const minimumPieceHeight = Math.max(2, Math.floor((last - first + 1) * .035))
  const candidates = gaps.filter((gap) => gap.length >= 2).sort((a, b) => b.length - a.length)
  for (const upper of candidates) for (const lower of candidates) {
    if (upper.start >= lower.start) continue
    if (upper.start - first < minimumPieceHeight || lower.start - upper.end < minimumPieceHeight || last - lower.end + 1 < minimumPieceHeight) continue
    return [Math.floor((upper.start + upper.end) / 2), Math.floor((lower.start + lower.end) / 2)]
  }
  throw new Error('Não consegui separar olho, pupila e olho fechado. Deixe um espaço vazio entre as três peças da imagem.')
}

function cropVisiblePiece(data: Uint8ClampedArray, width: number, top: number, bottom: number, kind: EyeSheetPixelPiece['kind']): EyeSheetPixelPiece {
  let minX = width, minY = bottom, maxX = -1, maxY = -1
  for (let y = top; y < bottom; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * 4 + 3] < 20) continue
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  if (maxX < minX) throw new Error('Uma das três áreas da folha está vazia.')
  const cropWidth = maxX - minX + 1
  const cropHeight = maxY - minY + 1
  const pixels = new Uint8ClampedArray(cropWidth * cropHeight * 4)
  for (let row = 0; row < cropHeight; row += 1) {
    const start = ((minY + row) * width + minX) * 4
    pixels.set(data.subarray(start, start + cropWidth * 4), row * cropWidth * 4)
  }
  return { kind, width: cropWidth, height: cropHeight, pixels }
}

/** Finds and crops the three vertically stacked eye assets in-place on the supplied pixel buffer. */
export function splitEyeSheetPixels(data: Uint8ClampedArray, width: number, height: number): EyeSheetPixelPiece[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4) {
    throw new Error('A folha de olhos possui dimensões inválidas.')
  }
  const background = backgroundColor(data, width, height)
  if (background) clearEdgeBackground(data, width, height, background)
  const [firstCut, secondCut] = findSeparators(data, width, height)
  return [
    cropVisiblePiece(data, width, 0, firstCut, 'eye'),
    cropVisiblePiece(data, width, firstCut, secondCut, 'pupil'),
    cropVisiblePiece(data, width, secondCut, height, 'eye-closed')
  ]
}
