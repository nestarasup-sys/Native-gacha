import { BrowserWindow, type IpcMain } from 'electron'
import { type EditorV6FrameMetrics, type EditorV6FrameTimings, type EditorV6RenderFrameResult, type EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'
import { waitForExport } from './exportProcess'
import { restrictRendererNavigation } from '../../windowNavigation'
import { restrictRendererPermissions } from '../../windowPermissions'
import { restrictRendererResources } from '../../windowResourcePolicy'
import { editorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import { createEditorV6WorkerMediaProtocolHandler, hasEditorV6WorkerMedia } from './exportWorkerMediaProtocol'
import { captureEditorV6PaintedFrame, createEditorV6PaintFrameCapture, EDITOR_V6_PAINT_TOKEN_SIZE, type EditorV6PaintFrameCapture } from './exportFrameCapture'
import { createEditorV6WorkerRegistry } from './exportWorkerRegistry'

export type EditorV6FrameWorker = { frame: (frame: number) => Promise<EditorV6RenderFrameResult & { bitmap?: Buffer }>; close: () => void }

export function createEditorV6WorkerFactory(deps: { ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>; html: string; preload: string; devUrl?: string; mediaPath?: (projectId: string, fileName: string, libraryVideoId?: string) => string | Promise<string>; resolveLibraryAsset?: (assetId: string) => Promise<{ path: string; mimeType: string }>; inspectCapture?: (capture: { window: BrowserWindow; frame: number; bitmap: Buffer }) => Promise<void>; captureMode?: 'capturePage' | 'paint-event' }) {
  const registry = createEditorV6WorkerRegistry(deps.ipcMain)
  const activeWorkers = new Set<() => void>()
  let disposed = false
  const create = async (payload: EditorV6WorkerPayload, signal: AbortSignal): Promise<EditorV6FrameWorker> => {
    signal.throwIfAborted()
    if (disposed) throw Error('A fábrica de renderizadores de exportação foi encerrada.')
    const layeredVideo = payload.layeredVideo
    const captureRetryMilliseconds = editorV6ExportTestSettings(payload.testMode).captureRetryMilliseconds
    const window = new BrowserWindow({ show: false, useContentSize: true, width: payload.width + EDITOR_V6_PAINT_TOKEN_SIZE, height: payload.height, enableLargerThanScreen: true, frame: false, transparent: layeredVideo, ...(layeredVideo ? { backgroundColor: '#00000000' } : {}),
      webPreferences: { preload: deps.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true, devTools: false, partition: `editor-v6-export-${crypto.randomUUID()}` } })
    const hasWorkerMedia = hasEditorV6WorkerMedia({ payload, mediaPath: deps.mediaPath, resolveLibraryAsset: deps.resolveLibraryAsset })
    if (hasWorkerMedia) window.webContents.session.protocol.handle('gacha-editor-media', createEditorV6WorkerMediaProtocolHandler({
      payload, mediaPath: deps.mediaPath, resolveLibraryAsset: deps.resolveLibraryAsset
    }))
    restrictRendererNavigation(window.webContents)
    restrictRendererPermissions(window.webContents.session)
    window.removeMenu()
    // Initial native bounds can be clamped to the monitor work area on Windows.
    window.setContentSize(payload.width + EDITOR_V6_PAINT_TOKEN_SIZE, payload.height)
    window.webContents.setFrameRate(60)
    restrictRendererResources(window.webContents.session, {
      html: deps.html,
      devUrl: deps.devUrl,
      allowedSchemes: hasWorkerMedia ? ['gacha-editor-media'] : []
    })
    const id = window.webContents.id
    const registration = registry.register(id, payload)
    let closed = false
    // exportRunner awaits each FFmpeg stdin callback before requesting the next
    // frame from this worker, so this owned buffer can be safely reused.
    let frameBitmap: Buffer | undefined
    let layeredBitmap: Buffer | undefined
    let paintCapture: EditorV6PaintFrameCapture | undefined
    const close = () => {
      if (closed) return
      closed = true
      activeWorkers.delete(close)
      registration.retire()
      layeredBitmap = undefined
      paintCapture?.close()
      signal.removeEventListener('abort', close)
      registration.rejectReady(Error('A janela de exportação foi fechada.'))
      if (!window.isDestroyed()) window.destroy()
    }
    activeWorkers.add(close)
    signal.addEventListener('abort', close, { once: true })
    window.once('closed', close)
    try {
      await waitForExport(deps.devUrl ? window.loadURL(new URL('editor-v6-export.html', deps.devUrl.endsWith('/') ? deps.devUrl : deps.devUrl + '/').href) : window.loadFile(deps.html), signal, 60000, 'abrir renderizador')
      await waitForExport(registration.ready, signal, 60000, 'preparar renderizador')
      window.webContents.setZoomFactor(1)
      if (deps.captureMode === 'paint-event') paintCapture = createEditorV6PaintFrameCapture(window, payload.width, payload.height, signal)
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
        const capture = async (outputOffset = 0) => {
          const started = performance.now()
          const token = nextPaintToken
          const layerBytes = payload.width * payload.height * 4
          const output = layeredVideo
            ? (layeredBitmap ??= Buffer.allocUnsafe(layerBytes * 2))
            : (frameBitmap ??= Buffer.allocUnsafe(layerBytes))
          const captured = await captureEditorV6PaintedFrame({ window, signal, width: payload.width, height: payload.height, token, output, outputOffset, retryMilliseconds: captureRetryMilliseconds, paintCapture })
          const { bitmap, readbacks, paintWaitMs, capturePageMs, captureBitmapMs } = captured
          await deps.inspectCapture?.({ window, frame, bitmap: layeredVideo ? bitmap.subarray(outputOffset, outputOffset + payload.width * payload.height * 4) : bitmap })
          return { bitmap, readbacks, elapsedMs: performance.now() - started, paintWaitMs, capturePageMs, captureBitmapMs }
        }
        if (!layeredVideo) {
          const captured = await capture()
          return { reused: false, bitmap: captured.bitmap, timings: { ...result.timings, captureMs: captured.elapsedMs, paintWaitMs: captured.paintWaitMs, capturePageMs: captured.capturePageMs, captureBitmapMs: captured.captureBitmapMs }, metrics: {
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
          const captured = await capture(offset)
          timings.captureMs = (timings.captureMs ?? 0) + captured.elapsedMs
          timings.paintWaitMs = (timings.paintWaitMs ?? 0) + captured.paintWaitMs
          timings.capturePageMs = (timings.capturePageMs ?? 0) + captured.capturePageMs
          timings.captureBitmapMs = (timings.captureBitmapMs ?? 0) + captured.captureBitmapMs
          metrics.captureReadbacks = (metrics.captureReadbacks ?? 0) + captured.readbacks
          metrics.captureStaleReadbacks = (metrics.captureStaleReadbacks ?? 0) + captured.readbacks - 1
          const timingKey = layer === 'background' ? 'backgroundCaptureMs' : 'foregroundCaptureMs'
          timings[timingKey] = captured.elapsedMs
          // Capture directly into the reusable combined frame, avoiding an
          // intermediate 8 MiB layer bitmap and its second copy.
          if (captured.bitmap.length !== layerBytes * 2) throw Error('Dimensões inesperadas do bitmap combinado das camadas.')
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
    registry.dispose()
  } }
}
