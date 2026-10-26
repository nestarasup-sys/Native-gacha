import { BrowserWindow, type IpcMain } from 'electron'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { editorV6WorkerChannels, type EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'
import { waitForExport } from './exportProcess'

export type EditorV6FrameWorker = { frame: (frame: number) => Promise<{ reused: boolean; bitmap?: Buffer }>; close: () => void }
export function createEditorV6WorkerFactory(deps: { ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>; html: string; preload: string; devUrl?: string }) {
  const entries = new Map<number, { payload: EditorV6WorkerPayload; ready: (error?: string) => void }>()
  function entry(event: Electron.IpcMainInvokeEvent) {
    const found = entries.get(event.sender.id)
    if (!found || event.senderFrame !== event.sender.mainFrame) throw Error('Renderizador de exportação não autorizado.')
    return found
  }
  deps.ipcMain.handle(editorV6WorkerChannels.payload, (event) => entry(event).payload)
  deps.ipcMain.handle(editorV6WorkerChannels.ready, (event, error?: string) => entry(event).ready(error))
  const create = async (payload: EditorV6WorkerPayload, signal: AbortSignal): Promise<EditorV6FrameWorker> => {
    signal.throwIfAborted()
    const window = new BrowserWindow({ show: false, useContentSize: true, width: payload.width, height: payload.height, enableLargerThanScreen: true, frame: false,
      webPreferences: { preload: deps.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true, devTools: false, partition: `editor-v6-export-${crypto.randomUUID()}` } })
    window.removeMenu()
    window.webContents.setFrameRate(60)
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    window.webContents.session.webRequest.onBeforeRequest((request, callback) => {
      let allowed = /^(data|blob):/.test(request.url)
      try {
        if (deps.devUrl) allowed ||= new URL(request.url).origin === new URL(deps.devUrl).origin
        else if (request.url.startsWith('file:')) allowed ||= resolve(fileURLToPath(request.url)).startsWith(resolve(dirname(deps.html)) + sep)
      } catch { /* Reject an invalid resource URL. */ }
      callback({ cancel: !allowed })
    })
    let resolveReady!: () => void, rejectReady!: (error: Error) => void
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
    void ready.catch(() => {})
    entries.set(window.webContents.id, { payload, ready: (error) => error ? rejectReady(Error(error)) : resolveReady() })
    const id = window.webContents.id
    const close = () => { entries.delete(id); signal.removeEventListener('abort', close); if (!window.isDestroyed()) window.destroy() }
    signal.addEventListener('abort', close, { once: true })
    window.once('closed', () => { entries.delete(id); rejectReady(Error('A janela de exportação foi fechada.')) })
    try {
      await waitForExport(deps.devUrl ? window.loadURL(new URL('editor-v6-export.html', deps.devUrl.endsWith('/') ? deps.devUrl : deps.devUrl + '/').href) : window.loadFile(deps.html), signal, 60000, 'abrir renderizador')
      await waitForExport(ready, signal, 60000, 'preparar renderizador')
      window.webContents.setZoomFactor(1)
      return { close, frame: async (frame) => {
        signal.throwIfAborted()
        const result = await waitForExport(window.webContents.executeJavaScript(`window.renderEditorV6ExportFrame(${Math.round(frame)})`) as Promise<{ reused: boolean }>, signal, 60000, 'desenhar quadro')
        if (result.reused) return result
        let image = await waitForExport(window.webContents.capturePage({ x: 0, y: 0, width: payload.width, height: payload.height }), signal, 60000, 'capturar quadro')
        image = image.resize({ width: payload.width, height: payload.height, quality: 'best' })
        const bitmap = image.toBitmap({ scaleFactor: 1 })
        if (bitmap.length !== payload.width * payload.height * 4) throw Error('Dimensões inesperadas do bitmap exportado.')
        return { reused: false, bitmap }
      } }
    } catch (error) { close(); throw error }
  }
  return { create, dispose: () => { deps.ipcMain.removeHandler(editorV6WorkerChannels.payload); deps.ipcMain.removeHandler(editorV6WorkerChannels.ready) } }
}
