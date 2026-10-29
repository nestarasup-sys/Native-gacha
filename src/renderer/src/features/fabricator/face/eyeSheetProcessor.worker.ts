import { splitEyeSheetPixels } from './splitEyeSheetPixels.ts'

type Request = { id: number; source: Blob | string }
type Result = { id: number; type: 'complete'; pieces: Array<{ kind: 'eye' | 'pupil' | 'eye-closed'; width: number; height: number; png: ArrayBuffer }> }
type Failure = { id: number; type: 'error'; message: string }
type WorkerScope = { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (message: Result | Failure, transfer?: Transferable[]) => void }
const scope = self as unknown as WorkerScope

async function encodePng(piece: ReturnType<typeof splitEyeSheetPixels>[number]): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(piece.width, piece.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível recortar a folha de olhos.')
  const image = context.createImageData(piece.width, piece.height)
  image.data.set(piece.pixels)
  context.putImageData(image, 0, 0)
  return (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer()
}

scope.onmessage = async ({ data }: MessageEvent<Request>) => {
  let bitmap: ImageBitmap | null = null
  try {
    const source = typeof data.source === 'string' ? await (await fetch(data.source)).blob() : data.source
    bitmap = await createImageBitmap(source)
    const width = bitmap.width
    const height = bitmap.height
    if (width * height > 32_000_000) throw new Error('A folha tem mais de 32 milhões de pixels.')
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Não foi possível abrir a folha de olhos.')
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, width, height).data
    bitmap.close()
    bitmap = null
    canvas.width = 0
    canvas.height = 0

    const separated = splitEyeSheetPixels(pixels, width, height)
    const pieces: Result['pieces'] = []
    for (const piece of separated) pieces.push({ kind: piece.kind, width: piece.width, height: piece.height, png: await encodePng(piece) })
    scope.postMessage({ id: data.id, type: 'complete', pieces }, pieces.map((piece) => piece.png))
  } catch (error) {
    scope.postMessage({ id: data.id, type: 'error', message: error instanceof Error ? error.message : 'Falha ao recortar a folha de olhos.' })
  } finally {
    bitmap?.close()
  }
}
