export type HairSheetRegion = { x: number; y: number; width: number; height: number }
export type HairThreeStyleRegion = { index: number; posterior: HairSheetRegion; traseiro: HairSheetRegion; source: HairSheetRegion }
export type HairGridSplits = { firstColumnPercent: number; secondColumnPercent: number; posteriorRowPercent: number }
export const defaultHairGridSplits: HairGridSplits = { firstColumnPercent: 100 / 3, secondColumnPercent: 200 / 3, posteriorRowPercent: 50 }

export type HairGridPixels = { width: number; height: number; data: ArrayLike<number> }

function quietDivider(projection: Uint32Array, target: number, minimum: number, maximum: number, radius: number): number {
  const scores = new Uint32Array(Math.max(0, maximum - minimum + 1))
  let minimumScore = Number.POSITIVE_INFINITY
  let maximumScore = 0
  for (let divider = minimum; divider <= maximum; divider += 1) {
    let ink = 0
    for (let offset = -radius; offset <= radius; offset += 1) {
      const index = divider + offset
      if (index >= 0 && index < projection.length) ink += projection[index]
    }
    scores[divider - minimum] = ink
    minimumScore = Math.min(minimumScore, ink)
    maximumScore = Math.max(maximumScore, ink)
  }
  const valleyLimit = minimumScore + Math.max(1, Math.round((maximumScore - minimumScore) * .0005))
  const runs: Array<{ start: number; end: number }> = []
  let runStart = -1
  for (let index = 0; index <= scores.length; index += 1) {
    const quiet = index < scores.length && scores[index] <= valleyLimit
    if (quiet && runStart < 0) runStart = index
    if (!quiet && runStart >= 0) { runs.push({ start: runStart, end: index - 1 }); runStart = -1 }
  }
  const longest = runs.reduce((largest, run) => Math.max(largest, run.end - run.start + 1), 0)
  const viable = runs.filter((run) => run.end - run.start + 1 === longest)
  let middle = Math.max(minimum, Math.min(maximum, target))
  let targetDistance = Number.POSITIVE_INFINITY
  for (const run of viable) {
    const candidate = (run.start + run.end) / 2 + minimum
    const distance = Math.abs(candidate - target)
    if (distance < targetDistance) { targetDistance = distance; middle = candidate }
  }
  return Math.round(middle)
}

/** Finds transparent gutters around the expected 3×2 layout instead of assuming equal-sized cells. */
export function detectHairGridSplits(image: HairGridPixels): HairGridSplits {
  const { width, height, data } = image
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 2 || data.length < width * height * 4) {
    throw new Error('Não foi possível detectar o espaçamento entre os cabelos da folha.')
  }
  const columns = new Uint32Array(width)
  const rows = new Uint32Array(height)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * 4 + 3] <= 10) continue
    columns[x] += 1
    rows[y] += 1
  }

  const minColumn = Math.max(1, Math.floor(width * .10))
  const maxColumn = Math.max(minColumn, Math.ceil(width * .90))
  const firstTarget = Math.round(width / 3)
  const firstColumn = quietDivider(columns, firstTarget, minColumn, Math.min(Math.floor(width * .52), maxColumn), Math.max(1, Math.round(width * .002)))
  const secondTarget = Math.round(width * 2 / 3)
  const secondColumn = quietDivider(columns, secondTarget, Math.max(firstColumn + minColumn, Math.floor(width * .40)), maxColumn, Math.max(1, Math.round(width * .002)))
  const rowTarget = Math.round(height / 2)
  const row = quietDivider(rows, rowTarget, Math.max(1, Math.floor(height * .10)), Math.min(height - 1, Math.ceil(height * .90)), Math.max(1, Math.round(height * .002)))
  return normalizeHairGridSplits({
    firstColumnPercent: firstColumn / width * 100,
    secondColumnPercent: secondColumn / width * 100,
    posteriorRowPercent: row / height * 100
  })
}

export function normalizeHairGridSplits(splits: HairGridSplits): HairGridSplits {
  const firstColumnPercent = Math.max(10, Math.min(80, Number.isFinite(splits.firstColumnPercent) ? splits.firstColumnPercent : defaultHairGridSplits.firstColumnPercent))
  const secondColumnPercent = Math.max(firstColumnPercent + 10, Math.min(90, Number.isFinite(splits.secondColumnPercent) ? splits.secondColumnPercent : defaultHairGridSplits.secondColumnPercent))
  const posteriorRowPercent = Math.max(10, Math.min(90, Number.isFinite(splits.posteriorRowPercent) ? splits.posteriorRowPercent : defaultHairGridSplits.posteriorRowPercent))
  return { firstColumnPercent, secondColumnPercent, posteriorRowPercent }
}

/** Three adjustable columns are three hairstyles; each column has posterior above traseiro. */
export function getHairThreeStyleRegions(width: number, height: number, splits: HairGridSplits = defaultHairGridSplits): HairThreeStyleRegion[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 2) {
    throw new Error('A grade precisa ter 3 colunas e 2 fileiras: posterior em cima e traseiro embaixo.')
  }

  const normalizedSplits = normalizeHairGridSplits(splits)
  const splitX = [0, Math.floor(width * normalizedSplits.firstColumnPercent / 100), Math.floor(width * normalizedSplits.secondColumnPercent / 100), width]
  if (splitX[1] <= splitX[0] || splitX[2] <= splitX[1] || splitX[3] <= splitX[2]) {
    throw new Error('Cada coluna precisa ter espaço suficiente para um cabelo.')
  }
  const splitY = Math.max(1, Math.min(height - 1, Math.floor(height * normalizedSplits.posteriorRowPercent / 100)))
  return Array.from({ length: 3 }, (_, index) => {
    const left = splitX[index]
    const right = splitX[index + 1]
    const cellWidth = right - left
    const topHeight = splitY
    const bottomHeight = height - splitY
    return {
      index,
      posterior: { x: left, y: 0, width: cellWidth, height: topHeight },
      traseiro: { x: left, y: splitY, width: cellWidth, height: bottomHeight },
      source: { x: left, y: 0, width: cellWidth, height }
    }
  })
}
