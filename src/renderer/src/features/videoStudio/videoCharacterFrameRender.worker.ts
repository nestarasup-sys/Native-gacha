import type { VideoExportCharacterSnapshot } from '../../../../shared/videoExportCharacters'
import type { VideoCharacterRenderAssetSnapshot } from '../../../../shared/videoCharacterRenderAssets'
import { VideoStudioResourceBudget } from '../../../../shared/videoStudioNext/resourceBudget'
import type { VideoSceneFrame } from '../../../../shared/videoSceneIR'
import { configureVideoExportCharacterImageCaches, workerCharacterImageCacheStats } from '../../characters/characterImageMemos'
import { VideoCharacterFrameRenderer } from './videoCharacterFrameRenderer'

type InitMessage = Readonly<{
  type: 'init'
  characters: VideoExportCharacterSnapshot
  characterAssets: VideoCharacterRenderAssetSnapshot
}>
type RenderMessage = Readonly<{ type: 'frame'; id: number; frame: VideoSceneFrame }>
type CancelMessage = Readonly<{ type: 'cancel'; id: number }>
type WorkerRequest = InitMessage | RenderMessage | CancelMessage

const scope = self as unknown as {
  postMessage(message: unknown, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void
  addEventListener(type: 'messageerror', listener: () => void): void
}
const controllers = new Map<number, AbortController>()
let renderer: VideoCharacterFrameRenderer | null = null
let budget: VideoStudioResourceBudget | null = null
let busy = false

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function postError(id: number, error: unknown, cancelled = false): void {
  scope.postMessage({ type: 'error', id, error: errorText(error), cancelled })
}

scope.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (!message || typeof message !== 'object') return
  if (message.type === 'cancel') {
    controllers.get(message.id)?.abort(new DOMException('Renderização Gacha cancelada.', 'AbortError'))
    return
  }
  if (message.type === 'init') {
    const started = performance.now()
    try {
      if (renderer) throw new Error('Worker Gacha já foi inicializado.')
      budget = new VideoStudioResourceBudget(224 * 1024 * 1024)
      configureVideoExportCharacterImageCaches(budget)
      renderer = new VideoCharacterFrameRenderer(message.characters, message.characterAssets, budget)
      scope.postMessage({ type: 'ready', initMs: performance.now() - started, budgetBytes: budget.limitBytes })
    } catch (error) {
      postError(0, error)
    }
    return
  }
  if (message.type !== 'frame') return
  const { id, frame } = message
  if (!renderer || !budget) {
    postError(id, new Error('Worker Gacha ainda não está pronto.'))
    return
  }
  if (busy) {
    postError(id, new Error('Backpressure: o Worker ainda está renderizando o frame anterior.'))
    return
  }
  busy = true
  const controller = new AbortController()
  controllers.set(id, controller)
  void (async () => {
    const started = performance.now()
    let renderMs = 0
    let bitmapMs = 0
    try {
      const renderStarted = performance.now()
      const rendered = await renderer!.renderFrame(frame, true, controller.signal)
      renderMs = performance.now() - renderStarted
      controller.signal.throwIfAborted()
      const transfer: Transferable[] = []
      const states: Array<{ elementId: string; state: (typeof rendered extends ReadonlyMap<string, infer T> ? T : never) }> = []
      const bitmapStarted = performance.now()
      for (const [elementId, state] of rendered) {
        const source = state.canvasImage
        if (source && !(source instanceof ImageBitmap)) {
          const bitmap = await createImageBitmap(source)
          transfer.push(bitmap)
          states.push({ elementId, state: { ...state, imageDataUrl: '', canvasImage: bitmap } })
        } else if (source instanceof ImageBitmap) {
          const bitmap = await createImageBitmap(source)
          transfer.push(bitmap)
          states.push({ elementId, state: { ...state, imageDataUrl: '', canvasImage: bitmap } })
        } else states.push({ elementId, state })
      }
      bitmapMs = performance.now() - bitmapStarted
      controller.signal.throwIfAborted()
      scope.postMessage({
        type: 'frame', id, frame: frame.frame, states,
        timings: {
          workerRenderMs: renderMs,
          workerBitmapMs: bitmapMs,
          workerTotalMs: performance.now() - started,
          transferBytes: states.reduce((sum, entry) => sum + (entry.state.canvasImage
            ? entry.state.canvasImage.width * entry.state.canvasImage.height * 4 : 0), 0),
          transferCount: transfer.length,
          frameCache: renderer!.diagnostics(),
          imageCache: workerCharacterImageCacheStats(),
          budget: budget!.snapshot(),
        },
      }, transfer)
    } catch (error) {
      postError(id, error, controller.signal.aborted)
    } finally {
      controllers.delete(id)
      busy = false
    }
  })()
})

scope.addEventListener('messageerror', () => {
  for (const controller of controllers.values()) controller.abort(new Error('Mensagem inválida recebida pelo Worker Gacha.'))
})

export {}
