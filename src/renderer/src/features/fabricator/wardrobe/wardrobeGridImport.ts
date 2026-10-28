import { fixWardrobeGlue } from '../../../../../shared/wardrobeGlue'
import type { FabricatorProject, WardrobeComponent } from '../../../../../shared/fabricator'
import { findGridRowBoundaries, findVisibleGridContentBounds, removeGridFlatBackground } from './wardrobeGridImage'

export type WardrobeTorsoGridColumns = 3 | 4

/** Converts a 3×3 or 4×3 image into shirt pieces positioned on the source torso. */
export function createWardrobeTorsoGridComponents(
  image: ImageBitmap,
  referenceModel: FabricatorProject,
  columns: WardrobeTorsoGridColumns,
  createId: () => string
): WardrobeComponent[] {
  const rows = 3
  try {
    if (!image.width || !image.height || image.width < columns || image.height < rows) {
      throw new Error(`A imagem está pequena demais para uma grade ${columns}×${rows}. Use uma imagem com pelo menos ${columns} colunas e 3 linhas de pixels.`)
    }
    if (image.width * image.height > 32_000_000) {
      throw new Error('A imagem tem mais de 32 milhões de pixels. Reduza as dimensões para continuar.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Não foi possível ler a grade de roupas.')
    context.drawImage(image, 0, 0)

    const sourcePixels = context.getImageData(0, 0, image.width, image.height)
    removeGridFlatBackground(sourcePixels)
    context.putImageData(sourcePixels, 0, 0)
    const torso = referenceModel.parts.find((part) => /tronco|corpo|torso|chest|peito/i.test(part.name))
    if (!torso) throw new Error('Não encontrei uma parte de tronco no modelo salvo.')

    const rowBoundaries = findGridRowBoundaries(sourcePixels, rows)
    const cellWidth = image.width / columns
    const components: WardrobeComponent[] = []
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const left = Math.floor(column * cellWidth)
      const top = rowBoundaries[row]
      const right = Math.floor((column + 1) * cellWidth)
      const bottom = rowBoundaries[row + 1]
      const tileWidth = right - left
      const tileHeight = bottom - top
      if (tileWidth <= 0 || tileHeight <= 0) continue

      const tile = context.getImageData(left, top, tileWidth, tileHeight)
      const bounds = findVisibleGridContentBounds(tile)
      if (!bounds) continue

      const pieceCanvas = document.createElement('canvas')
      pieceCanvas.width = bounds.maxX - bounds.minX + 1
      pieceCanvas.height = bounds.maxY - bounds.minY + 1
      const pieceContext = pieceCanvas.getContext('2d')!
      const cropped = pieceContext.createImageData(pieceCanvas.width, pieceCanvas.height)
      for (let y = 0; y < pieceCanvas.height; y += 1) {
        const from = ((bounds.minY + y) * tile.width + bounds.minX) * 4
        cropped.data.set(tile.data.subarray(from, from + pieceCanvas.width * 4), y * pieceCanvas.width * 4)
      }
      pieceContext.putImageData(cropped, 0, 0)

      const width = pieceCanvas.width
      const height = pieceCanvas.height
      const x = torso.x + (torso.width - width) / 2
      const y = torso.y + (torso.height - height) / 2
      const id = createId()
      const shirt: WardrobeComponent = {
        id,
        name: `Roupa tronco ${String(components.length + 1).padStart(2, '0')}`,
        category: 'camisa',
        x,
        y,
        width,
        height,
        rotation: 0,
        attachedPartId: torso.id,
        originX: x,
        originY: y,
        originWidth: width,
        originHeight: height,
        dataUrl: pieceCanvas.toDataURL('image/png'),
        glue: { version: 1, mode: 'loose' }
      }
      components.push(fixWardrobeGlue(shirt, torso))
    }
    return components
  } finally {
    image.close()
  }
}
