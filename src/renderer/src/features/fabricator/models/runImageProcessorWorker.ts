import type { ImageProcessorMessage, ImageProcessorRequest } from './imageProcessorProtocol'

export type ImageProcessorTask = {
  result: Promise<Extract<ImageProcessorMessage, { type: 'complete' }>>
  cancel: () => void
}

export type ImageProcessorTaskErrorKind = 'worker' | 'runtime' | 'cancelled'

export class ImageProcessorTaskError extends Error {
  readonly kind: ImageProcessorTaskErrorKind

  constructor(message: string, kind: ImageProcessorTaskErrorKind) {
    super(message)
    this.name = 'ImageProcessorTaskError'
    this.kind = kind
  }
}

/** Runs one model-sheet request and owns worker progress, completion, error, and cancellation. */
export function startImageProcessorWorker(
  request: ImageProcessorRequest,
  onProgress: (value: number) => void,
  createWorker: () => Worker = () => new Worker(new URL('./imageProcessor.worker.ts', import.meta.url), { type: 'module' })
): ImageProcessorTask {
  const worker = createWorker()
  let settled = false
  let resolveResult!: (message: Extract<ImageProcessorMessage, { type: 'complete' }>) => void
  let rejectResult!: (reason: unknown) => void
  const result = new Promise<Extract<ImageProcessorMessage, { type: 'complete' }>>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  const fail = (error: ImageProcessorTaskError) => {
    if (settled) return
    settled = true
    worker.terminate()
    rejectResult(error)
  }

  worker.onmessage = (event: MessageEvent<ImageProcessorMessage>) => {
    if (settled || event.data.id !== request.id) return
    if (event.data.type === 'progress') {
      try {
        onProgress(event.data.value)
      } catch (reason) {
        fail(new ImageProcessorTaskError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o progresso do processamento.', 'runtime'))
      }
      return
    }
    if (event.data.type === 'error') {
      fail(new ImageProcessorTaskError(event.data.message, 'worker'))
      return
    }
    settled = true
    worker.terminate()
    resolveResult(event.data)
  }
  worker.onerror = () => fail(new ImageProcessorTaskError('O processamento da imagem falhou.', 'runtime'))

  try {
    worker.postMessage(request satisfies ImageProcessorRequest)
  } catch (reason) {
    fail(new ImageProcessorTaskError(reason instanceof Error ? reason.message : 'Não foi possível iniciar o processamento da imagem.', 'runtime'))
  }

  return {
    result,
    cancel: () => fail(new ImageProcessorTaskError('Operação cancelada.', 'cancelled'))
  }
}
