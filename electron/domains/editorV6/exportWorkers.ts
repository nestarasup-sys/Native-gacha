import { BrowserWindow, type IpcMain } from 'electron'
import { type EditorV6RenderFrameResult, type EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'
import { waitForExport } from './exportProcess'
import { restrictRendererNavigation } from '../../windowNavigation'
import { restrictRendererPermissions } from '../../windowPermissions'
import { restrictRendererResources } from '../../windowResourcePolicy'
import { editorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import { createEditorV6WorkerMediaProtocolHandler, hasEditorV6WorkerMedia } from './exportWorkerMediaProtocol'
import { createEditorV6PaintFrameCapture, EDITOR_V6_PAINT_TOKEN_SIZE, type EditorV6PaintFrameCapture } from './exportFrameCapture'
import { createEditorV6WorkerRegistry } from './exportWorkerRegistry'
import { createEditorV6WorkerFrameRenderer, type EditorV6WorkerFrameRenderer } from './exportWorkerFrameRenderer'

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
    let paintCapture: EditorV6PaintFrameCapture | undefined
    let frameRenderer: EditorV6WorkerFrameRenderer | undefined
    const close = () => {
      if (closed) return
      closed = true
      activeWorkers.delete(close)
      registration.retire()
      frameRenderer?.close()
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
      frameRenderer = createEditorV6WorkerFrameRenderer({ window, payload, signal, captureRetryMilliseconds, paintCapture, inspectCapture: deps.inspectCapture })
      return { close, frame: frameRenderer.frame }
    } catch (error) { close(); throw error }
  }
  return { create, dispose: () => {
    disposed = true
    for (const close of activeWorkers) close()
    registry.dispose()
  } }
}
