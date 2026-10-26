import { BrowserWindow, dialog, shell, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { editorV6IpcChannels } from '../../../src/shared/editorV6IpcChannels'
import { editorV6ExportAudioSchema, parseEditorV6Document } from '../../../src/shared/editorV6Schema'
import { planEditorV6Export, type EditorV6ExportAudio, type EditorV6ExportOptions, type EditorV6ExportStatus } from '../../../src/shared/editorV6Export'
import { createEditorV6WorkerFactory } from './exportWorkers'
import { probeExportMedia, runEditorV6Export } from './exportRunner'

type Job = { owner: number; status: EditorV6ExportStatus; controller: AbortController; promise: Promise<void> }
const uuid = z.string().uuid()
const terminal = (status: EditorV6ExportStatus) => ['completed', 'cancelled', 'failed'].includes(status.state)
export function registerEditorV6ExportHandlers(deps: { ipcMain: IpcMain; assertTrustedSender: (event: IpcMainInvokeEvent) => void; projectPath: (id: string) => string; toolsDirectory: string; workerHtml: string; workerPreload: string; devUrl?: string; tempRoot: string }) {
  const workers = createEditorV6WorkerFactory({ ipcMain: deps.ipcMain, html: deps.workerHtml, preload: deps.workerPreload, devUrl: deps.devUrl })
  const ffmpeg = join(deps.toolsDirectory, 'ffmpeg.exe'), ffprobe = join(deps.toolsDirectory, 'ffprobe.exe')
  const jobs = new Map<string, Job>()
  const audioPath = (projectId: string, clip: EditorV6ExportAudio) => join(deps.projectPath(projectId), 'export-audio', clip.fileName)
  const findJob = (event: IpcMainInvokeEvent, id: string) => {
    deps.assertTrustedSender(event)
    const job = id === 'latest' ? [...jobs.values()].reverse().find((entry) => entry.owner === event.sender.id) : jobs.get(uuid.parse(id))
    if (!job || job.owner !== event.sender.id) throw Error('Exportação não encontrada nesta janela.')
    return job
  }
  deps.ipcMain.handle(editorV6IpcChannels.startEditorV6Export, async (event, rawProject, options: EditorV6ExportOptions) => {
    deps.assertTrustedSender(event)
    if ([...jobs.values()].some((job) => !terminal(job.status))) throw Error('Aguarde ou cancele a exportação atual antes de iniciar outra.')
    const project = parseEditorV6Document(rawProject)
    planEditorV6Export(options, project.timeline.durationFrames)
    const owner = BrowserWindow.fromWebContents(event.sender)
    const saveOptions = { title: 'Editor V6: exportar MP4', defaultPath: project.title.replace(/[<>:"/\\|?*]/g, '_') + '.mp4', filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }] }
    const destination = owner ? await dialog.showSaveDialog(owner, saveOptions) : await dialog.showSaveDialog(saveOptions)
    if (destination.canceled || !destination.filePath) return null
    if ([...jobs.values()].some((job) => !terminal(job.status))) throw Error('Outra exportação já foi iniciada.')
    const id = randomUUID(), controller = new AbortController(), reportPath = join(deps.projectPath(project.id), 'exports', `${id}.report.json`)
    const outputPath = destination.filePath.toLowerCase().endsWith('.mp4') ? destination.filePath : destination.filePath + '.mp4'
    const status: EditorV6ExportStatus = { id, state: 'preparing', frames: 0, totalFrames: options.endFrame - options.startFrame, message: 'Verificando codificador e preparando exportação…', fallback: false, reportPath }
    const job: Job = { owner: event.sender.id, status, controller, promise: Promise.resolve() }
    jobs.set(id, job)
    const abort = () => controller.abort(Error('A janela do editor foi fechada.'))
    event.sender.once('destroyed', abort)
    job.promise = runEditorV6Export(project, options, { ffmpeg, ffprobe, tempRoot: deps.tempRoot, id, outputPath, reportPath, signal: controller.signal,
      createWorker: (_part, signal) => workers.create({ project, width: options.width, height: options.height }, signal), audioPath: (clip) => audioPath(project.id, clip),
      progress: (patch) => { job.status = { ...job.status, ...patch } }
    }).then((report) => { job.status = { ...job.status, state: 'completed', outputPath, fallback: report.fallback, frames: status.totalFrames, message: 'MP4 exportado e validado.' } }, (error: unknown) => {
      job.status = { ...job.status, state: controller.signal.aborted ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : String(error), message: controller.signal.aborted ? 'Exportação cancelada.' : 'A exportação falhou. Consulte o relatório.' }
    }).finally(() => { if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', abort) })
    for (const [key, entry] of jobs) if (jobs.size > 20 && terminal(entry.status)) jobs.delete(key)
    return job.status
  })
  deps.ipcMain.handle(editorV6IpcChannels.getEditorV6ExportStatus, (event, id) => findJob(event, id).status)
  deps.ipcMain.handle(editorV6IpcChannels.cancelEditorV6Export, async (event, id) => { const job = findJob(event, id); if (!terminal(job.status)) job.controller.abort(Error('Exportação cancelada pelo usuário.')); await job.promise })
  deps.ipcMain.handle(editorV6IpcChannels.revealEditorV6Export, (event, id, report?: boolean) => { const job = findJob(event, id); const path = report ? job.status.reportPath : job.status.outputPath ?? job.status.reportPath; if (path) shell.showItemInFolder(path) })
  deps.ipcMain.handle(editorV6IpcChannels.importEditorV6ExportAudio, async (event, projectId: string): Promise<EditorV6ExportAudio | null> => {
    deps.assertTrustedSender(event); uuid.parse(projectId)
    const result = await dialog.showOpenDialog({ title: 'Editor V6: adicionar áudio à exportação', properties: ['openFile'], filters: [{ name: 'Áudio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'webm'] }] })
    const source = result.filePaths[0]
    if (result.canceled || !source) return null
    if ((await stat(source)).size > 2 * 1024 ** 3) throw Error('O arquivo de áudio excede 2 GB.')
    const extension = extname(source).slice(1).toLowerCase()
    if (!['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'webm'].includes(extension)) throw Error('Formato de áudio inválido.')
    const probe = await probeExportMedia(ffprobe, source, new AbortController().signal)
    if (!probe.streams.some((stream) => stream.codec_type === 'audio')) throw Error('O arquivo selecionado não contém áudio.')
    const sourceFrames = Math.floor(Number(probe.format.duration) * 30)
    const id = randomUUID(), fileName = `${id}.${extension}`
    const clip = editorV6ExportAudioSchema.parse({ id, fileName, name: basename(source), sourceFrames, startFrame: 0, sourceInFrame: 0, durationFrames: sourceFrames, gain: 1, muted: false })
    const folder = join(deps.projectPath(projectId), 'export-audio')
    await mkdir(folder, { recursive: true }); await copyFile(source, join(folder, fileName))
    return clip
  })
  deps.ipcMain.handle(editorV6IpcChannels.cloneEditorV6ExportAudio, async (event, sourceId: string, targetId: string, rawClips: unknown) => {
    deps.assertTrustedSender(event); uuid.parse(sourceId); uuid.parse(targetId)
    const clips = z.array(editorV6ExportAudioSchema).max(32).parse(rawClips)
    const folder = join(deps.projectPath(targetId), 'export-audio')
    await mkdir(folder, { recursive: true })
    for (const clip of clips) await copyFile(audioPath(sourceId, clip), join(folder, clip.fileName))
  })
  return { cancelAll: () => { for (const job of jobs.values()) if (!terminal(job.status)) job.controller.abort(Error('Aplicativo encerrado.')) }, drain: () => Promise.allSettled([...jobs.values()].map((job) => job.promise)) }
}
