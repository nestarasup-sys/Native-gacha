import type { ModelPart } from '../../../../../shared/fabricator'
import { applyChromaPixels, sampleBackground } from './chroma'
import { loadImageFromDataUrl } from './imageData'
import type { ModelSourceComposeOutput, ModelSourceComposeWorkerRequest } from './modelSourceComposeProtocol'
import { sourceRect } from './modelSourceGeometry'

const MAX_IMAGE_PIXELS = 32_000_000
const MAX_IMAGE_DIMENSION = 8192
const MAX_PARTS = 500
const MAX_IMAGE_DATA_URL_LENGTH = 70 * 1024 * 1024
export type ModelSourceComposeExecution = 'renderer' | 'worker'
type ComposeCanvas = HTMLCanvasElement | OffscreenCanvas

export function validateModelSourceComposeRequest(request: ModelSourceComposeWorkerRequest): void {
  if (!request || typeof request !== 'object') throw new Error('Os dados da composição do Model Source são inválidos.')
  const { project, edits, tolerance } = request
  if (!Number.isSafeInteger(request.id) || request.id < 1
    || !project || !Number.isInteger(project.width) || !Number.isInteger(project.height)
    || project.width < 1 || project.height < 1
    || project.width * project.height > MAX_IMAGE_PIXELS
    || !Array.isArray(project.parts) || project.parts.length > MAX_PARTS
    || !edits || typeof edits !== 'object'
    || !Number.isInteger(tolerance) || tolerance < 0 || tolerance > 280) {
    throw new Error('Os dados da composição do Model Source são inválidos.')
  }
  const partIds = new Set(project.parts.map(part => part?.id))
  if (Object.keys(edits).some(id => !partIds.has(id))) throw new Error('Uma edição aponta para uma peça desconhecida.')
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

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('Composição do Model Source cancelada.')
  error.name = 'AbortError'
  throw error
}

async function openImage(
  dataUrl: string,
  signal: AbortSignal | undefined,
  execution: ModelSourceComposeExecution
): Promise<ImageBitmap | HTMLImageElement> {
  throwIfAborted(signal)
  if (execution === 'renderer') {
    const image = await loadImageFromDataUrl(dataUrl, 'Não foi possível decodificar uma das peças.', signal)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS) {
      image.removeAttribute('src')
      throw new Error('Uma imagem do Model Source excede o limite de tamanho.')
    }
    return image
  }
  const response = await fetch(dataUrl, { signal })
  if (!response.ok) throw new Error('Não foi possível decodificar uma das peças.')
  const bitmap = await createImageBitmap(await response.blob())
  if (signal?.aborted) {
    bitmap.close()
    throwIfAborted(signal)
  }
  if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
    bitmap.close()
    throw new Error('Uma imagem do Model Source excede o limite de tamanho.')
  }
  return bitmap
}

function closeImage(image: ImageBitmap | HTMLImageElement): void {
  if ('close' in image && typeof image.close === 'function') image.close()
}

function createCanvas(width: number, height: number, execution: ModelSourceComposeExecution): ComposeCanvas {
  if (execution === 'worker') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function resizeImage(image: CanvasImageSource, width: number, height: number, execution: ModelSourceComposeExecution): ComposeCanvas {
  const canvas = createCanvas(width, height, execution)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível para edição da fonte.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return canvas
}

function canvasDataUrl(canvas: ComposeCanvas, signal: AbortSignal | undefined, execution: ModelSourceComposeExecution): Promise<string> {
  throwIfAborted(signal)
  if (execution === 'renderer') return Promise.resolve((canvas as HTMLCanvasElement).toDataURL('image/png'))
  return (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' }).then(blob => new Promise((resolve, reject) => {
    throwIfAborted(signal)
    const reader = new FileReader()
    const cleanup = () => signal?.removeEventListener('abort', abort)
    const abort = () => reader.abort()
    reader.onload = () => {
      cleanup()
      if (signal?.aborted) {
        const error = new Error('Composição do Model Source cancelada.')
        error.name = 'AbortError'
        reject(error)
      } else if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Não foi possível codificar uma imagem do Model Source.'))
    }
    reader.onerror = () => { cleanup(); reject(new Error('Não foi possível codificar uma imagem do Model Source.')) }
    reader.onabort = () => { cleanup(); reject(new DOMException('Composição do Model Source cancelada.', 'AbortError')) }
    signal?.addEventListener('abort', abort, { once: true })
    reader.readAsDataURL(blob)
  }))
}

