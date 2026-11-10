import { app, BrowserWindow, dialog, shell, type IpcMain, type IpcMainInvokeEvent } from 'electron'
import * as fs from 'node:fs/promises'
import { stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { LocalDiagnosticEventInput } from '../../../src/shared/dataManagement'
import { editorV6IpcChannels } from '../../../src/shared/editorV6IpcChannels'
import { parseEditorV6ExportDocument } from '../../../src/shared/editorV6Schema'
import type { EditorV6MediaAsset } from '../../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import type { EditorV6HairMotionBundle } from '../../../src/shared/editorV6HairMotion'
import { parseEditorV6HairMotionBundle } from '../../../src/shared/editorV6HairMotion'
import { planEditorV6Export, type EditorV6ExportOptions, type EditorV6ExportStatus } from '../../../src/shared/editorV6Export'
import { editorV6ExportModeFileSuffix } from '../../../src/shared/editorV6ExportTestModes'
import { createEditorV6WorkerFactory } from './exportWorkers'
import { runEditorV6Export, type EditorV6ExportReport } from './exportRunner'
import type { EditorV6MotionCacheStats } from './motionCache'
import { publishJsonManifest } from '../storage/atomicManifest'
import { createPendingOperationTracker } from '../storage/pendingOperationTracker.ts'
import { createEditorV6ExportJobRegistry, isEditorV6ExportJobTerminal } from './exportJobRegistry'
import { createEditorV6ExportAudioPathResolver, registerEditorV6ExportMediaHandlers } from './exportMediaIpc'

type EditorV6ExportIpcDependencies = {
  ipcMain: Pick<IpcMain, 'handle' | 'removeHandler'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  recordDiagnostic: (input: LocalDiagnosticEventInput) => Promise<void>
  projectPath: (id: string) => string
  toolsDirectory: string
  workerHtml: string
  workerPreload: string
  devUrl?: string
  tempRoot: string
  getCharacters: () => Promise<CustomizerCharacter[]>
  bakeMotion: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  getMotionCacheStats?: () => EditorV6MotionCacheStats
  releaseMotionCacheScope?: (scope: string) => void
  captureMode?: 'capturePage' | 'paint-event'
  inspectCapture?: (capture: { window: BrowserWindow; frame: number; bitmap: Buffer }) => Promise<void>
  onFfmpegProcessStarted?: (pid: number) => void
  resolveLibraryVideo: (id: string) => Promise<{ path: string; name: string; mimeType: EditorV6MediaAsset['mimeType']; extension: string; size: number; durationFrames: number | null }>
  resolveLibraryAudio: (id: string) => Promise<{ path: string; name: string; mimeType: string; extension: string; size: number }>
  resolveLibraryAsset: (id: string) => Promise<{ path: string; mimeType: string }>
}
type EditorV6ExportIpcLifecycle = {
  cancelAll: () => void
  drain: () => Promise<void>
  getPendingWrites: () => Promise<unknown>[]
  resumeAfterFailedShutdown: () => void
  runIsolatedExport: (project: unknown, options: EditorV6ExportOptions, outputPath: string, reportPath: string, id: string, signal?: AbortSignal, progress?: (patch: Partial<EditorV6ExportStatus>) => void, motionPreparationConcurrency?: 1 | 2 | 3, hairAnimation?: EditorV6HairMotionBundle, onFfmpegProcessStarted?: (pid: number) => void) => Promise<EditorV6ExportReport>
}
const uuid = z.string().uuid()
export function registerEditorV6ExportHandlers(deps: EditorV6ExportIpcDependencies): EditorV6ExportIpcLifecycle {
  const folderPreference = join(app.getPath('userData'), 'editor-v6-export-folder.json')
  const readExportFolder = async (): Promise<string | null> => {
    let text: string
    try { text = await fs.readFile(folderPreference, 'utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
    const value: unknown = JSON.parse(text)
    return z.object({ folder: z.string().refine(isAbsolute).nullable() }).strict().parse(value).folder
  }
  const saveExportFolder = async (folder: string | null) => {
    await publishJsonManifest({ files: fs, target: folderPreference, temporary: `${folderPreference}.${randomUUID()}.tmp`, value: { folder } })
  }
  const mediaPath = async (projectId: string, fileName: string, libraryVideoId?: string) => libraryVideoId ? (await deps.resolveLibraryVideo(libraryVideoId)).path : join(deps.projectPath(projectId), 'media', fileName)
  const workers = createEditorV6WorkerFactory({ ipcMain: deps.ipcMain, html: deps.workerHtml, preload: deps.workerPreload, devUrl: deps.devUrl, mediaPath, resolveLibraryAsset: deps.resolveLibraryAsset, captureMode: deps.captureMode, inspectCapture: deps.inspectCapture })
  const ffmpeg = join(deps.toolsDirectory, 'ffmpeg.exe'), ffprobe = join(deps.toolsDirectory, 'ffprobe.exe')
  const jobs = createEditorV6ExportJobRegistry()
  const pendingFileWrites = createPendingOperationTracker()
  let shuttingDown = false
  let drainTask: Promise<void> | null = null
  const assertAvailable = () => {
    if (shuttingDown) throw Error('O aplicativo está encerrando; tente novamente depois.')
  }
  const cancelAll = () => jobs.cancelAll(Error('Aplicativo encerrado.'))
  const getPendingWrites = (): Promise<unknown>[] => [
    ...pendingFileWrites.getPending(),
    ...jobs.pendingPromises()
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
  const audioPath = createEditorV6ExportAudioPathResolver(deps)
  const runIsolatedExport: EditorV6ExportIpcLifecycle['runIsolatedExport'] = (rawProject, options, outputPath, reportPath, id, signal = new AbortController().signal, progress = (patch) => { if (patch.message) console.log(`[V6 isolated export] ${patch.message}`) }, motionPreparationConcurrency = 2, hairAnimation, onFfmpegProcessStarted) => {
    const project = parseEditorV6ExportDocument(rawProject)
    planEditorV6Export(options, project.timeline.durationFrames)
    if (Boolean(options.hairAnimationPresetSlot) !== Boolean(hairAnimation)) throw Error('A configuração da animação de cabelo não corresponde ao pacote preparado.')
    if (hairAnimation && hairAnimation.presetSlot !== options.hairAnimationPresetSlot) throw Error('O preset de cabelo mudou durante a preparação da exportação.')
    if (hairAnimation?.loopFrames !== options.hairAnimationLoopFrames) throw Error('O ciclo de cabelo preparado não corresponde às opções da exportação.')
    if (Boolean(hairAnimation?.poseReactionOnly) !== Boolean(options.hairPoseReactionOnly)) throw Error('A reação após pose não corresponde às opções da exportação.')
    if (Boolean(hairAnimation?.posteriorOnly) !== Boolean(options.hairPosteriorOnly)) throw Error('A seleção exclusiva de cabelo posterior não corresponde às opções da exportação.')
    return runEditorV6Export(project, options, {
      ffmpeg, ffprobe, tempRoot: deps.tempRoot, id, outputPath, reportPath,
      signal,
      getCharacters: deps.getCharacters,
      bakeMotion: deps.bakeMotion,
      motionPreparationConcurrency,
      ...(hairAnimation?.preparationProfile ? { hairPreparation: hairAnimation.preparationProfile } : {}),
      onFfmpegProcessStarted,
      getMotionCacheStats: deps.getMotionCacheStats,
      releaseMotionCacheScope: deps.releaseMotionCacheScope,
      createWorker: (renderProject, _part, signal, layeredVideo, mouthLoops) => workers.create({ project: renderProject, width: options.width, height: options.height, layeredVideo, ...(options.testMode ? { testMode: options.testMode } : {}), ...(mouthLoops ? { mouthLoops } : {}), ...(hairAnimation ? { hairAnimation } : {}) }, signal),
      audioPath: (clip) => audioPath(project.id, clip, project.media), mediaPath, progress
    })
  }
  const findJob = (event: IpcMainInvokeEvent, id: string) => {
    deps.assertTrustedSender(event)
    return jobs.findOwned(id === 'latest' ? id : uuid.parse(id), event.sender.id)
  }
  deps.ipcMain.handle(editorV6IpcChannels.getEditorV6ExportFolder, async (event) => { deps.assertTrustedSender(event); return readExportFolder() })
  deps.ipcMain.handle(editorV6IpcChannels.chooseEditorV6ExportFolder, async (event) => {
    deps.assertTrustedSender(event); assertAvailable()
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = { title: 'Escolher pasta fixa para exportar MP4', properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> }
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const folder = result.filePaths[0]
    if (!isAbsolute(folder) || !(await stat(folder)).isDirectory()) throw Error('A pasta escolhida é inválida.')
    await pendingFileWrites.track(() => saveExportFolder(folder))
    return folder
  })
  deps.ipcMain.handle(editorV6IpcChannels.clearEditorV6ExportFolder, async (event) => {
    deps.assertTrustedSender(event); assertAvailable()
    await pendingFileWrites.track(() => saveExportFolder(null))
  })
  deps.ipcMain.handle(editorV6IpcChannels.startEditorV6Export, async (event, rawProject, options: EditorV6ExportOptions, rawHairAnimation?: unknown) => {
    deps.assertTrustedSender(event)
    assertAvailable()
    if (jobs.hasActive()) throw Error('Aguarde ou cancele a exportação atual antes de iniciar outra.')
    const project = parseEditorV6ExportDocument(rawProject)
    planEditorV6Export(options, project.timeline.durationFrames)
    const hairAnimation = rawHairAnimation === undefined ? undefined : parseEditorV6HairMotionBundle(rawHairAnimation)
    if (Boolean(options.hairAnimationPresetSlot) !== Boolean(hairAnimation)) throw Error('A configuração da animação de cabelo está incompleta.')
    if (hairAnimation && hairAnimation.presetSlot !== options.hairAnimationPresetSlot) throw Error('O preset de cabelo mudou durante a preparação da exportação.')
    if (hairAnimation?.loopFrames !== options.hairAnimationLoopFrames) throw Error('O ciclo de cabelo preparado não corresponde às opções da exportação.')
    if (Boolean(hairAnimation?.poseReactionOnly) !== Boolean(options.hairPoseReactionOnly)) throw Error('A reação após pose não corresponde às opções da exportação.')
    if (Boolean(hairAnimation?.posteriorOnly) !== Boolean(options.hairPosteriorOnly)) throw Error('A seleção exclusiva de cabelo posterior não corresponde às opções da exportação.')
    const folder = await readExportFolder()
    const id = randomUUID()
    const name = project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || 'Video'
    const titleWithMode = name + editorV6ExportModeFileSuffix(options.testMode)
    let outputPath: string
    if (folder) {
      const info = await stat(folder).catch(() => null)
      if (!info?.isDirectory()) throw Error('A pasta fixa de exportação não está disponível. Escolha outra pasta no painel.')
      outputPath = join(folder, `${titleWithMode} - ${id}.mp4`)
    } else {
      const owner = BrowserWindow.fromWebContents(event.sender)
      const saveOptions = { title: 'Editor V6: exportar MP4', defaultPath: titleWithMode + '.mp4', filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }] }
      const destination = owner ? await dialog.showSaveDialog(owner, saveOptions) : await dialog.showSaveDialog(saveOptions)
      if (destination.canceled || !destination.filePath) return null
      outputPath = destination.filePath.toLowerCase().endsWith('.mp4') ? destination.filePath : destination.filePath + '.mp4'
    }
    assertAvailable()
    if (jobs.hasActive()) throw Error('Outra exportação já foi iniciada.')
    const controller = new AbortController(), reportPath = join(deps.projectPath(project.id), 'exports', `${id}.report.json`)
    const status: EditorV6ExportStatus = { id, state: 'preparing', frames: 0, totalFrames: options.endFrame - options.startFrame, message: 'Verificando codificador e preparando exportação…', fallback: false, reportPath, ...(options.testMode ? { testMode: options.testMode } : {}) }
    const job = { owner: event.sender.id, status, controller, promise: Promise.resolve() }
    jobs.add(job)
    const abort = () => controller.abort(Error('A janela do editor foi fechada.'))
    event.sender.once('destroyed', abort)
    job.promise = runIsolatedExport(project, options, outputPath, reportPath, id, controller.signal, (patch) => { job.status = { ...job.status, ...patch } }, undefined, hairAnimation, deps.onFfmpegProcessStarted).then((report) => {
      const mouth = report.mouthAnimation
      const totalExportMilliseconds = report.milliseconds === undefined ? undefined : report.milliseconds + (report.hairPreparation?.totalMilliseconds ?? 0)
      const seconds = totalExportMilliseconds === undefined ? 'não medido' : `${(totalExportMilliseconds / 1000).toFixed(2).replace('.', ',')} s`
      const modeNote = options.testMode ? ` Modo ${options.testMode} · ${seconds} incluindo preparo.` : ''
      const message = `${report.deliveryWarning ?? 'MP4 exportado e validado.'}${modeNote}${mouth ? ` Loop da boca em ${mouth.characters} personagem(ns) · ${mouth.cycleFrames / 30}s${mouth.skippedStates ? ` · ${mouth.skippedStates} estado(s) ignorado(s); veja o relatório` : ''}.` : ''}`
      job.status = { ...job.status, state: 'completed', outputPath: report.outputPath, fallback: report.fallback, frames: status.totalFrames, message, ...(totalExportMilliseconds !== undefined ? { totalExportMilliseconds } : {}) }
    }, (error: unknown) => {
      const cancelled = controller.signal.aborted
      job.status = { ...job.status, state: cancelled ? 'cancelled' : 'failed', error: error instanceof Error ? error.message : String(error), message: cancelled ? 'Exportação cancelada.' : 'A exportação falhou. Consulte o relatório.' }
      if (!cancelled) void Promise.resolve().then(() => deps.recordDiagnostic({
          severity: 'error', code: 'editor-v6.export-failed', domain: 'editor-v6', operation: 'export.mp4',
          stage: hairAnimation ? 'hair-motion-export' : 'export', result: 'failure', correlationId: id,
          message: hairAnimation
            ? 'A exportação MP4 falhou com a animação experimental de cabelo ativa; consulte o relatório.'
            : 'A exportação MP4 falhou; consulte o relatório.'
        })).catch(() => undefined)
    }).finally(() => { if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', abort) })
    jobs.pruneTerminal()
    return job.status
  })
  deps.ipcMain.handle(editorV6IpcChannels.getEditorV6ExportStatus, (event, id) => findJob(event, id).status)
  deps.ipcMain.handle(editorV6IpcChannels.cancelEditorV6Export, async (event, id) => { const job = findJob(event, id); if (!isEditorV6ExportJobTerminal(job.status)) job.controller.abort(Error('Exportação cancelada pelo usuário.')); await job.promise })
  deps.ipcMain.handle(editorV6IpcChannels.revealEditorV6Export, (event, id, report?: boolean) => { const job = findJob(event, id); const path = report ? job.status.reportPath : job.status.outputPath ?? job.status.reportPath; if (path) shell.showItemInFolder(path) })
  registerEditorV6ExportMediaHandlers({
    ipcMain: deps.ipcMain,
    assertTrustedSender: (event) => deps.assertTrustedSender(event),
    assertAvailable,
    pendingFileWrites,
    projectPath: (id) => deps.projectPath(id),
    resolveLibraryVideo: (id) => deps.resolveLibraryVideo(id),
    resolveLibraryAudio: (id) => deps.resolveLibraryAudio(id),
    ffprobe
  })
  return {
    cancelAll,
    drain,
    getPendingWrites,
    resumeAfterFailedShutdown: () => { shuttingDown = false; drainTask = null },
    runIsolatedExport
  }
}
