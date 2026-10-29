import { pngBufferToDataUrl } from './pngBufferToDataUrl.ts'

export type EyeSheetPiece = {
  kind: 'eye' | 'pupil' | 'eye-closed'
  dataUrl: string
  width: number
  height: number
}

type WorkerReply =
  | { id: number; type: 'complete'; pieces: Array<Omit<EyeSheetPiece, 'dataUrl'> & { png: ArrayBuffer }> }
  | { id: number; type: 'error'; message: string }

function createAbortError(): Error {
  const error = new Error('Importação da folha de olhos cancelada.')
  error.name = 'AbortError'
  return error
}

export function splitEyeSheet(source: File | string, signal?: AbortSignal): Promise<EyeSheetPiece[]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError())
      return
    }
    const worker = new Worker(new URL('./eyeSheetProcessor.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => {
      signal?.removeEventListener('abort', onAbort)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
    }
    const onAbort = () => {
      finish()
      reject(createAbortError())
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      finish()
      if (data.type === 'error') {
        reject(new Error(data.message))
        return
      }
      try {
        resolve(data.pieces.map(({ png, ...piece }) => ({ ...piece, dataUrl: pngBufferToDataUrl(png) })))
      } catch (error) {
        reject(error)
      }
    }
    worker.onerror = () => {
      finish()
      reject(new Error('Não foi possível separar a folha de olhos.'))
    }
    worker.onmessageerror = () => {
      finish()
      reject(new Error('Não foi possível receber as peças da folha de olhos.'))
    }
    try {
      worker.postMessage({ id: 1, source })
    } catch (error) {
      finish()
      reject(error)
    }
  })
}
