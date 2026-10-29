import type { ModelPart } from '../../../../../shared/fabricator'
import { applyChromaPixels, sampleBackground } from './chroma'
import type { ModelSourceComposeMessage, ModelSourceComposeWorkerRequest } from './modelSourceComposeProtocol'
import { sourceRect } from './modelSourceGeometry'

const MAX_IMAGE_PIXELS = 32_000_000
const MAX_IMAGE_DIMENSION = 8192
const MAX_PARTS = 500
const MAX_IMAGE_DATA_URL_LENGTH = 70 * 1024 * 1024

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ModelSourceComposeWorkerRequest>) => void) | null
  postMessage: (message: ModelSourceComposeMessage) => void
}

function validateRequest(request: ModelSourceComposeWorkerRequest): void {
  const { project, edits, tolerance } = request
  if (!Number.isSafeInteger(request.id) || request.id < 1
    || !project || !Number.isInteger(project.width) || !Number.isInteger(project.height)
    || project.width < 1 || project.height < 1
    || project.width * project.height > MAX_IMAGE_PIXELS
    || !Array.isArray(project.parts) || project.parts.length > MAX_PARTS
    || !edits || !Number.isInteger(tolerance) || tolerance < 0 || tolerance > 280) {
    throw new Error('Os dados da composição do Model Source são inválidos.')
  }
  for (const part of project.parts) {
    if (!part || typeof part.id !== 'string' || typeof part.dataUrl !== 'string'
      || part.dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH || !part.dataUrl.startsWith('data:image/')
      || (part.chromaBaseDataUrl !== undefined && (typeof part.chromaBaseDataUrl !== 'string'
        || part.chromaBaseDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH || !part.chromaBaseDataUrl.startsWith('data:image/')))) {
      throw new Error('Uma das imagens do Model Source está inválida.')
    }
    const rect = sourceRect(part, edits[part.id])
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
      || !Number.isInteger(rect.x) || !Number.isInteger(rect.y)
      || !Number.isInteger(rect.width) || !Number.isInteger(rect.height)
      || rect.x < 0 || rect.y < 0 || rect.width < 1 || rect.height < 1
      || rect.width > MAX_IMAGE_DIMENSION || rect.height > MAX_IMAGE_DIMENSION
      || rect.width * rect.height > MAX_IMAGE_PIXELS
      || rect.x + rect.width > project.width || rect.y + rect.height > project.height) {
      throw new Error('Uma peça não cabe dentro da folha do Model Source.')
    }
  }
}

async function openImage(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error('Não foi possível decodificar uma das peças.')
  const bitmap = await createImageBitmap(await response.blob())
  if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
    bitmap.close()
    throw new Error('Uma imagem do Model Source excede o limite de tamanho.')
  }
  return bitmap
}

function resizeImage(image: CanvasImageSource, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível para edição da fonte.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return canvas
}

function canvasDataUrl(canvas: OffscreenCanvas): Promise<string> {
  return canvas.convertToBlob({ type: 'image/png' }).then(blob => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Não foi possível codificar uma imagem do Model Source.'))
    reader.onerror = () => reject(new Error('Não foi possível codificar uma imagem do Model Source.'))
    reader.readAsDataURL(blob)
  }))
}

