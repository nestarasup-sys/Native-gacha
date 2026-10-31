import { BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { editorV6IpcChannels } from '../../../src/shared/editorV6IpcChannels'
import { editorV6MotionChannels, editorV6UsesStaticMouthAtlas, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import { editorV6MotionResultSchema, parseEditorV6MotionRequest } from '../../../src/shared/editorV6Schema'
import { isCustomizerCharacter } from '../customizer/validation'
import { waitForExport } from './exportProcess'
import { createMotionDiskCache, motionCacheKey, type EditorV6MotionCacheStats } from './motionCache'
import { restrictRendererNavigation } from '../../windowNavigation'
import { restrictRendererPermissions } from '../../windowPermissions'
import { restrictRendererResources } from '../../windowResourcePolicy'

type Active = { request: EditorV6MotionBakeRequest; resolve: (result: EditorV6MotionBakeResult) => void; reject: (error: Error) => void }
type Lane = { partition: string; window?: BrowserWindow; active?: Active; delivery?: EditorV6MotionBakeRequest; waiting?: (request: EditorV6MotionBakeRequest | null) => void; idle?: ReturnType<typeof setTimeout>; tail: Promise<void>; count: number }
const retiredWorkers = new Set<number>()
function retire(id: number) {
  retiredWorkers.add(id)
  while (retiredWorkers.size > 128) retiredWorkers.delete(retiredWorkers.values().next().value!)
}

export function createEditorV6MotionService(deps: { ipcMain: Pick<IpcMain, 'handle'>; assertTrustedSender: (event: IpcMainInvokeEvent) => void; html: string; preload: string; devUrl?: string; cacheDirectory?: string; concurrency?: 1 | 2 }) {
  const workers = new Map<number, Lane>()
  const jobs = new Map<string, { owner: number; controller: AbortController; cancelled: boolean }>()
  const cache = new Map<string, EditorV6MotionBakeResult>()
  const inFlight = new Map<string, { controller: AbortController; subscribers: Set<symbol>; promise: Promise<EditorV6MotionBakeResult>; settled: boolean }>()
  const disk = deps.cacheDirectory ? createMotionDiskCache(deps.cacheDirectory) : undefined
  const cacheStats: EditorV6MotionCacheStats = { memoryHits: 0, diskHits: 0, misses: 0, rasterized: 0, diskMissing: 0, diskRejected: 0, diskReadErrors: 0, diskWrites: 0, diskWriteSkipped: 0, diskWriteErrors: 0, diskBytesRead: 0, diskBytesWritten: 0 }
  // A lane reuses one in-memory session, keeping worker storage isolated and bounded by concurrency.
  const lanes: Lane[] = Array.from({ length: deps.concurrency ?? 1 }, () => ({ partition: `editor-v6-motion-${crypto.randomUUID()}`, tail: Promise.resolve(), count: 0 }))
  let stopped = false
  const worker = (event: IpcMainInvokeEvent) => {
    const lane = workers.get(event.sender.id)
    if (!lane || event.senderFrame !== event.sender.mainFrame) throw Error('Preparador de animação não autorizado.')
    return lane
  }
  deps.ipcMain.handle(editorV6MotionChannels.payload, (event) => {
    if (stopped || retiredWorkers.has(event.sender.id)) return null
    const lane = worker(event)
    if (lane.delivery) { const request = lane.delivery; lane.delivery = undefined; return request }
    if (lane.waiting) throw Error('O preparador já está esperando trabalho.')
    return new Promise<EditorV6MotionBakeRequest | null>((resolve) => { lane.waiting = resolve })
  })
  deps.ipcMain.handle(editorV6MotionChannels.complete, (event, rawResult, error?: string) => {
    if (stopped || retiredWorkers.has(event.sender.id)) return
    const job = worker(event).active
    if (!job) throw Error('O preparador não tem uma transição ativa.')
    if (error) { job.reject(Error(String(error).slice(0, 5000))); return }
    try {
      const result = editorV6MotionResultSchema.parse(rawResult)
      if (result.motion.key !== job.request.plan.key || result.motion.frames.map((frame) => frame.offset).join(',') !== job.request.plan.samples.map((sample) => sample.offset).join(',')) throw Error('O preparador retornou uma animação de outra revisão.')
      if (job.request.maxAtlasPixels !== undefined && result.metrics.atlasPixels > job.request.maxAtlasPixels) throw Error('O preparador excedeu o orçamento de pixels da requisição.')
      const needsFaceAsset = Boolean(job.request.mouthScaleSamples?.some((scale) => scale > 1.000001) && !editorV6UsesStaticMouthAtlas(job.request))
      if (job.request.mouthScaleSamples?.some((scale, index) => scale > 1.000001 && !result.motion.frames[index]?.facePatch)
        || needsFaceAsset && (!result.faceAsset || result.motion.faceAssetId !== result.faceAsset.id)) throw Error('O preparador não retornou a camada facial obrigatória da animação da boca.')
      job.resolve(result)
    } catch (reason) { job.reject(reason instanceof Error ? reason : Error(String(reason))) }
  })
  function close(lane: Lane) {
    clearTimeout(lane.idle)
    const window = lane.window
    lane.waiting?.(null)
    lane.window = undefined; lane.delivery = undefined; lane.waiting = undefined
    if (window && !window.isDestroyed()) { retire(window.webContents.id); workers.delete(window.webContents.id); window.destroy() }
  }
  async function render(lane: Lane, request: EditorV6MotionBakeRequest, signal: AbortSignal) {
    signal.throwIfAborted()
    clearTimeout(lane.idle)
    let resolve!: Active['resolve'], reject!: Active['reject']
    const completion = new Promise<EditorV6MotionBakeResult>((yes, no) => { resolve = yes; reject = no })
    void completion.catch(() => {})
    lane.active = { request, resolve, reject }
    const abort = () => close(lane)
    signal.addEventListener('abort', abort, { once: true })
    try {
      if (!lane.window || lane.window.isDestroyed()) {
        const window = new BrowserWindow({ show: false, width: 320, height: 180, webPreferences: { preload: deps.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true, devTools: false, partition: lane.partition } })
        restrictRendererNavigation(window.webContents)
        restrictRendererPermissions(window.webContents.session)
        restrictRendererResources(window.webContents.session, { html: deps.html, devUrl: deps.devUrl })
        lane.window = window; lane.delivery = request
        workers.set(window.webContents.id, lane)
        const workerId = window.webContents.id
        window.once('closed', () => {
          retire(workerId); workers.delete(workerId)
          if (lane.window === window) {
            lane.window = undefined; lane.waiting?.(null); lane.waiting = undefined
            lane.active?.reject(Error('O preparador de animação foi encerrado.'))
          }
        })
        await waitForExport(deps.devUrl ? window.loadURL(deps.devUrl.split('#')[0] + '#/editor-v6-transition-baker') : window.loadFile(deps.html, { hash: '/editor-v6-transition-baker' }), signal, 60000, 'abrir preparação de animações')
      } else if (lane.waiting) { const deliver = lane.waiting; lane.waiting = undefined; deliver(request) }
      else lane.delivery = request
      const result = await waitForExport(completion, signal, 180000, 'preparar animação do personagem')
      lane.idle = setTimeout(() => close(lane), 30_000)
      lane.idle.unref()
      return result
    } catch (error) { close(lane); throw error }
    finally { lane.active = undefined; signal.removeEventListener('abort', abort) }
  }
  const validateRequest = (request: EditorV6MotionBakeRequest) => {
    const { plan, character } = request
    if (!isCustomizerCharacter(character) || character.id !== plan.characterId || plan.from.characterId !== plan.characterId || plan.to.characterId !== plan.characterId || plan.from.id !== plan.elementId || plan.to.id !== plan.elementId || plan.endFrame <= plan.startFrame || plan.endFrame - plan.startFrame > 7.50001 || plan.samples.some((sample) => Math.abs(sample.progress - (plan.endFrame + sample.offset - plan.startFrame) / (plan.endFrame - plan.startFrame)) > 1e-6) || request.mouthScaleSamples && request.mouthScaleSamples.length !== plan.samples.length || request.maxAtlasPixels !== undefined && !request.mouthScaleSamples) throw Error('Dados de animação incompatíveis com o personagem.')
  }
  const remember = (key: string, result: EditorV6MotionBakeResult) => {
    cache.delete(key); cache.set(key, result)
    const bytes = () => [...cache.values()].reduce((total, item) => total + item.asset.dataUrl.length + (item.faceAsset?.dataUrl.length ?? 0), 0)
    while (cache.size > 8 || bytes() > 24_000_000) cache.delete(cache.keys().next().value!)
  }
  const assertAtlasBudget = (request: EditorV6MotionBakeRequest, result: EditorV6MotionBakeResult) => {
    if (request.maxAtlasPixels !== undefined && result.metrics.atlasPixels > request.maxAtlasPixels) throw Error('O atlas em cache excede o orçamento desta requisição.')
  }
  const runBake = (request: EditorV6MotionBakeRequest, signal: AbortSignal) => {
    if (stopped) return Promise.reject(Error('O preparador está encerrando.'))
    const key = motionCacheKey(request)
    const lane = lanes.reduce((best, candidate) => candidate.count < best.count ? candidate : best)
    lane.count++
    const promise = lane.tail.catch(() => {}).then(async () => {
      signal.throwIfAborted()
      if (stopped) throw Error('O preparador está encerrando.')
      let cached = cache.get(key)
      if (cached) cacheStats.memoryHits++
      else if (disk) {
        const entry = await disk.readWithStats(request)
        if ('result' in entry) { cached = entry.result; cacheStats.diskHits++; cacheStats.diskBytesRead += entry.bytes }
        else if (entry.miss === 'missing') cacheStats.diskMissing++
        else if (entry.miss === 'rejected') cacheStats.diskRejected++
        else cacheStats.diskReadErrors++
      }
      signal.throwIfAborted()
      if (cached) { assertAtlasBudget(request, cached); remember(key, cached); return cached }
      cacheStats.misses++
      const result = await render(lane, request, signal)
      cacheStats.rasterized++
      remember(key, result)
      if (disk) {
        try {
          const write = await disk.write(request, result)
          if (write.stored) { cacheStats.diskWrites++; cacheStats.diskBytesWritten += write.bytes }
          else cacheStats.diskWriteSkipped++
        } catch (error) {
          cacheStats.diskWriteErrors++
          console.warn('Cache de transições indisponível:', error instanceof Error ? error.message : String(error))
        }
      }
      return result
    }).finally(() => { lane.count--; if (signal.aborted) close(lane) })
    lane.tail = promise.then(() => {}, () => {})
    return promise
  }
  const enqueueBake = (request: EditorV6MotionBakeRequest, signal: AbortSignal): Promise<EditorV6MotionBakeResult> => {
    if (signal.aborted) return Promise.reject(signal.reason ?? Error('Preparação de animação cancelada.'))
    // The disk/memory cache can reuse an atlas across budgets after validation,
    // but concurrent renders must have the same cap or the first request could
    // fail another subscriber that had a larger safe budget.
    const key = `${motionCacheKey(request)}:pixels=${request.maxAtlasPixels ?? 'unbounded'}`
    let flight = inFlight.get(key)
    if (!flight || flight.controller.signal.aborted) {
      const controller = new AbortController()
      const created = {
        controller,
        subscribers: new Set<symbol>(),
        settled: false,
        promise: Promise.resolve().then(() => runBake(request, controller.signal)).finally(() => {
          created.settled = true
          if (inFlight.get(key) === created) inFlight.delete(key)
        })
      }
      // A flight can be cancelled before any consumer attaches; keep its rejection handled.
      void created.promise.catch(() => {})
      inFlight.set(key, created)
      flight = created
    }

    const shared = flight
    return new Promise((resolve, reject) => {
      const subscriber = Symbol(key)
      shared.subscribers.add(subscriber)
      let released = false
      const release = (cancelWhenUnobserved = false) => {
        if (released) return
        released = true
        signal.removeEventListener('abort', onAbort)
        shared.subscribers.delete(subscriber)
        if (cancelWhenUnobserved && shared.subscribers.size === 0 && !shared.settled) {
          shared.controller.abort(Error('Nenhuma solicitação ainda aguarda esta animação.'))
        }
      }
      const onAbort = () => {
        release(true)
        reject(signal.reason ?? Error('Preparação de animação cancelada.'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) { onAbort(); return }
      shared.promise.then((result) => {
        if (!released) {
          try { assertAtlasBudget(request, result); release(); resolve(result) }
          catch (error) { release(); reject(error instanceof Error ? error : Error(String(error))) }
        }
      }, (error) => { if (!released) { release(); reject(error) } })
    })
  }
  const bakeForExport = (rawRequest: EditorV6MotionBakeRequest, signal: AbortSignal) => {
    const request = parseEditorV6MotionRequest(rawRequest)
    validateRequest(request)
    return enqueueBake(request, signal)
  }
  const bakeOwned = async (event: IpcMainInvokeEvent, rawRequest: unknown, cacheOnly: boolean) => {
    deps.assertTrustedSender(event)
    const request = parseEditorV6MotionRequest(rawRequest)
    validateRequest(request)
    if (jobs.has(request.id)) throw Error('Identificador de preparação repetido.')
    const controller = new AbortController()
    const job = { owner: event.sender.id, controller, cancelled: false }
    const abort = () => { job.cancelled = true; controller.abort(Error('Preparação de animação cancelada.')) }
    event.sender.once('destroyed', abort)
    const promise = enqueueBake(request, controller.signal)
    jobs.set(request.id, job)
    try { const result = await promise; return cacheOnly ? undefined : result }
    catch (reason) {
      // The background warm-up is routinely superseded by user input. Its
      // cancellation is a normal outcome, not a failed IPC request.
      if (cacheOnly && (job.cancelled || controller.signal.aborted)) return undefined
      throw reason
    }
    finally { jobs.delete(request.id); if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', abort) }
  }
  deps.ipcMain.handle(editorV6IpcChannels.bakeEditorV6Motion, (event, request) => bakeOwned(event, request, false))
  deps.ipcMain.handle(editorV6IpcChannels.prepareEditorV6Motion, (event, request) => bakeOwned(event, request, true))
  deps.ipcMain.handle(editorV6IpcChannels.cancelEditorV6Motion, (event, id) => {
    deps.assertTrustedSender(event)
    const job = jobs.get(z.string().uuid().parse(id))
    if (job && job.owner === event.sender.id) {
      job.cancelled = true
      job.controller.abort(Error('Preparação de animação substituída.'))
    }
  })
  return { bakeForExport, releaseIdle: () => { for (const lane of lanes) if (lane.count === 0) close(lane) }, cancelAll: () => {
    stopped = true
    for (const job of jobs.values()) job.controller.abort(Error('Aplicativo encerrado.'))
    for (const lane of lanes) { lane.active?.reject(Error('Aplicativo encerrado.')); close(lane) }
  }, drain: () => Promise.allSettled(lanes.map((lane) => lane.tail)), getCacheStats: () => ({ ...cacheStats }) }
}
