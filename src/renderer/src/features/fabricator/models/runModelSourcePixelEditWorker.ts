import { pngDataUrlFromBuffer } from './imageData.ts'
import type { ModelSourcePixelEditMessage, ModelSourcePixelEditRequest } from './modelSourcePixelEditProtocol'

export type ModelSourcePixelEditResult = { displayDataUrl: string; baseDataUrl: string; removedPixels: number }
export type ModelSourcePixelEditTask = { result: Promise<ModelSourcePixelEditResult>; cancel: () => void }
export type ModelSourcePixelEditErrorKind = 'worker' | 'runtime' | 'cancelled'

export class ModelSourcePixelEditTaskError extends Error {
  readonly kind: ModelSourcePixelEditErrorKind

  constructor(message: string, kind: ModelSourcePixelEditErrorKind) {
    super(message)
    this.name = kind === 'cancelled' ? 'AbortError' : 'ModelSourcePixelEditTaskError'
    this.kind = kind
  }
}

/** Owns the pixel-edit worker lifecycle, PNG conversion, cancellation, and failure cleanup. */
export function startModelSourcePixelEditWorker(
  request: ModelSourcePixelEditRequest,
  createWorker: () => Worker = () => new Worker(new URL('./modelSourcePixelEdit.worker.ts', import.meta.url), { type: 'module' }),
  signal?: AbortSignal
): ModelSourcePixelEditTask {
  if (signal?.aborted) {
    const result = Promise.reject<ModelSourcePixelEditResult>(new ModelSourcePixelEditTaskError('Operação cancelada.', 'cancelled'))
    return { result, cancel: () => {} }
  }
  const worker = createWorker()
  let settled = false
  let resolveResult!: (value: ModelSourcePixelEditResult) => void
  let rejectResult!: (reason: unknown) => void
  const result = new Promise<ModelSourcePixelEditResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  const fail = (error: ModelSourcePixelEditTaskError) => {
    if (settled) return
    settled = true
    signal?.removeEventListener('abort', cancel)
    worker.terminate()
    rejectResult(error)
  }
  const cancel = () => fail(new ModelSourcePixelEditTaskError('Operação cancelada.', 'cancelled'))

  worker.onmessage = (event: MessageEvent<ModelSourcePixelEditMessage>) => {
    if (settled || event.data.id !== request.id) return
    if (event.data.type === 'error') {
      fail(new ModelSourcePixelEditTaskError(event.data.message, 'worker'))
      return
    }
    try {
      const value = {
        displayDataUrl: pngDataUrlFromBuffer(event.data.displayPng),
        baseDataUrl: pngDataUrlFromBuffer(event.data.basePng),
        removedPixels: event.data.removedPixels
      }
      settled = true
      signal?.removeEventListener('abort', cancel)
      worker.terminate()
      resolveResult(value)
    } catch (reason) {
      fail(new ModelSourcePixelEditTaskError(reason instanceof Error ? reason.message : 'Não foi possível ler as imagens editadas.', 'runtime'))
    }
  }
  worker.onerror = () => fail(new ModelSourcePixelEditTaskError('A edição dos pixels da peça falhou.', 'runtime'))
  worker.onmessageerror = () => fail(new ModelSourcePixelEditTaskError('A resposta da edição da peça não pôde ser lida.', 'runtime'))

  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  try {
    if (!settled) worker.postMessage(request satisfies ModelSourcePixelEditRequest)
  } catch (reason) {
    fail(new ModelSourcePixelEditTaskError(reason instanceof Error ? reason.message : 'Não foi possível iniciar o worker de edição.', 'runtime'))
  }

  return { result, cancel }
}
