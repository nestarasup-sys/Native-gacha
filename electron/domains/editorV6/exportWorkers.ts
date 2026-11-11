import type { BrowserWindow, IpcMain } from 'electron'
import { type EditorV6RenderFrameResult, type EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'
import { waitForExport } from './exportProcess'
import { editorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import { createEditorV6PaintFrameCapture, type EditorV6PaintFrameCapture } from './exportFrameCapture'
import { createEditorV6WorkerRegistry } from './exportWorkerRegistry'
import { createEditorV6WorkerFrameRenderer, type EditorV6WorkerFrameRenderer } from './exportWorkerFrameRenderer'
import { createEditorV6WorkerWindow, type EditorV6WorkerWindowDependencies } from './exportWorkerWindow'

export type EditorV6FrameWorker = { frame: (frame: number) => Promise<EditorV6RenderFrameResult & { bitmap?: Buffer }>; close: () => void }

export function createEditorV6WorkerFactory(deps: EditorV6WorkerWindowDependencies & { ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>; inspectCapture?: (capture: { window: BrowserWindow; frame: number; bitmap: Buffer }) => Promise<void>; captureMode?: 'capturePage' | 'paint-event' }) {
  const registry = createEditorV6WorkerRegistry(deps.ipcMain)
  const activeWorkers = new Set<() => void>()
  let disposed = false
  const create = async (payload: EditorV6WorkerPayload, signal: AbortSignal): Promise<EditorV6FrameWorker> => {
    signal.throwIfAborted()
    if (disposed) throw Error('A fábrica de renderizadores de exportação foi encerrada.')
    const captureRetryMilliseconds = editorV6ExportTestSettings(payload.testMode).captureRetryMilliseconds
    const window = createEditorV6WorkerWindow(payload, deps)
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
