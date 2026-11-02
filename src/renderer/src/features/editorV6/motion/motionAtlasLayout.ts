export type MotionAtlasLayout = {
  columns: number
  rows: number
  width: number
  height: number
  pixels: number
  ratio: number
}

/** Packs all samples into the safest native-resolution grid for their aspect ratio. */
export function chooseMotionAtlasLayout(
  count: number,
  cellWidth: number,
  cellHeight: number,
  maxDimension: number,
  maxPixels: number
): MotionAtlasLayout {
  if (!Number.isInteger(count) || count < 1
    || !Number.isFinite(cellWidth) || cellWidth < 1
    || !Number.isFinite(cellHeight) || cellHeight < 1
    || !Number.isFinite(maxDimension) || maxDimension < 1
    || !Number.isFinite(maxPixels) || maxPixels < 1) {
    throw new RangeError('Dimensões inválidas para montar o atlas de movimento.')
  }

  let best: MotionAtlasLayout | undefined
  let bestCellCount = Number.POSITIVE_INFINITY
  let bestAspectPenalty = Number.POSITIVE_INFINITY
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns)
    const width = columns * cellWidth
    const height = rows * cellHeight
    const pixels = width * height
    const ratio = Math.min(1, maxDimension / width, maxDimension / height, Math.sqrt(maxPixels / pixels))
    const cellCount = columns * rows
    const aspectPenalty = Math.abs(Math.log(width / height))
    const improvesRatio = !best || ratio > best.ratio + 1e-12
    const matchesRatio = best && Math.abs(ratio - best.ratio) <= 1e-12
    const improvesPacking = matchesRatio && (cellCount < bestCellCount
      || cellCount === bestCellCount && aspectPenalty < bestAspectPenalty)
    if (!improvesRatio && !improvesPacking) continue

    best = { columns, rows, width, height, pixels, ratio }
    bestCellCount = cellCount
    bestAspectPenalty = aspectPenalty
  }
  return best!
}
