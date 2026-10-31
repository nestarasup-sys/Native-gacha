export type HairSheetRegion = { x: number; y: number; width: number; height: number }
export type HairThreeStyleRegion = { index: number; posterior: HairSheetRegion; traseiro: HairSheetRegion; source: HairSheetRegion }

/** Three columns are three hairstyles; each column has posterior above traseiro. */
export function getHairThreeStyleRegions(width: number, height: number): HairThreeStyleRegion[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 2) {
    throw new Error('A grade precisa ter 3 colunas e 2 fileiras: posterior em cima e traseiro embaixo.')
  }

  const splitY = Math.floor(height / 2)
  return Array.from({ length: 3 }, (_, index) => {
    const left = Math.floor(width * index / 3)
    const right = Math.floor(width * (index + 1) / 3)
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
