import { BrowserWindow, type IpcMain } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { editorV6WorkerChannels, type EditorV6WorkerPayload } from '../../../src/shared/editorV6Export'
import { waitForExport } from './exportProcess'

export type EditorV6FrameWorker = { frame: (frame: number) => Promise<{ reused: boolean; bitmap?: Buffer }>; close: () => void }
export function createEditorV6WorkerFactory(deps: { ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>; html: string; preload: string; devUrl?: string; mediaPath?: (projectId: string, fileName: string) => string }) {
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
    const layeredVideo = payload.project.timeline.tracks.some((track) => track.kind === 'video' && !track.hidden && !track.muted && track.blocks.some((block) => block.mediaId && payload.project.media?.some((media) => media.id === block.mediaId && media.kind === 'video')))
    const window = new BrowserWindow({ show: false, useContentSize: true, width: payload.width, height: payload.height, enableLargerThanScreen: true, frame: false, transparent: layeredVideo, ...(layeredVideo ? { backgroundColor: '#00000000' } : {}),
      webPreferences: { preload: deps.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true, devTools: false, partition: `editor-v6-export-${crypto.randomUUID()}` } })
    const mediaList = payload.project.media, mediaPath = deps.mediaPath
    if (mediaPath && mediaList?.length) window.webContents.session.protocol.handle('gacha-editor-media', async (request) => {
      try {
        const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean)
        if (url.hostname !== 'project' || parts.length !== 2 || parts[0] !== payload.project.id) return new Response('Not found', { status: 404 })
        const media = mediaList.find((item) => item.fileName === parts[1])
        if (!media || !/^[0-9a-f-]{36}\.(mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(media.fileName)) return new Response('Not found', { status: 404 })
        const path = mediaPath(payload.project.id, media.fileName), file = await stat(path)
        const headers = new Headers({ 'accept-ranges': 'bytes', 'content-type': media.mimeType, 'cache-control': 'no-store' })
        const range = request.headers.get('range')
        if (request.method === 'HEAD') { headers.set('content-length', String(file.size)); return new Response(null, { status: 200, headers }) }
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range)
          if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${file.size}` } })
          const start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]))
          const end = match[2] && match[1] ? Math.min(file.size - 1, Number(match[2])) : file.size - 1
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= file.size || end < start) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${file.size}` } })
          headers.set('content-range', `bytes ${start}-${end}/${file.size}`); headers.set('content-length', String(end - start + 1))
          return new Response(Readable.toWeb(createReadStream(path, { start, end })) as unknown as BodyInit, { status: 206, headers })
        }
        headers.set('content-length', String(file.size))
        return new Response(Readable.toWeb(createReadStream(path)) as unknown as BodyInit, { status: 200, headers })
      } catch { return new Response('Not found', { status: 404 }) }
    })
    window.removeMenu()
    window.webContents.setFrameRate(60)
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    window.webContents.session.webRequest.onBeforeRequest((request, callback) => {
      let allowed = /^(data|blob):/.test(request.url) || request.url.startsWith('gacha-editor-media:')
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
        const draw = (layer?: 'background' | 'foreground') => waitForExport(window.webContents.executeJavaScript(`window.renderEditorV6ExportFrame(${Math.round(frame)}${layer ? `, '${layer}'` : ''})`) as Promise<{ reused: boolean }>, signal, 60000, 'desenhar quadro')
        const result = await draw(layeredVideo ? 'background' : undefined)
        if (result.reused) return result
        const capture = async () => {
          let image = await waitForExport(window.webContents.capturePage({ x: 0, y: 0, width: payload.width, height: payload.height }), signal, 60000, 'capturar quadro')
          image = image.resize({ width: payload.width, height: payload.height, quality: 'best' })
          return image.toBitmap({ scaleFactor: 1 })
        }
        const background = await capture()
        const foreground = layeredVideo ? await (async () => { await draw('foreground'); return capture() })() : undefined
        const bitmap = foreground ? Buffer.concat([background, foreground]) : background
        if (bitmap.length !== payload.width * payload.height * 4 * (layeredVideo ? 2 : 1)) throw Error('Dimensões inesperadas do bitmap exportado.')
        return { reused: false, bitmap }
      } }
    } catch (error) { close(); throw error }
  }
  return { create, dispose: () => { deps.ipcMain.removeHandler(editorV6WorkerChannels.payload); deps.ipcMain.removeHandler(editorV6WorkerChannels.ready) } }
}
