import { normalizePalettePixels, type PaletteAssetKind, type PaletteNormalizationReport, type PaletteOverrides } from './paletteNormalizer'

interface PaletteWorkerRequest {
  id: number
  file: File
  kind: PaletteAssetKind
  overrides: PaletteOverrides
  sensitivity: number
}

type PaletteWorkerResponse =
  | { id: number; type: 'complete'; blob: Blob; report: PaletteNormalizationReport }
  | { id: number; type: 'error'; message: string }

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<PaletteWorkerRequest>) => void) | null
  postMessage: (message: PaletteWorkerResponse) => void
}

workerScope.onmessage = async ({ data }: MessageEvent<PaletteWorkerRequest>) => {
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(data.file)
    if (bitmap.width * bitmap.height > 32_000_000) throw new Error('A imagem tem mais de 32 milhões de pixels. Reduza as dimensões para continuar.')
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Não foi possível ler os pixels da imagem.')
    context.drawImage(bitmap, 0, 0)
    bitmap.close(); bitmap = null
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    const report = normalizePalettePixels(image, data.kind, data.overrides, data.sensitivity)
    context.putImageData(image, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    workerScope.postMessage({ id: data.id, type: 'complete', blob, report })
  } catch (error) {
    bitmap?.close()
    workerScope.postMessage({ id: data.id, type: 'error', message: error instanceof Error ? error.message : 'Não foi possível normalizar as cores da imagem.' })
  }
}
