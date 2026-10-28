import type { ModelPart } from '../../../../../shared/fabricator'
import { despillGreenFringes, sampleBackground } from './chroma'
import { loadImageFromDataUrl } from './imageData'

/** Repairs edge spill in saved model parts while upgrading legacy chroma data. */
export async function cleanSavedPartEdges(parts: ModelPart[], sourceDataUrl: string, tolerance: number): Promise<ModelPart[]> {
  const source = await loadImageFromDataUrl(sourceDataUrl, 'Não foi possível abrir o recorte.')
  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = 128
  sampleCanvas.height = 128
  const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
  if (!sampleContext) throw new Error('Não foi possível analisar a cor do fundo.')
  sampleContext.drawImage(source, 0, 0, sampleCanvas.width, sampleCanvas.height)
  const background = sampleBackground(sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data, sampleCanvas.width, sampleCanvas.height)

  const cleaned: ModelPart[] = []
  for (const part of parts) {
    const image = await loadImageFromDataUrl(part.dataUrl, 'Não foi possível abrir o recorte.')
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error(`Não foi possível limpar a borda de ${part.name}.`)
    context.drawImage(image, 0, 0)
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const changed = despillGreenFringes(imageData.data, background, tolerance)
    if (changed > 0) {
      context.putImageData(imageData, 0, 0)
      cleaned.push({ ...part, dataUrl: canvas.toDataURL('image/png') })
    } else cleaned.push(part)
  }
  return cleaned
}