async function renderComposition(request: ModelSourceComposeWorkerRequest) {
  const { project, edits, tolerance } = request
  const raw = new OffscreenCanvas(project.width, project.height)
  const rawContext = raw.getContext('2d')
  if (!rawContext) throw new Error('Canvas indisponível para montar o Model Source.')
  rawContext.fillStyle = '#00ff00'
  rawContext.fillRect(0, 0, project.width, project.height)

  const resized: ModelPart[] = []
  const partUpdates = new Map<string, Partial<ModelPart>>()
  for (const part of project.parts) {
    const rect = sourceRect(part, edits[part.id])
    const baseline = sourceRect(part)
    const edited = rect.x !== baseline.x || rect.y !== baseline.y
      || rect.width !== baseline.width || rect.height !== baseline.height
    const sourceImage = await openImage(part.chromaBaseDataUrl ?? part.dataUrl)
    let rawPart: OffscreenCanvas
    try {
      rawPart = resizeImage(sourceImage, rect.width, rect.height)
    } finally {
      sourceImage.close()
    }
    rawContext.drawImage(rawPart, rect.x, rect.y)
    if (!edited) {
      resized.push(part)
      continue
    }

    const originalImage = await openImage(part.dataUrl)
    let displayPart: OffscreenCanvas
    try {
      displayPart = resizeImage(originalImage, rect.width, rect.height)
    } finally {
      originalImage.close()
    }
    const originalAnchor = part.sourceTransform?.jointAnchor
    const dataUrl = await canvasDataUrl(displayPart)
    const chromaBaseDataUrl = await canvasDataUrl(rawPart)
    const sourceTransform: ModelPart['sourceTransform'] = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      rotation: part.sourceTransform?.rotation ?? 0,
      anchorVersion: 1,
      ...(originalAnchor ? {
        jointAnchor: {
          x: rect.x + (originalAnchor.x - baseline.x) * rect.width / baseline.width,
          y: rect.y + (originalAnchor.y - baseline.y) * rect.height / baseline.height
        }
      } : {})
    }
    resized.push({
      ...part,
      width: rect.width,
      height: rect.height,
      resizeBase: { width: rect.width, height: rect.height },
      sourceTransform,
      dataUrl,
      chromaBaseSaved: true,
      chromaBaseDataUrl
    })
    partUpdates.set(part.id, {
      width: rect.width,
      height: rect.height,
      resizeBase: { width: rect.width, height: rect.height },
      sourceTransform,
      dataUrl,
      chromaBaseSaved: true,
      chromaBaseDataUrl
    })
  }

  const sourceDataUrl = await canvasDataUrl(raw)
  let adjusted = resized
  if (tolerance !== project.tolerance) {
    const sourceImage = await openImage(sourceDataUrl)
    let background: ReturnType<typeof sampleBackground>
    try {
      const sampleCanvas = new OffscreenCanvas(128, 128)
      const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
      if (!sampleContext) throw new Error('Não foi possível analisar o fundo original.')
      sampleContext.drawImage(sourceImage, 0, 0, 128, 128)
      const sample = sampleContext.getImageData(0, 0, 128, 128)
      background = sampleBackground(sample.data, sample.width, sample.height)
    } finally {
      sourceImage.close()
    }

    adjusted = []
    for (const part of resized) {
      const baseDataUrl = part.chromaBaseDataUrl ?? part.dataUrl
      const image = await openImage(baseDataUrl)
      let dataUrl = part.dataUrl
      try {
        const canvas = new OffscreenCanvas(image.width, image.height)
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (context) {
          context.drawImage(image, 0, 0)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
          applyChromaPixels(pixels.data, background, tolerance)
          context.putImageData(pixels, 0, 0)
          dataUrl = await canvasDataUrl(canvas)
        }
      } finally {
        image.close()
      }
      adjusted.push({
        ...part,
        dataUrl,
        chromaBaseDataUrl: baseDataUrl,
        chromaBaseSaved: true
      })
      partUpdates.set(part.id, {
        ...partUpdates.get(part.id),
        dataUrl,
        chromaBaseDataUrl: baseDataUrl,
        chromaBaseSaved: true
      })
    }
  }

  const preview = new OffscreenCanvas(project.width, project.height)
  const view = preview.getContext('2d')
  if (!view) throw new Error('Canvas indisponível para renderizar a prévia.')
  for (const part of adjusted) {
    const rect = sourceRect(part, edits[part.id])
    const image = await openImage(part.dataUrl)
    try {
      view.drawImage(image, rect.x, rect.y, rect.width, rect.height)
    } finally {
      image.close()
    }
  }

  return {
    sourceDataUrl,
    previewDataUrl: await canvasDataUrl(preview),
    tolerance,
    partUpdates: Array.from(partUpdates, ([id, patch]) => ({ id, patch }))
  }
}

workerScope.onmessage = async (event: MessageEvent<ModelSourceComposeWorkerRequest>) => {
  const request = event.data
  try {
    validateRequest(request)
    workerScope.postMessage({ type: 'complete', id: request.id, output: await renderComposition(request) })
  } catch (reason) {
    workerScope.postMessage({
      type: 'error',
      id: request.id,
      message: reason instanceof Error ? reason.message : 'Não foi possível compor o Model Source.'
    })
  }
}
