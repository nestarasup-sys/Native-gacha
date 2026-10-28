import type { ChromaAdjustMessage, ChromaAdjustRequest } from './chromaAdjustProtocol'
import { pngDataUrlFromBuffer } from './imageData.ts'

export type ChromaAdjustTask = {
  result: Promise<Map<string, string>>
  cancel: () => void
}

export type ChromaAdjustTaskErrorKind = 'worker' | 'runtime' | 'cancelled'

export class ChromaAdjustTaskError extends Error {
  readonly kind: ChromaAdjustTaskErrorKind

  constructor(message: string, kind: ChromaAdjustTaskErrorKind) {
    super(message)
    this.name = 'ChromaAdjustTaskError'
    this.kind = kind
  }
}

/** Runs one chroma worker request and owns its completion, error, and cancellation cleanup. */
export function startChromaAdjustWorker(
  request: ChromaAdjustRequest,
  createWorker: () => Worker = () => new Worker(new URL('./chromaAdjust.worker.ts', import.meta.url), { type: 'module' })
): ChromaAdjustTask {
  const worker = createWorker()
  let settled = false
  let resolveResult!: (assets: Map<string, string>) => void
  let rejectResult!: (reason: unknown) => void
  const result = new Promise<Map<string, string>>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  const fail = (error: ChromaAdjustTaskError) => {
    if (settled) return
    settled = true
    worker.terminate()
    rejectResult(error)
  }

  worker.onmessage = (event: MessageEvent<ChromaAdjustMessage>) => {
    if (settled || event.data.id !== request.id) return
    if (event.data.type === 'error') {
      fail(new ChromaAdjustTaskError(event.data.message, 'worker'))
      return
    }
    try {
      const assets = new Map(event.data.parts.map(({ id, png }) => [id, pngDataUrlFromBuffer(png)]))
      settled = true
      worker.terminate()
      resolveResult(assets)
    } catch (reason) {
      fail(new ChromaAdjustTaskError(reason instanceof Error ? reason.message : 'Não foi possível ler os PNGs ajustados.', 'runtime'))
    }
  }
  worker.onerror = () => fail(new ChromaAdjustTaskError('Não foi possível aplicar o Chroma Key.', 'runtime'))

  try {
    worker.postMessage(request satisfies ChromaAdjustRequest)
  } catch (reason) {
    fail(new ChromaAdjustTaskError(reason instanceof Error ? reason.message : 'Não foi possível iniciar o worker de Chroma Key.', 'runtime'))
  }

  return {
    result,
    cancel: () => fail(new ChromaAdjustTaskError('Operação cancelada.', 'cancelled'))
  }
}
