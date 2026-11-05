import { BrowserWindow, dialog, shell, type IpcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseEditorV7Document, editorV7IpcChannels, editorV7TickToFrame, type EditorV7ExportStatus } from '../../../src/shared/editorV7'
import { runEditorV7Export } from './exportRunner'

type ExportJob = { owner: number; status: EditorV7ExportStatus; controller: AbortController; promise: Promise<void> }
type Dependencies = { ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>; assertTrustedSender: (event: IpcMainInvokeEvent) => void; toolsDirectory: string }
const terminal = (state: EditorV7ExportStatus['state']) => state === 'completed' || state === 'cancelled' || state === 'failed'

export function registerEditorV7ExportHandlers(deps: Dependencies) {
  const jobs = new Map<string, ExportJob>()
  const ffmpeg = join(deps.toolsDirectory, 'ffmpeg.exe')
  const ffprobe = join(deps.toolsDirectory, 'ffprobe.exe')
  const publish = (sender: WebContents, status: EditorV7ExportStatus) => {
    if (!sender.isDestroyed()) sender.send(editorV7IpcChannels.progress, status)
  }
  const owned = (event: IpcMainInvokeEvent, id: unknown): ExportJob => {
    deps.assertTrustedSender(event)
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Identificador de exportação V7 inválido.')
    const job = jobs.get(id)
    if (!job || job.owner !== event.sender.id) throw new Error('Exportação V7 não encontrada para esta janela.')
    return job
  }
  deps.ipcMain.handle(editorV7IpcChannels.startExport, async (event, value: unknown) => {
    deps.assertTrustedSender(event)
    const document = parseEditorV7Document(value)
    const byteLength = Buffer.byteLength(JSON.stringify(document), 'utf8')
    if (byteLength > 128 * 1024 * 1024) throw new Error('O documento excede o limite temporário de 128 MiB para exportação.')
    const owner = BrowserWindow.fromWebContents(event.sender)
    const saveOptions = { title: 'Editor V7 · Exportar vídeo', defaultPath: `${document.title.replace(/[\\/:*?"<>|]/g, '_')}.mp4`, filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }] }
    const choice = owner ? await dialog.showSaveDialog(owner, saveOptions) : await dialog.showSaveDialog(saveOptions)
    if (choice.canceled || !choice.filePath) return null
    if (!choice.filePath.toLowerCase().endsWith('.mp4')) throw new Error('Escolha um destino com extensão .mp4.')
    const id = randomUUID()
    const totalFrames = editorV7TickToFrame(document.durationTicks, document.frameRate)
    const controller = new AbortController()
    const status: EditorV7ExportStatus = { id, state: 'preparing', frames: 0, totalFrames, message: 'Verificando o encoder H.264…' }
    const job: ExportJob = { owner: event.sender.id, status, controller, promise: Promise.resolve() }
    jobs.set(id, job)
    const sender = event.sender
    const removeOnDestroy = () => { if (!terminal(job.status.state)) controller.abort(Error('A janela proprietária da exportação foi fechada.')) }
    sender.once('destroyed', removeOnDestroy)
    job.promise = (async () => {
      try {
        job.status = { ...job.status, state: 'rendering', message: 'Renderizando e codificando quadros…' }
        publish(sender, job.status)
        const result = await runEditorV7Export({ document, ffmpeg, ffprobe, outputPath: choice.filePath!, signal: controller.signal, onProgress: (frames, total) => {
          job.status = { ...job.status, frames, totalFrames: total, message: `Exportando quadro ${frames.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}…` }
          publish(sender, job.status)
        } })
        job.status = { ...job.status, state: 'completed', frames: result.frames, encoder: result.encoder, milliseconds: result.milliseconds, outputPath: result.outputPath, message: 'MP4 V7 concluído.' }
        publish(sender, job.status)
      } catch (error) {
        const cancelled = controller.signal.aborted
        job.status = { ...job.status, state: cancelled ? 'cancelled' : 'failed', message: cancelled ? 'Exportação cancelada.' : 'Falha ao exportar o vídeo V7.', ...(cancelled ? {} : { error: error instanceof Error ? error.message : String(error) }) }
        publish(sender, job.status)
      } finally { sender.removeListener('destroyed', removeOnDestroy) }
    })()
    return id
  })
  deps.ipcMain.handle(editorV7IpcChannels.getExportStatus, (event, id: unknown) => ({ ...owned(event, id).status }))
  deps.ipcMain.handle(editorV7IpcChannels.cancelExport, (event, id: unknown) => {
    const job = owned(event, id)
    if (!terminal(job.status.state)) job.controller.abort(Error('Exportação cancelada pelo usuário.'))
  })
  deps.ipcMain.handle(editorV7IpcChannels.revealExport, (event, id: unknown) => {
    const job = owned(event, id)
    if (job.status.state !== 'completed' || !job.status.outputPath) throw new Error('O arquivo ainda não foi exportado.')
    shell.showItemInFolder(job.status.outputPath)
  })
  const cancelAll = () => { for (const job of jobs.values()) if (!terminal(job.status.state)) job.controller.abort(Error('Aplicativo encerrado.')) }
  const drain = async () => { cancelAll(); await Promise.allSettled([...jobs.values()].map(({ promise }) => promise)) }
  const dispose = () => {
    cancelAll()
    for (const channel of Object.values(editorV7IpcChannels)) if (channel !== editorV7IpcChannels.progress) deps.ipcMain.removeHandler(channel)
  }
  return { cancelAll, drain, dispose }
}
