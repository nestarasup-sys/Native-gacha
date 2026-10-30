import type { FabricatorProject, WardrobeComponent } from '../../../../../shared/fabricator'
import { fixWardrobeGlue } from '../../../../../shared/wardrobeGlue'
import { suggestWardrobeBone } from './boneSelection'
import { findVisibleGridContentBounds, removeGridFlatBackground } from './wardrobeGridImage'

function cropPng(pixels: ImageData, id: string, name: string, category: WardrobeComponent['category'], side: 'left' | 'right', pairId: string, model: FabricatorProject): WardrobeComponent {
  const source = document.createElement('canvas'); source.width = pixels.width; source.height = pixels.height
  source.getContext('2d')!.putImageData(pixels, 0, 0)
  const canvas = document.createElement('canvas'); canvas.width = pixels.width; canvas.height = pixels.height
  const ctx = canvas.getContext('2d')!
  if (side === 'right') { ctx.translate(pixels.width, 0); ctx.scale(-1, 1) }
  ctx.drawImage(source, 0, 0)
  const placementSideX = side === 'left' ? model.width * .27 : model.width * .73
  const selection = suggestWardrobeBone(category, placementSideX, model.width, model)
  const bone = selection.bone
  const x = bone ? bone.x + (bone.width - pixels.width) / 2 : placementSideX - pixels.width / 2
  const y = bone ? bone.y + (bone.height - pixels.height) / 2 : model.height * .27 - pixels.height / 2
  const component: WardrobeComponent = { id, name, sleevePairId: pairId, sleeveSide: side, sleeveSegment: 'whole', category,
    x, y, width: pixels.width, height: pixels.height, rotation: 0, attachedPartId: bone?.id ?? '', originX: x, originY: y,
    originWidth: pixels.width, originHeight: pixels.height, dataUrl: canvas.toDataURL('image/png'), glue: { version: 1, mode: 'loose' } }
  return bone ? fixWardrobeGlue(component, bone) : component
}

/** Imports the fixed 3×4 sleeve grid. Each logical cell contains a left sleeve in its left half. */
export function createWardrobeSleeveSheetComponents(image: ImageBitmap, model: FabricatorProject, createId: () => string): WardrobeComponent[] {
  try {
    if (image.width < 6 || image.height < 4) throw new Error('A imagem é pequena demais para uma grade de mangas 3×4.')
    if (image.width * image.height > 32_000_000) throw new Error('A imagem tem mais de 32 milhões de pixels. Reduza as dimensões para continuar.')
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Não foi possível ler a grade de mangas.')
    context.drawImage(image, 0, 0)
    const sheet = context.getImageData(0, 0, image.width, image.height)
    removeGridFlatBackground(sheet)
    context.putImageData(sheet, 0, 0)
    const components: WardrobeComponent[] = []
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
      const x0 = Math.floor(col * image.width / 3), x1 = Math.floor((col + 1) * image.width / 3)
      const y0 = Math.floor(row * image.height / 4), y1 = Math.floor((row + 1) * image.height / 4)
      // The reference layout places the supplied left sleeve in the left half of each cell.
      const cell = context.getImageData(x0, y0, Math.floor((x1 - x0) / 2), y1 - y0)
      const bounds = findVisibleGridContentBounds(cell)
      if (!bounds) throw new Error(`Não encontrei a manga esquerda na posição ${row * 3 + col + 1} da grade.`)
      const cropped = context.createImageData(bounds.maxX - bounds.minX + 1, bounds.maxY - bounds.minY + 1)
      for (let y = 0; y < cropped.height; y++) {
        const start = ((bounds.minY + y) * cell.width + bounds.minX) * 4
        cropped.data.set(cell.data.subarray(start, start + cropped.width * 4), y * cropped.width * 4)
      }
      const long = row >= 2
      const pairId = createId()
      const category = 'manga-superior' as const
      const label = `${long ? 'Manga longa' : 'Manga curta'} ${String(row * 3 + col + 1).padStart(2, '0')}`
      components.push(cropPng(cropped, createId(), `${label} · esquerda`, category, 'left', pairId, model))
      components.push(cropPng(cropped, createId(), `${label} · direita`, category, 'right', pairId, model))
    }
    return components
  } finally { image.close() }
}
