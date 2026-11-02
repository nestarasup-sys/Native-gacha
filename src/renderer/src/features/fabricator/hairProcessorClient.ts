import type { HairGridSplits } from './hairGridLayout'

export type HairProcessorCut = { png: ArrayBuffer; width: number; height: number }
export type HairProcessorMode = 'auto' | 'green' | 'checker'
export type HairProcessorLayout = 'pair' | 'three-style-grid'
export type HairProcessorResult =
  | { type: 'complete'; layout: 'pair'; front: HairProcessorCut; back: HairProcessorCut }
  | { type: 'complete'; layout: 'three-style-grid'; styles: Array<{ front: HairProcessorCut; back: HairProcessorCut; source: HairProcessorCut; rowBoundary: number[] }>; splits: HairGridSplits }
  | { type: 'error'; message: string }

export type HairProcessorRequest = {
  dataUrl: string
  tolerance: number
  mode: HairProcessorMode
  layout: HairProcessorLayout
  paddingPercent: number
  gridSplits?: HairGridSplits
}

export type HairProcessorWorker = Pick<Worker, 'onmessage' | 'onerror' | 'postMessage' | 'terminate'>
export type HairProcessorWorkerFactory = (url: URL, options: WorkerOptions) => HairProcessorWorker

export function runHairProcessor(
  request: HairProcessorRequest,
  createWorker: HairProcessorWorkerFactory = (url, options) => new Worker(url, options)
): Promise<HairProcessorResult> {
  return new Promise((resolve, reject) => {
    const worker = createWorker(new URL('./hairProcessor.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const stopWorker = () => {
      if (settled) return
      settled = true
      worker.terminate()
    }

    worker.onmessage = ({ data }: MessageEvent<HairProcessorResult>) => {
      if (settled) return
      stopWorker()
      if (data.type === 'error') { reject(new Error(data.message)); return }
      if (data.layout !== request.layout) { reject(new Error('O processador retornou um formato de cabelo inesperado.')); return }
      resolve(data)
    }
    worker.onerror = () => {
      if (settled) return
      stopWorker()
      reject(new Error('Não foi possível processar o chroma da folha de cabelo.'))
    }

    try { worker.postMessage(request) }
    catch (reason) {
      stopWorker()
      reject(reason)
    }
  })
}
