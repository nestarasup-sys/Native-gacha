import type { VideoGachaCanvasRaster } from './videoGachaCanvasFrame'

type CropResponse = Readonly<{
  id: number
  bitmap?: ImageBitmap
  width?: number
  height?: number
  crop?: { width: number; height: number } | null
  error?: string
}>
type Pending = {
  resolve: (value: VideoGachaCanvasRaster) => void
  reject: (error: Error) => void
  cleanup: () => void
}
let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, Pending>()

function failAll(error: Error): void {
  const failed = worker
  worker = null
  failed?.terminate()
  for (const [id, task] of pending) {
    pending.delete(id)
    task.cleanup()
    task.reject(error)
  }
}

function getWorker(): Worker {
  if (typeof Worker === 'undefined' || typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new Error('Worker/OffscreenCanvas unavailable')
  }
  if (worker) return worker
  // Electron/Vite bundles the worker as a separate script and process task.
  const instance = new Worker(new URL('./videoGachaPreviewCrop.worker.ts', import.meta.url), { type: 'module' })
  instance.addEventListener('message', (event: MessageEvent<CropResponse>) => {
    const response = event.data
    const task = pending.get(response.id)
    if (!task) { response.bitmap?.close(); return }
    pending.delete(response.id)
    task.cleanup()
    if (response.error || !response.bitmap || !response.width || !response.height) {
      response.bitmap?.close()
      task.reject(new Error(response.error ?? 'Preview crop worker returned an invalid raster'))
      return
    }
    task.resolve({
      canvas: response.bitmap,
      width: response.width,
      height: response.height,
      crop: response.crop ?? null,
    })
  })
  instance.addEventListener('error', () => failAll(new Error('Preview crop worker crashed')))
  instance.addEventListener('messageerror', () => failAll(new Error('Preview crop worker message was invalid')))
  worker = instance
  return instance
}

/** Transfer the temporary raster, crop outside the UI thread and return an ImageBitmap. */
export async function cropGachaCanvasInWorker(
  source: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<VideoGachaCanvasRaster> {
  signal?.throwIfAborted()
  const instance = getWorker()
  const bitmap = await createImageBitmap(source)
  if (signal?.aborted) { bitmap.close(); signal.throwIfAborted() }
  const id = ++nextId
  return new Promise<VideoGachaCanvasRaster>((resolve, reject) => {
    const abort = () => {
      const task = pending.get(id)
      if (!task) return
      pending.delete(id)
      task.cleanup()
      reject(new DOMException('Preview crop cancelled', 'AbortError'))
    }
    const timeout = setTimeout(() => failAll(new Error('Preview crop worker exceeded 15 seconds')), 15000)
    const cleanup = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
    pending.set(id, { resolve, reject, cleanup })
    signal?.addEventListener('abort', abort, { once: true })
    try {
      instance.postMessage({ id, bitmap }, [bitmap])
    } catch (error) {
      bitmap.close()
      pending.delete(id)
      cleanup()
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}
