import type { ModelPart } from '../../../../../shared/fabricator'
import { loadImageFromDataUrl } from './imageData'

const makeId = () => crypto.randomUUID()

export async function splitImage(part: ModelPart, axis: 'horizontal' | 'vertical'): Promise<ModelPart[]> {
  const image = await loadImageFromDataUrl(part.dataUrl, 'Não foi possível abrir o recorte.')
  const baseImage = await loadImageFromDataUrl(part.chromaBaseDataUrl ?? part.dataUrl, 'Não foi possível abrir o recorte.')
  const firstWidth = axis === 'vertical' ? Math.floor(part.width / 2) : part.width
  const firstHeight = axis === 'horizontal' ? Math.floor(part.height / 2) : part.height
  const regions = axis === 'vertical'
    ? [{ x: 0, y: 0, width: firstWidth, height: part.height }, { x: firstWidth, y: 0, width: part.width - firstWidth, height: part.height }]
    : [{ x: 0, y: 0, width: part.width, height: firstHeight }, { x: 0, y: firstHeight, width: part.width, height: part.height - firstHeight }]
  return Promise.all(regions.map(async (region, index) => {
    const canvas = document.createElement('canvas')
    canvas.width = region.width; canvas.height = region.height
    canvas.getContext('2d')?.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
    const baseCanvas = document.createElement('canvas')
    baseCanvas.width = region.width; baseCanvas.height = region.height
    baseCanvas.getContext('2d')?.drawImage(baseImage, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
    const sourceX = (part.sourceTransform?.x ?? part.x) + region.x
    const sourceY = (part.sourceTransform?.y ?? part.y) + region.y
    return { ...part, id: makeId(), name: `${part.name} ${index === 0 ? 'A' : 'B'}`, x: part.x + region.x, y: part.y + region.y, width: region.width, height: region.height, rotation: 0, jointAnchor: { x: part.x + region.x + region.width / 2, y: part.y + region.y + region.height / 2 }, sourceTransform: part.sourceTransform ? { x: sourceX, y: sourceY, width: region.width, height: region.height, rotation: part.sourceTransform.rotation, anchorVersion: 1, jointAnchor: { x: sourceX + region.width / 2, y: sourceY + region.height / 2 } } : undefined, chromaBaseSaved: true, chromaBaseDataUrl: baseCanvas.toDataURL('image/png'), dataUrl: canvas.toDataURL('image/png') }
  }))
}

export async function mergeImages(parts: ModelPart[]): Promise<ModelPart> {
  const x = Math.min(...parts.map((part) => part.x)); const y = Math.min(...parts.map((part) => part.y))
  const right = Math.max(...parts.map((part) => part.x + part.width)); const bottom = Math.max(...parts.map((part) => part.y + part.height))
  const canvas = document.createElement('canvas'); canvas.width = Math.ceil(right - x); canvas.height = Math.ceil(bottom - y)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível mesclar as peças.')
  const baseCanvas = document.createElement('canvas'); baseCanvas.width = canvas.width; baseCanvas.height = canvas.height
  const baseContext = baseCanvas.getContext('2d')
  if (!baseContext) throw new Error('Não foi possível mesclar as bases do chroma.')
  for (const part of parts) {
    const image = await loadImageFromDataUrl(part.dataUrl, 'Não foi possível abrir o recorte.')
    const baseImage = await loadImageFromDataUrl(part.chromaBaseDataUrl ?? part.dataUrl, 'Não foi possível abrir o recorte.')
    context.save()
    context.translate(part.x - x + part.width / 2, part.y - y + part.height / 2)
    context.rotate(part.rotation * Math.PI / 180)
    context.drawImage(image, -part.width / 2, -part.height / 2, part.width, part.height)
    context.restore()
    baseContext.save()
    baseContext.translate(part.x - x + part.width / 2, part.y - y + part.height / 2)
    baseContext.rotate(part.rotation * Math.PI / 180)
    baseContext.drawImage(baseImage, -part.width / 2, -part.height / 2, part.width, part.height)
    baseContext.restore()
  }
  return { id: makeId(), name: 'Peças mescladas', x, y, width: canvas.width, height: canvas.height, rotation: 0, chromaBaseSaved: true, chromaBaseDataUrl: baseCanvas.toDataURL('image/png'), dataUrl: canvas.toDataURL('image/png') }
}

