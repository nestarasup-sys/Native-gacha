import { createMediaFileResponse } from '../mediaLibrary/mediaFileResponse'
import { BrowserWindow, type IpcMain } from 'electron'
import { editorV6WorkerChannels, type EditorV6FrameMetrics, type EditorV6FrameTimings, type EditorV6RenderFrameResult, type EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'
import { waitForExport } from './exportProcess'
import { restrictRendererNavigation } from '../../windowNavigation'
import { restrictRendererPermissions } from '../../windowPermissions'
import { restrictRendererResources } from '../../windowResourcePolicy'
import { captureEditorV6FrameBitmap } from './exportCaptureBitmap'
import { editorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'

export type EditorV6FrameWorker = { frame: (frame: number) => Promise<EditorV6RenderFrameResult & { bitmap?: Buffer }>; close: () => void }

const PAINT_TOKEN_SIZE = 24
const FRAME_CAPTURE_TIMEOUT_MS = 60000
const FRAME_CAPTURE_RETRY_MS = 16

async function capturePaintedFrame(window: BrowserWindow, signal: AbortSignal, width: number, height: number, token: number, retryMilliseconds = FRAME_CAPTURE_RETRY_MS) {
  const deadline = Date.now() + FRAME_CAPTURE_TIMEOUT_MS
  let readbacks = 0
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    readbacks++
    const image = await waitForExport(window.webContents.capturePage({ x: 0, y: 0, width: width + PAINT_TOKEN_SIZE, height }), signal, FRAME_CAPTURE_TIMEOUT_MS, 'capturar quadro')
    const bitmap = captureEditorV6FrameBitmap(image, width, height, token)
    if (bitmap) return { bitmap, readbacks }
    // Invalidate only after observing a stale readback. This is a bounded
    // readback fence, not a blind wait for any queued paint event: each retry
    // verifies the marker in the exact image that will be exported.
    window.webContents.invalidate()
    await waitForExport(new Promise<void>((resolve) => setTimeout(resolve, retryMilliseconds)), signal, FRAME_CAPTURE_TIMEOUT_MS, 'sincronizar quadro')
  }
  throw Error('Tempo limite: o compositor não apresentou o quadro solicitado para exportação.')
}

export function createEditorV6WorkerFactory(deps: { ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>; html: string; preload: string; devUrl?: string; mediaPath?: (projectId: string, fileName: string, libraryVideoId?: string) => string | Promise<string>; resolveLibraryAsset?: (assetId: string) => Promise<{ path: string; mimeType: string }>; inspectCapture?: (capture: { window: BrowserWindow; frame: number; bitmap: Buffer }) => Promise<void> }) {
  const entries = new Map<number, { payload: EditorV6WorkerPayload; ready: (error?: string) => void }>()
  const activeWorkers = new Set<() => void>()
  const retiredWorkers = new Set<number>()
  let disposed = false
  function entry(event: Electron.IpcMainInvokeEvent) {
    const found = entries.get(event.sender.id)
    if (!found || event.senderFrame !== event.sender.mainFrame) throw Error('Renderizador de exportação não autorizado.')
    return found
  }
  deps.ipcMain.handle(editorV6WorkerChannels.payload, (event) => entry(event).payload)
  deps.ipcMain.handle(editorV6WorkerChannels.ready, (event, error?: string) => {
    if (retiredWorkers.has(event.sender.id) && event.senderFrame === event.sender.mainFrame) return
    return entry(event).ready(error)
  })
  const create = async (payload: EditorV6WorkerPayload, signal: AbortSignal): Promise<EditorV6FrameWorker> => {
    signal.throwIfAborted()
    if (disposed) throw Error('A fábrica de renderizadores de exportação foi encerrada.')
    const layeredVideo = payload.layeredVideo
    const captureRetryMilliseconds = editorV6ExportTestSettings(payload.testMode).captureRetryMilliseconds
    const window = new BrowserWindow({ show: false, useContentSize: true, width: payload.width + PAINT_TOKEN_SIZE, height: payload.height, enableLargerThanScreen: true, frame: false, transparent: layeredVideo, ...(layeredVideo ? { backgroundColor: '#00000000' } : {}),
      webPreferences: { preload: deps.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true, devTools: false, partition: `editor-v6-export-${crypto.randomUUID()}` } })
    const mediaList = payload.project.media, mediaPath = deps.mediaPath
    const sharedAssets = payload.project.assets.filter((asset) => asset.libraryAssetId)
    if ((mediaPath && mediaList?.length) || (deps.resolveLibraryAsset && sharedAssets.length)) window.webContents.session.protocol.handle('gacha-editor-media', async (request) => {
      try {
        const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean)
        if (!['project', 'library', 'asset'].includes(url.hostname) || parts.length !== 2 || parts[0] !== payload.project.id) return new Response('Not found', { status: 404 })
        if (url.hostname === 'asset') {
          if (parts.length !== 2 || !deps.resolveLibraryAsset || !sharedAssets.some((asset) => asset.id === parts[1] && asset.libraryAssetId === parts[1])) return new Response('Not found', { status: 404 })
          const resolved = await deps.resolveLibraryAsset(parts[1])
          return await createMediaFileResponse(request, resolved.path, resolved.mimeType)
        }
        if (!mediaPath || !mediaList?.length) return new Response('Not found', { status: 404 })
        const media = url.hostname === 'library' ? mediaList.find((item) => item.libraryVideoId === parts[1]) : mediaList.find((item) => item.fileName === parts[1])
        if (!media || !/^[0-9a-f-]{36}\.(mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(media.fileName)) return new Response('Not found', { status: 404 })
        const path = await mediaPath(payload.project.id, media.fileName, media.libraryVideoId)
        return await createMediaFileResponse(request, path, media.mimeType)
      } catch { return new Response('Not found', { status: 404 }) }
    })
    restrictRendererNavigation(window.webContents)
    restrictRendererPermissions(window.webContents.session)
    window.removeMenu()
    // Initial native bounds can be clamped to the monitor work area on Windows.
    window.setContentSize(payload.width + PAINT_TOKEN_SIZE, payload.height)
    window.webContents.setFrameRate(60)
    restrictRendererResources(window.webContents.session, {
      html: deps.html,
      devUrl: deps.devUrl,
      allowedSchemes: ((mediaPath && mediaList?.length) || (deps.resolveLibraryAsset && sharedAssets.length)) ? ['gacha-editor-media'] : []
    })
    let resolveReady!: () => void, rejectReady!: (error: Error) => void
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
    void ready.catch(() => {})
    entries.set(window.webContents.id, { payload, ready: (error) => error ? rejectReady(Error(error)) : resolveReady() })
    const id = window.webContents.id
    let closed = false
    let layeredBitmap: Buffer | undefined
    const close = () => {
      if (closed) return
      closed = true
      activeWorkers.delete(close)
      entries.delete(id)
      retiredWorkers.add(id)
      while (retiredWorkers.size > 128) retiredWorkers.delete(retiredWorkers.values().next().value!)
      layeredBitmap = undefined
      signal.removeEventListener('abort', close)
      rejectReady(Error('A janela de exportação foi fechada.'))
      if (!window.isDestroyed()) window.destroy()
    }
    activeWorkers.add(close)
    signal.addEventListener('abort', close, { once: true })
    window.once('closed', close)
    try {
      await waitForExport(deps.devUrl ? window.loadURL(new URL('editor-v6-export.html', deps.devUrl.endsWith('/') ? deps.devUrl : deps.devUrl + '/').href) : window.loadFile(deps.html), signal, 60000, 'abrir renderizador')
      await waitForExport(ready, signal, 60000, 'preparar renderizador')
      window.webContents.setZoomFactor(1)
      let nextPaintToken = 0
      return { close, frame: async (frame) => {
        signal.throwIfAborted()
        if (closed) throw Error('O renderizador de exportação foi encerrado.')
        const draw = async (layer?: 'background' | 'foreground') => {
          const started = performance.now()
          nextPaintToken = nextPaintToken % 0xfffffe + 1
          const token = nextPaintToken
          const layerArgument = layer ? `'${layer}'` : 'undefined'
          const result = await waitForExport(window.webContents.executeJavaScript(`window.renderEditorV6ExportFrame(${Math.round(frame)}, ${layerArgument}, ${token})`) as Promise<EditorV6RenderFrameResult>, signal, 60000, 'desenhar quadro')
          return { ...result, timings: { ...result.timings, ipcDrawMs: performance.now() - started } }
        }
        const result = await draw(layeredVideo ? 'background' : undefined)
        if (result.reused) return result
        const capture = async () => {
          const started = performance.now()
          const token = nextPaintToken
          const { bitmap, readbacks } = await capturePaintedFrame(window, signal, payload.width, payload.height, token, captureRetryMilliseconds)
          await deps.inspectCapture?.({ window, frame, bitmap })
          return { bitmap, readbacks, elapsedMs: performance.now() - started }
        }
        if (!layeredVideo) {
          const captured = await capture()
          return { reused: false, bitmap: captured.bitmap, timings: { ...result.timings, captureMs: captured.elapsedMs }, metrics: {
            ...result.metrics, captureReadbacks: captured.readbacks, captureStaleReadbacks: captured.readbacks - 1
          } }
        }
        const layerBytes = payload.width * payload.height * 4
        const timings: EditorV6FrameTimings = { ...result.timings }
        const metrics: EditorV6FrameMetrics = { ...result.metrics }
        const collect = (drawn: EditorV6RenderFrameResult) => {
          for (const [key, value] of Object.entries(drawn.timings ?? {}) as Array<[keyof EditorV6FrameTimings, number]>) timings[key] = (timings[key] ?? 0) + value
          for (const [key, value] of Object.entries(drawn.metrics ?? {}) as Array<[keyof EditorV6FrameMetrics, number]>) metrics[key] = (metrics[key] ?? 0) + value
        }
        const copyLayer = async (offset: number, layer: 'background' | 'foreground', drawn: EditorV6RenderFrameResult) => {
          if (drawn.layerReused) return
          const captured = await capture()
          timings.captureMs = (timings.captureMs ?? 0) + captured.elapsedMs
          metrics.captureReadbacks = (metrics.captureReadbacks ?? 0) + captured.readbacks
          metrics.captureStaleReadbacks = (metrics.captureStaleReadbacks ?? 0) + captured.readbacks - 1
          const timingKey = layer === 'background' ? 'backgroundCaptureMs' : 'foregroundCaptureMs'
          timings[timingKey] = captured.elapsedMs
          if (!layeredBitmap) layeredBitmap = Buffer.allocUnsafe(layerBytes * 2)
          if (captured.bitmap.length !== layerBytes) throw Error('Dimensões inesperadas de uma camada exportada.')
          captured.bitmap.copy(layeredBitmap, offset)
        }
        await copyLayer(0, 'background', result)
        const foreground = await draw('foreground')
        if (foreground.reused) throw Error('O estado visual mudou entre a captura das camadas.')
        collect(foreground)
        await copyLayer(layerBytes, 'foreground', foreground)
        if (!layeredBitmap) throw Error('O renderizador não produziu nenhuma camada para o quadro.')
        const bitmap = layeredBitmap
        if (bitmap.length !== payload.width * payload.height * 4 * (layeredVideo ? 2 : 1)) throw Error('Dimensões inesperadas do bitmap exportado.')
        return { reused: false, bitmap, timings, ...(Object.keys(metrics).length ? { metrics } : {}) }
      } }
    } catch (error) { close(); throw error }
  }
  return { create, dispose: () => {
    disposed = true
    for (const close of activeWorkers) close()
    deps.ipcMain.removeHandler(editorV6WorkerChannels.payload)
    deps.ipcMain.removeHandler(editorV6WorkerChannels.ready)
  } }
}
