import {
  createModelSourceComposeWorkerRequest,
  materializeModelSourceResult,
  type ModelSourceComposeMessage,
  type ModelSourceComposeRequest
} from './modelSourceComposeProtocol.ts'
import type { ModelSourceResult } from './modelSource'

export type ModelSourceComposeTask = { result: Promise<ModelSourceResult>; cancel: () => void }
export type ModelSourceComposeErrorKind = 'worker' | 'runtime' | 'cancelled'

export class ModelSourceComposeTaskError extends Error {
  readonly kind: ModelSourceComposeErrorKind

  constructor(message: string, kind: ModelSourceComposeErrorKind) {
    super(message)
    this.name = kind === 'cancelled' ? 'AbortError' : 'ModelSourceComposeTaskError'
    this.kind = kind
  }
}

/** Runs a large composition outside the UI thread and owns worker cleanup. */
export function startModelSourceComposeWorker(
  request: ModelSourceComposeRequest,
  createWorker: () => Worker = () => new Worker(new URL('./modelSourceCompose.worker.ts', import.meta.url), { type: 'module' }),
  signal?: AbortSignal
): ModelSourceComposeTask {
  if (signal?.aborted) {
    const result = Promise.reject<ModelSourceResult>(new ModelSourceComposeTaskError('Composição cancelada.', 'cancelled'))
    return { result, cancel: () => {} }
  }
  const worker = createWorker()
  let settled = false
  let resolveResult!: (value: ModelSourceResult) => void
  let rejectResult!: (reason: unknown) => void
  const result = new Promise<ModelSourceResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  const fail = (error: ModelSourceComposeTaskError) => {
    if (settled) return
    settled = true
    signal?.removeEventListener('abort', cancel)
    worker.terminate()
    rejectResult(error)
  }
  const cancel = () => fail(new ModelSourceComposeTaskError('Composição cancelada.', 'cancelled'))

  worker.onmessage = (event: MessageEvent<ModelSourceComposeMessage>) => {
    if (settled || event.data.id !== request.id) return
    if (event.data.type === 'error') {
      fail(new ModelSourceComposeTaskError(event.data.message, 'worker'))
      return
    }
    try {
      const value = materializeModelSourceResult(request.project, event.data.output)
      settled = true
      signal?.removeEventListener('abort', cancel)
      worker.terminate()
      resolveResult(value)
    } catch (reason) {
      fail(new ModelSourceComposeTaskError(reason instanceof Error ? reason.message : 'A composição do Model Source retornou dados inválidos.', 'runtime'))
    }
  }
  worker.onerror = () => fail(new ModelSourceComposeTaskError('A composição do Model Source falhou.', 'runtime'))
  worker.onmessageerror = () => fail(new ModelSourceComposeTaskError('A resposta da composição do Model Source não pôde ser lida.', 'runtime'))

  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) cancel()
  try {
    if (!settled) {
      worker.postMessage(createModelSourceComposeWorkerRequest(request))
    }
  } catch (reason) {
    fail(new ModelSourceComposeTaskError(reason instanceof Error ? reason.message : 'Não foi possível iniciar a composição do Model Source.', 'runtime'))
  }

  return { result, cancel }
}
