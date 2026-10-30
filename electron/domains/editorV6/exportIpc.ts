import { BrowserWindow, dialog, shell, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { editorV6IpcChannels } from '../../../src/shared/editorV6IpcChannels'
import { editorV6ExportAudioSchema, editorV6MediaAssetSchema, parseEditorV6Document } from '../../../src/shared/editorV6Schema'
import type { EditorV6MediaAsset } from '../../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import { planEditorV6Export, type EditorV6ExportAudio, type EditorV6ExportOptions, type EditorV6ExportStatus } from '../../../src/shared/editorV6Export'
import { createEditorV6WorkerFactory } from './exportWorkers'
import { probeExportMedia, runEditorV6Export, type EditorV6ExportReport } from './exportRunner'
import type { EditorV6MotionCacheStats } from './motionCache'
import { createPendingOperationTracker } from '../storage/pendingOperationTracker.ts'

type Job = { owner: number; status: EditorV6ExportStatus; controller: AbortController; promise: Promise<void> }
type EditorV6ExportIpcDependencies = {
  ipcMain: IpcMain
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  projectPath: (id: string) => string
  toolsDirectory: string
  workerHtml: string
  workerPreload: string
  devUrl?: string
  tempRoot: string
  getCharacters: () => Promise<CustomizerCharacter[]>
  bakeMotion: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  getMotionCacheStats?: () => EditorV6MotionCacheStats
  resolveLibraryVideo: (id: string) => Promise<{ path: string; name: string; mimeType: EditorV6MediaAsset['mimeType']; extension: string; size: number; durationFrames: number | null }>
}
type EditorV6ExportIpcLifecycle = {
  cancelAll: () => void
  drain: () => Promise<void>
  getPendingWrites: () => Promise<unknown>[]
  resumeAfterFailedShutdown: () => void
  runIsolatedExport: (project: unknown, options: EditorV6ExportOptions, outputPath: string, reportPath: string, id: string, signal?: AbortSignal, progress?: (patch: Partial<EditorV6ExportStatus>) => void) => Promise<EditorV6ExportReport>
}
const uuid = z.string().uuid()
const terminal = (status: EditorV6ExportStatus) => ['completed', 'cancelled', 'failed'].includes(status.state)
export function registerEditorV6ExportHandlers(deps: EditorV6ExportIpcDependencies): EditorV6ExportIpcLifecycle {
  const mediaPath = async (projectId: string, fileName: string, libraryVideoId?: string) => libraryVideoId ? (await deps.resolveLibraryVideo(libraryVideoId)).path : join(deps.projectPath(projectId), 'media', fileName)
  const workers = createEditorV6WorkerFactory({ ipcMain: deps.ipcMain, html: deps.workerHtml, preload: deps.workerPreload, devUrl: deps.devUrl, mediaPath })
  const ffmpeg = join(deps.toolsDirectory, 'ffmpeg.exe'), ffprobe = join(deps.toolsDirectory, 'ffprobe.exe')
  const jobs = new Map<string, Job>()
  const pendingFileWrites = createPendingOperationTracker()
  let shuttingDown = false
  let drainTask: Promise<void> | null = null
  const assertAvailable = () => {
    if (shuttingDown) throw Error('O aplicativo está encerrando; tente novamente depois.')
  }
  const cancelAll = () => { for (const job of jobs.values()) if (!terminal(job.status)) job.controller.abort(Error('Aplicativo encerrado.')) }
  const getPendingWrites = (): Promise<unknown>[] => [
    ...pendingFileWrites.getPending(),
    ...[...jobs.values()].filter((job) => !terminal(job.status)).map((job) => job.promise)
  ]
  const drain = (): Promise<void> => {
    if (drainTask) return drainTask
    shuttingDown = true
    cancelAll()
    const current = (async () => {
      let failure: unknown
      let failed = false
      while (true) {
        const tasks = [...new Set(getPendingWrites())]
        if (!tasks.length) break
        const results = await Promise.allSettled(tasks)
        for (const result of results) if (result.status === 'rejected') {
          if (!failed) failure = result.reason
          failed = true
        }
      }
      if (failed) throw failure
    })()
    drainTask = current
    void current.catch(() => {
      shuttingDown = false
      if (drainTask === current) drainTask = null
    })
    return current
  }
  const audioPath = async (projectId: string, clip: EditorV6ExportAudio, media: readonly EditorV6MediaAsset[] = []) => clip.libraryVideoId
    ? (await deps.resolveLibraryVideo(clip.libraryVideoId)).path
    : join(deps.projectPath(projectId), media.some((item) => item.fileName === clip.fileName) ? 'media' : 'export-audio', clip.fileName)
  const runIsolatedExport: EditorV6ExportIpcLifecycle['runIsolatedExport'] = (rawProject, options, outputPath, reportPath, id, signal = new AbortController().signal, progress = (patch) => { if (patch.message) console.log(`[V6 isolated export] ${patch.message}`) }) => {
    const project = parseEditorV6Document(rawProject)
    planEditorV6Export(options, project.timeline.durationFrames)
    return runEditorV6Export(project, options, {
      ffmpeg, ffprobe, tempRoot: deps.tempRoot, id, outputPath, reportPath,
      signal,
      getCharacters: deps.getCharacters,
      bakeMotion: deps.bakeMotion,
      getMotionCacheStats: deps.getMotionCacheStats,
      createWorker: (renderProject, _part, signal, layeredVideo, mouthLoops) => workers.create({ project: renderProject, width: options.width, height: options.height, layeredVideo, ...(mouthLoops ? { mouthLoops } : {}) }, signal),
      audioPath: (clip) => audioPath(project.id, clip, project.media), mediaPath, progress
    })
  }
  const findJob = (event: IpcMainInvokeEvent, id: string) => {
    deps.assertTrustedSender(event)
    const job = id === 'latest' ? [...jobs.values()].reverse().find((entry) => entry.owner === event.sender.id) : jobs.get(uuid.parse(id))
    if (!job || job.owner !== event.sender.id) throw Error('Exportação não encontrada nesta janela.')
    return job
  }
  deps.ipcMain.handle(editorV6IpcChannels.startEditorV6Export, async (event, rawProject, options: EditorV6ExportOptions) => {
    deps.assertTrustedSender(event)
    assertAvailable()
    if ([...jobs.values()].some((job) => !terminal(job.status))) throw Error('Aguarde ou cancele a exportação atual antes de iniciar outra.')
    const project = parseEditorV6Document(rawProject)
    planEditorV6Export(options, project.timeline.durationFrames)
    const owner = BrowserWindow.fromWebContents(event.sender)
    const saveOptions = { title: 'Editor V6: exportar MP4', defaultPath: project.title.replace(/[<>:"/\\|?*]/g, '_') + '.mp4', filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }] }
    const destination = owner ? await dialog.showSaveDialog(owner, saveOptions) : await dialog.showSaveDialog(saveOptions)
    if (destination.canceled || !destination.filePath) return null
    assertAvailable()
    if ([...jobs.values()].some((job) => !terminal(job.status))) throw Error('Outra exportação já foi iniciada.')
    const id = randomUUID(), controller = new AbortController(), reportPath = join(deps.projectPath(project.id), 'exports', `${id}.report.json`)
    const outputPath = destination.filePath.toLowerCase().endsWith('.mp4') ? destination.filePath : destination.filePath + '.mp4'
    const status: EditorV6ExportStatus = { id, state: 'preparing', frames: 0, totalFrames: options.endFrame - options.startFrame, message: 'Verificando codificador e preparando exportação…', fallback: false, reportPath }
    const job: Job = { owner: event.sender.id, status, controller, promise: Promise.resolve() }
    jobs.set(id, job)
    const abort = () => controller.abort(Error('A janela do editor foi fechada.'))
    event.sender.once('destroyed', abort)
    job.promise = runIsolatedExport(project, options, outputPath, reportPath, id, controller.signal, (patch) => { job.status = { ...job.status, ...patch } }).then((report) => {
      const mouth = report.mouthAnimation
      const message = `${report.deliveryWarning ?? 'MP4 exportado e validado.'}${mouth ? ` Loop da boca em ${mouth.characters} personagem(ns) · ${mouth.cycleFrames / 30}s${mouth.skippedStates ? ` · ${mouth.skippedStates} estado(s) ignorado(s); veja o relatório` : ''}.` : ''}`
      job.status = { ...job.status, state: 'completed', outputPath: report.outputPath, fallback: report.fallback, frames: status.totalFrames, message }
    }, (error: unknown) => {
      job.status = { ...job.status, state: controller.signal.aborted ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : String(error), message: controller.signal.aborted ? 'Exportação cancelada.' : 'A exportação falhou. Consulte o relatório.' }
    }).finally(() => { if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', abort) })
    for (const [key, entry] of jobs) if (jobs.size > 20 && terminal(entry.status)) jobs.delete(key)
    return job.status
  })
  deps.ipcMain.handle(editorV6IpcChannels.getEditorV6ExportStatus, (event, id) => findJob(event, id).status)
  deps.ipcMain.handle(editorV6IpcChannels.cancelEditorV6Export, async (event, id) => { const job = findJob(event, id); if (!terminal(job.status)) job.controller.abort(Error('Exportação cancelada pelo usuário.')); await job.promise })
  deps.ipcMain.handle(editorV6IpcChannels.revealEditorV6Export, (event, id, report?: boolean) => { const job = findJob(event, id); const path = report ? job.status.reportPath : job.status.outputPath ?? job.status.reportPath; if (path) shell.showItemInFolder(path) })
  deps.ipcMain.handle(editorV6IpcChannels.importEditorV6ExportAudio, async (event, projectId: string): Promise<EditorV6ExportAudio | null> => {
    deps.assertTrustedSender(event); assertAvailable(); uuid.parse(projectId)
    const result = await dialog.showOpenDialog({ title: 'Editor V6: adicionar áudio à exportação', properties: ['openFile'], filters: [{ name: 'Áudio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'webm'] }] })
    const source = result.filePaths[0]
    if (result.canceled || !source) return null
    const fileStats = await stat(source)
    if (fileStats.size <= 0) throw Error('O arquivo de áudio está vazio.')
    if (fileStats.size > 2 * 1024 ** 3) throw Error('O arquivo de áudio excede 2 GB.')
    const extension = extname(source).slice(1).toLowerCase()
    if (!['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'webm'].includes(extension)) throw Error('Formato de áudio inválido.')
    const probe = await probeExportMedia(ffprobe, source, new AbortController().signal)
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
    if (!audio) throw Error('O arquivo selecionado não contém áudio.')
    const duration = Number(probe.format.duration ?? audio.duration ?? 0)
    if (!Number.isFinite(duration) || duration <= 0) throw Error('A duração do áudio não pôde ser determinada.')
    const sourceFrames = Math.max(1, Math.floor(duration * 30))
    if (sourceFrames > 1_000_000) throw Error('A duração do áudio passa do limite do Editor V6.')
    const id = randomUUID(), fileName = `${id}.${extension}`
    const clip = editorV6ExportAudioSchema.parse({ id, fileName, name: basename(source), sourceFrames, startFrame: 0, sourceInFrame: 0, durationFrames: sourceFrames, gain: 1, muted: false })
    const folder = join(deps.projectPath(projectId), 'export-audio')
    assertAvailable()
    return pendingFileWrites.track(async () => {
      await mkdir(folder, { recursive: true })
      await copyFile(source, join(folder, fileName))
      return clip
    })
  })
  deps.ipcMain.handle(editorV6IpcChannels.cloneEditorV6ExportAudio, async (event, sourceId: string, targetId: string, rawClips: unknown) => {
    deps.assertTrustedSender(event); assertAvailable(); uuid.parse(sourceId); uuid.parse(targetId)
    const clips = z.array(editorV6ExportAudioSchema).max(32).parse(rawClips)
    const folder = join(deps.projectPath(targetId), 'export-audio')
    return pendingFileWrites.track(async () => {
      await mkdir(folder, { recursive: true })
      for (const clip of clips) await copyFile(await audioPath(sourceId, clip), join(folder, clip.fileName))
    })
  })
  deps.ipcMain.handle(editorV6IpcChannels.importEditorV6Media, async (event, projectId: string, rawKind: unknown): Promise<EditorV6MediaAsset | null> => {
    deps.assertTrustedSender(event); assertAvailable(); uuid.parse(projectId)
    const kind = z.enum(['video', 'audio']).parse(rawKind)
    const filters = kind === 'video'
      ? [{ name: 'Vídeos', extensions: ['mp4', 'webm', 'mov', 'm4v'] }]
      : [{ name: 'Áudios', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'webm'] }]
    const result = await dialog.showOpenDialog({ title: `Editor V6: importar ${kind === 'video' ? 'vídeo' : 'áudio'}`, properties: ['openFile'], filters })
    const source = result.filePaths[0]
    if (result.canceled || !source) return null
    const fileStats = await stat(source)
    if (fileStats.size <= 0 || fileStats.size > 2 * 1024 ** 3) throw Error('O arquivo precisa ter até 2 GB.')
    const extension = extname(source).slice(1).toLowerCase()
    const allowed = kind === 'video' ? ['mp4', 'webm', 'mov', 'm4v'] : ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'webm']
    if (!allowed.includes(extension)) throw Error('O formato selecionado não é compatível com este tipo de mídia.')
    const probe = await probeExportMedia(ffprobe, source, new AbortController().signal)
    const video = probe.streams.find((stream) => stream.codec_type === 'video')
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
    if (kind === 'video' && !video) throw Error('O arquivo selecionado não contém vídeo.')
    if (kind === 'audio' && !audio) throw Error('O arquivo selecionado não contém áudio.')
    const duration = Number(probe.format.duration ?? (kind === 'video' ? video?.duration : audio?.duration) ?? 0)
    const sourceFrames = Math.max(1, Math.floor(duration * 30))
    if (!Number.isFinite(duration) || duration <= 0 || sourceFrames > 1_000_000) throw Error('A duração da mídia é inválida ou passa do limite do Editor V6.')
    const mimeByExtension: Record<string, string> = { mp4: 'video/mp4', webm: kind === 'video' ? 'video/webm' : 'audio/webm', mov: 'video/quicktime', m4v: 'video/x-m4v', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', opus: 'audio/opus' }
    const id = randomUUID(), fileName = `${id}.${extension}`
    const media = editorV6MediaAssetSchema.parse({ id, name: basename(source), fileName, kind, mimeType: mimeByExtension[extension], sourceFrames, hasAudio: Boolean(audio), ...(video?.width ? { width: video.width, height: video.height } : {}), sizeBytes: fileStats.size })
    const folder = join(deps.projectPath(projectId), 'media')
    assertAvailable()
    return pendingFileWrites.track(async () => {
      await mkdir(folder, { recursive: true })
      await copyFile(source, join(folder, fileName))
      return media
    })
  })
  deps.ipcMain.handle(editorV6IpcChannels.cloneEditorV6Media, async (event, sourceId: string, targetId: string, rawMedia: unknown) => {
    deps.assertTrustedSender(event); assertAvailable(); uuid.parse(sourceId); uuid.parse(targetId)
    const media = z.array(editorV6MediaAssetSchema).max(500).parse(rawMedia)
    const sourceFolder = join(deps.projectPath(sourceId), 'media'), targetFolder = join(deps.projectPath(targetId), 'media')
    return pendingFileWrites.track(async () => {
      await mkdir(targetFolder, { recursive: true })
      for (const item of media) if (!item.libraryVideoId) await copyFile(join(sourceFolder, item.fileName), join(targetFolder, item.fileName))
    })
  })
  deps.ipcMain.handle(editorV6IpcChannels.linkEditorV6LibraryVideo, async (event, projectId: string, rawLibraryVideoId: unknown): Promise<EditorV6MediaAsset> => {
    deps.assertTrustedSender(event); assertAvailable(); uuid.parse(projectId)
    const libraryVideoId = uuid.parse(rawLibraryVideoId)
    const source = await deps.resolveLibraryVideo(libraryVideoId)
    if (!['mp4', 'webm', 'mov', 'm4v'].includes(source.extension)) throw Error('O vídeo selecionado tem um formato incompatível.')
    const fileStats = await stat(source.path)
    const probe = await probeExportMedia(ffprobe, source.path, new AbortController().signal)
    const video = probe.streams.find((stream) => stream.codec_type === 'video')
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio')
    if (!video) throw Error('O vídeo selecionado não contém uma faixa de vídeo válida.')
    const duration = Number(probe.format.duration ?? video.duration ?? 0)
    const sourceFrames = Math.max(1, Math.floor(duration * 30))
    if (!Number.isFinite(duration) || duration <= 0 || sourceFrames > 1_000_000) throw Error('A duração do vídeo é inválida para o Editor V6.')
    return editorV6MediaAssetSchema.parse({ id: libraryVideoId, libraryVideoId, name: source.name, fileName: `${libraryVideoId}.${source.extension}`, kind: 'video', mimeType: source.mimeType, sourceFrames, hasAudio: Boolean(audio), ...(video.width ? { width: video.width, height: video.height } : {}), sizeBytes: fileStats.size })
  })
  return {
    cancelAll,
    drain,
    getPendingWrites,
    resumeAfterFailedShutdown: () => { shuttingDown = false; drainTask = null },
    runIsolatedExport
  }
}