export async function composeModelSourceImages(
  request: ModelSourceComposeWorkerRequest,
  signal?: AbortSignal,
  execution: ModelSourceComposeExecution = 'worker'
): Promise<ModelSourceComposeOutput> {
  validateModelSourceComposeRequest(request)
  throwIfAborted(signal)
  const { project, edits, tolerance } = request
  const raw = createCanvas(project.width, project.height, execution)
  const rawContext = raw.getContext('2d')
  if (!rawContext) throw new Error('Canvas indisponível para montar o Model Source.')
  rawContext.fillStyle = '#00ff00'
  rawContext.fillRect(0, 0, project.width, project.height)

  const resized: ModelPart[] = []
  const partUpdates = new Map<string, Partial<ModelPart>>()
  for (const part of project.parts) {
    throwIfAborted(signal)
    const rect = sourceRect(part, edits[part.id])
    const baseline = sourceRect(part)
    const edited = rect.x !== baseline.x || rect.y !== baseline.y
      || rect.width !== baseline.width || rect.height !== baseline.height
    const sourceImage = await openImage(part.chromaBaseDataUrl ?? part.dataUrl, signal, execution)
    let rawPart: ComposeCanvas
    try {
      rawPart = resizeImage(sourceImage, rect.width, rect.height, execution)
    } finally {
      closeImage(sourceImage)
    }
    rawContext.drawImage(rawPart, rect.x, rect.y)
    if (!edited) {
      resized.push(part)
      continue
    }

    const originalImage = await openImage(part.dataUrl, signal, execution)
    let displayPart: ComposeCanvas
    try {
      displayPart = resizeImage(originalImage, rect.width, rect.height, execution)
    } finally {
      closeImage(originalImage)
    }
    const originalAnchor = part.sourceTransform?.jointAnchor
    const dataUrl = await canvasDataUrl(displayPart, signal, execution)
    const chromaBaseDataUrl = await canvasDataUrl(rawPart, signal, execution)
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

  const sourceDataUrl = await canvasDataUrl(raw, signal, execution)
  let adjusted = resized
  if (tolerance !== project.tolerance) {
    const sourceImage = await openImage(sourceDataUrl, signal, execution)
    let background: ReturnType<typeof sampleBackground>
    try {
      const sampleCanvas = createCanvas(128, 128, execution)
      const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
      if (!sampleContext) throw new Error('Não foi possível analisar o fundo original.')
      sampleContext.drawImage(sourceImage, 0, 0, 128, 128)
      const sample = sampleContext.getImageData(0, 0, 128, 128)
      background = sampleBackground(sample.data, sample.width, sample.height)
    } finally {
      closeImage(sourceImage)
    }

    adjusted = []
    for (const part of resized) {
      throwIfAborted(signal)
      const baseDataUrl = part.chromaBaseDataUrl ?? part.dataUrl
      const image = await openImage(baseDataUrl, signal, execution)
      let dataUrl = part.dataUrl
      try {
        const canvas = createCanvas(image.width, image.height, execution)
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (context) {
          context.drawImage(image, 0, 0)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
          applyChromaPixels(pixels.data, background, tolerance)
          context.putImageData(pixels, 0, 0)
          dataUrl = await canvasDataUrl(canvas, signal, execution)
        }
      } finally {
        closeImage(image)
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

  const preview = createCanvas(project.width, project.height, execution)
  const view = preview.getContext('2d')
  if (!view) throw new Error('Canvas indisponível para renderizar a prévia.')
  for (const part of adjusted) {
    throwIfAborted(signal)
    const rect = sourceRect(part, edits[part.id])
    const image = await openImage(part.dataUrl, signal, execution)
    try {
      view.drawImage(image, rect.x, rect.y, rect.width, rect.height)
    } finally {
      closeImage(image)
    }
  }

  return {
    sourceDataUrl,
    previewDataUrl: await canvasDataUrl(preview, signal, execution),
    tolerance,
    partUpdates: Array.from(partUpdates, ([id, patch]) => ({ id, patch }))
  }
}
