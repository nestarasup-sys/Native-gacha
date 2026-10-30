import type { FabricatorProject, WardrobeComponent } from '../../../../../shared/fabricator'
import { fixWardrobeGlue } from '../../../../../shared/wardrobeGlue'
import { suggestWardrobeBone } from './boneSelection'
import { removeGridFlatBackground } from './wardrobeGridImage'
import { detectSleeveSilhouettes } from './sleeveSilhouettes'

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

/** Detects twelve complete left-side silhouettes and creates editable mirrored pairs. */
export function createWardrobeSleeveSheetComponents(image: ImageBitmap, model: FabricatorProject, createId: () => string, kind: 'sleeves' | 'pants' = 'sleeves'): WardrobeComponent[] {
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
    const detected = detectSleeveSilhouettes(sheet)
    const components: WardrobeComponent[] = []
    for (let index = 0; index < detected.length; index++) {
      const row = Math.floor(index / 3), col = index % 3
      const region = detected[index]
      const cropped = context.createImageData(region.width, region.height)
      for (const pixel of region.pixels) {
        const x = pixel % sheet.width, y = Math.floor(pixel / sheet.width)
        cropped.data.set(sheet.data.subarray(pixel * 4, pixel * 4 + 4), ((y - region.y) * region.width + x - region.x) * 4)
      }
      const long = row >= 2
      const pairId = createId()
      const category = kind === 'pants' ? 'calca-coxa' as const : 'manga-superior' as const
      const label = `${kind === 'pants' ? long ? 'Calça longa' : 'Short' : long ? 'Manga longa' : 'Manga curta'} ${String(row * 3 + col + 1).padStart(2, '0')}`
      components.push(cropPng(cropped, createId(), `${label} · esquerda`, category, 'left', pairId, model))
      components.push(cropPng(cropped, createId(), `${label} · direita`, category, 'right', pairId, model))
    }
    return components
  } finally { image.close() }
}
