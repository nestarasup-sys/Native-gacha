import { loadImageFromDataUrl } from './imageData'
import { createImageWarpMesh, drawImageWarp, type ImageWarpMesh } from './imageMeshWarp'

export type ModelSourceWarpSession = {
  partId: string
  sourceUrl: string
  image: HTMLImageElement
  baseImage: HTMLImageElement
  mesh: ImageWarpMesh
}

async function resizeWarpImage(image: HTMLImageElement, width: number, height: number): Promise<HTMLImageElement> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível para ajustar a base da peça.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return loadImageFromDataUrl(canvas.toDataURL('image/png'), 'Não foi possível ajustar a base da peça deformada.')
}

export async function createModelSourceWarpSession(partId: string, dataUrl: string, chromaBaseDataUrl?: string): Promise<ModelSourceWarpSession> {
  const image = await loadImageFromDataUrl(dataUrl, 'Não foi possível carregar a coxa para deformar.')
  const baseUrl = chromaBaseDataUrl ?? dataUrl
  let baseImage = baseUrl === dataUrl
    ? image
    : await loadImageFromDataUrl(baseUrl, 'Não foi possível carregar a base do Chroma da coxa.')
  if (baseImage.naturalWidth !== image.naturalWidth || baseImage.naturalHeight !== image.naturalHeight) {
    baseImage = await resizeWarpImage(baseImage, image.naturalWidth, image.naturalHeight)
  }
  return { partId, sourceUrl: dataUrl, image, baseImage, mesh: createImageWarpMesh() }
}

export function drawModelSourceWarp(canvas: HTMLCanvasElement, image: HTMLImageElement, mesh: ImageWarpMesh): void {
  const expanded = document.createElement('canvas')
  const layout = drawImageWarp(expanded, image, mesh)
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível para desenhar a coxa deformada.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(expanded, layout.padding, layout.padding, image.naturalWidth, image.naturalHeight, 0, 0, canvas.width, canvas.height)
}

export function modelSourceWarpDataUrl(image: HTMLImageElement, mesh: ImageWarpMesh): string {
  const canvas = document.createElement('canvas')
  drawModelSourceWarp(canvas, image, mesh)
  return canvas.toDataURL('image/png')
}
