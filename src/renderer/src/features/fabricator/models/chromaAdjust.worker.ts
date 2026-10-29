import { applyChromaPixels, sampleBackground } from './chroma'
import type { ChromaAdjustMessage, ChromaAdjustRequest } from './chromaAdjustProtocol'
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ChromaAdjustRequest>) => void) | null
  postMessage: (message: ChromaAdjustMessage, transfer?: Transferable[]) => void
}

workerScope.onmessage = async (event: MessageEvent<ChromaAdjustRequest>) => {
  const { id, sourceDataUrl, tolerance, parts } = event.data
  try {
    const source = await createImageBitmap(await (await fetch(sourceDataUrl)).blob())
    const sampleCanvas = new OffscreenCanvas(128, 128)
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true })
    if (!sampleContext) throw new Error('Não foi possível analisar o fundo original.')
    sampleContext.drawImage(source, 0, 0, 128, 128)
    const sample = sampleContext.getImageData(0, 0, 128, 128)
    const background = sampleBackground(sample.data, sample.width, sample.height)
    source.close()

    const adjusted: Extract<ChromaAdjustMessage, { type: 'complete' }>['parts'] = []
    for (const part of parts) {
      const image = await createImageBitmap(await (await fetch(part.dataUrl)).blob())
      const canvas = new OffscreenCanvas(image.width, image.height)
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) { image.close(); continue }
      context.drawImage(image, 0, 0)
      image.close()
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      applyChromaPixels(pixels.data, background, tolerance)
      context.putImageData(pixels, 0, 0)
      adjusted.push({ id: part.id, png: await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer() })
    }
    workerScope.postMessage({ type: 'complete', id, parts: adjusted }, adjusted.map((part) => part.png))
  } catch (error) {
    workerScope.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : 'Não foi possível ajustar o chroma key.' })
  }
}
