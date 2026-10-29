import { applyModelSourceBrushPixels, modelSourceBrushRegion, removeModelSourceColorPixels } from './modelSourcePixelOperations'
import type { ModelSourcePixelEditMessage, ModelSourcePixelEditRequest } from './modelSourcePixelEditProtocol'

const MAX_IMAGE_PIXELS = 32_000_000
const MAX_IMAGE_DIMENSION = 8192
const MAX_BRUSH_POINTS = 4096
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ModelSourcePixelEditRequest>) => void) | null
  postMessage: (message: ModelSourcePixelEditMessage, transfer?: Transferable[]) => void
}

function validateRequest(request: ModelSourcePixelEditRequest): void {
  const { width, height, displayDataUrl, baseDataUrl } = request.part
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('A peça excede os limites de tamanho para edição.')
  }
  if (!displayDataUrl.startsWith('data:image/') || !baseDataUrl.startsWith('data:image/')) {
    throw new Error('A imagem ou a base do Chroma da peça está inválida.')
  }
  if (request.operation === 'brush') {
    if (!Array.isArray(request.points) || request.points.length > MAX_BRUSH_POINTS
      || request.points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > width || point.y > height)
      || !Number.isFinite(request.size) || request.size <= 0) {
      throw new Error('O traço do pincel está inválido ou excede o limite de pontos.')
    }
  } else if (!/^#[0-9a-f]{6}$/i.test(request.color) || !Number.isFinite(request.tolerance) || request.tolerance < 0 || request.tolerance > 180) {
    throw new Error('A cor ou a semelhança selecionada está inválida.')
  }
}

async function editImage(dataUrl: string, request: ModelSourcePixelEditRequest): Promise<{ png: ArrayBuffer; removedPixels: number }> {
  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error('Não foi possível abrir a imagem da peça no worker.')
  const bitmap = await createImageBitmap(await response.blob())
  let bitmapOpen = true
  const { width, height } = request.part
  try {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas indisponível para editar pixels da peça.')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    bitmapOpen = false

    let removedPixels = 0
    if (request.operation === 'brush') {
      const region = modelSourceBrushRegion(width, height, request.points, request.size, request.outlineOnly)
      if (region) {
        const pixels = context.getImageData(region.x, region.y, region.width, region.height)
        removedPixels = applyModelSourceBrushPixels(pixels, request.points, request.size, request.outlineOnly, region)
        context.putImageData(pixels, region.x, region.y)
      }
    } else {
      const pixels = context.getImageData(0, 0, width, height)
      removedPixels = removeModelSourceColorPixels(pixels, request.color, request.tolerance)
      context.putImageData(pixels, 0, 0)
    }
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return { png: await blob.arrayBuffer(), removedPixels }
  } finally {
    if (bitmapOpen) bitmap.close()
  }
}

workerScope.onmessage = async (event: MessageEvent<ModelSourcePixelEditRequest>) => {
  const request = event.data
  try {
    validateRequest(request)
    const display = await editImage(request.part.displayDataUrl, request)
    const base = await editImage(request.part.baseDataUrl, request)
    const removedPixels = request.operation === 'brush' ? display.removedPixels : Math.max(display.removedPixels, base.removedPixels)
    workerScope.postMessage({ type: 'complete', id: request.id, displayPng: display.png, basePng: base.png, removedPixels }, [display.png, base.png])
  } catch (reason) {
    workerScope.postMessage({ type: 'error', id: request.id, message: reason instanceof Error ? reason.message : 'Não foi possível editar os pixels da peça.' })
  }
}
