import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { EditorV6HairPreparationProfile } from '../../../src/shared/editorV6HairMotion'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import type { ProcessMetric } from 'electron'
import type { EditorV6ExportAudio, EditorV6ExportOptions, EditorV6ExportStatus } from '../../../src/shared/editorV6Export'
import { runExportCommand } from './exportProcess'
import { encodingArgs } from './exportEncoding'
import { probeExportMedia } from './exportMediaProbe'
import type { EditorV6MotionCacheStats } from './motionCache'
import { formatEditorV6Error } from '../../../src/shared/editorV6Error'
import { createEditorV6ExportExecutionPlan } from './exportPlanning'
import type { EditorV6ExportPartReport } from './exportPartRenderer'
import { renderEditorV6ExportAttempt, type EditorV6ExportPartWorkerFactory } from './exportAttemptRenderer'
import { renderEditorV6ExportWithFallback, type EditorV6ExportAttempt } from './exportFallbackStrategy'
import { createEditorV6ExportReportContext, type EditorV6ExportReport } from './exportReport'
import { createEditorV6EncoderProbe, selectEditorV6ExportEncoder, selectEditorV6FallbackEncoder } from './exportEncoderSelection'
import { createEditorV6ExportTempFolder, removeEditorV6ExportCandidate, removeEditorV6ExportTempFolder, writeEditorV6ExportReport } from './exportArtifacts'
import { publishEditorV6ExportCandidate } from './exportCandidatePublication'
import { addEditorV6PhaseTime } from './exportMetrics'
import { finalizeEditorV6Export } from './exportFinalization'
import { cleanupEditorV6ExportRun } from './exportRunCleanup'
import { prepareEditorV6ExportReadiness } from './exportReadiness'
import { createEditorV6ExportProcessMemoryReport, recordEditorV6ExportProcessMemorySample, recordEditorV6ExportProcessMemorySampleFailure } from './exportProcessMemory'

export { editorV6OutputColorFilter } from './exportVideoComposition'
export { encodingArgs, probeExportMedia }
export type { MediaProbe } from './exportMediaProbe'
export type { EditorV6ExportReport } from './exportReport'
type Dependencies = {
  ffmpeg: string; ffprobe: string; tempRoot: string; reportPath: string; outputPath: string; id: string
  createWorker: EditorV6ExportPartWorkerFactory
  getCharacters: () => Promise<CustomizerCharacter[]>
  bakeMotion: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  motionPreparationConcurrency?: 1 | 2 | 3
  hairPreparation?: EditorV6HairPreparationProfile
  getMotionCacheStats?: () => EditorV6MotionCacheStats
  releaseMotionCacheScope?: (scope: string) => void
  releaseIdleMotionWorkers?: () => void
  getElectronProcessMetrics?: () => readonly Pick<ProcessMetric, 'type' | 'memory'>[]
  audioPath: (clip: EditorV6ExportAudio) => string | Promise<string>
  mediaPath: (projectId: string, fileName: string, libraryVideoId?: string) => string | Promise<string>
  /** Test/diagnostic hook for measuring the external encoder without exposing it over IPC. */
  onFfmpegProcessStarted?: (pid: number) => void
  qualityReferenceFolder?: string
  signal: AbortSignal; progress: (patch: Partial<EditorV6ExportStatus>) => void
}

const message = formatEditorV6Error

export async function runEditorV6Export(project: EditorV6Document, requestedOptions: EditorV6ExportOptions, deps: Dependencies): Promise<EditorV6ExportReport> {
  const { options, testSettings, requestedParts, parts: planned, speechInRange, stressWorkerOverride } = createEditorV6ExportExecutionPlan(project, requestedOptions)
  const { report, layeredVideo, started, totalFrames } = createEditorV6ExportReportContext({ project, options, testSettings, id: deps.id, outputPath: deps.outputPath })
  let reportWriteQueue = Promise.resolve()
  const saveReport = () => {
    const write = reportWriteQueue.then(() => writeEditorV6ExportReport(deps.reportPath, report))
    reportWriteQueue = write.catch(() => {})
    return write
  }
  if (deps.getElectronProcessMetrics) report.electronProcessMemory = createEditorV6ExportProcessMemoryReport()
  let folder: string
  const temporarySetupStarted = performance.now()
  try {
    folder = await createEditorV6ExportTempFolder(deps.tempRoot)
  } catch (error) {
    addEditorV6PhaseTime(report, 'temporarySetup', temporarySetupStarted)
    report.state = deps.signal.aborted ? 'cancelled' : 'failed'
    report.error = message(error)
    report.endedAt = new Date().toISOString(); report.milliseconds = performance.now() - started
    try { await saveReport() }
    catch (reportError) { throw new AggregateError([error, reportError], 'Falha ao preparar o export e salvar seu relatório.') }
    throw error
  }
  addEditorV6PhaseTime(report, 'temporarySetup', temporarySetupStarted)
  const candidate = join(dirname(deps.outputPath), `.editor-v6-${deps.id}.mp4`)
  let published = false
  let characters: CustomizerCharacter[] = []
  const testEncoder = createEditorV6EncoderProbe({ ffmpeg: deps.ffmpeg, signal: deps.signal, report })
  const renderAttempt: EditorV6ExportAttempt = async (parts, encoder, maxParallelism = 2) => {
    report.currentPhase = 'rendering'
    await saveReport()
    return renderEditorV6ExportAttempt({
      project,
      parts,
      encoder,
      maxParallelism,
      exportStartedAt: started,
      options,
      layeredVideo,
      speechInRange,
      characters,
      testSettings,
      folder,
      ffmpeg: deps.ffmpeg,
      ffprobe: deps.ffprobe,
      motionCacheScope,
      signal: deps.signal,
      report,
      createWorker: deps.createWorker,
      bakeMotion: deps.bakeMotion,
      mediaPath: deps.mediaPath,
      onFfmpegProcessStarted: deps.onFfmpegProcessStarted,
      qualityReferenceFolder: deps.qualityReferenceFolder,
      progress: deps.progress,
      saveReport,
      formatError: message
    })
  }
  // Start only after synchronous setup succeeds, immediately before the try/finally
  // that owns the sampler. This guarantees every started timer is cleared.
  let nextProcessMemorySampleAt = performance.now()
  let lastProcessMemoryReportSaveAt = nextProcessMemorySampleAt
  let processMemoryReportSaveInFlight = false
  const memorySampler = setInterval(() => {
    const memory = report.mainProcessMemory
    if (memory) memory.peakRssBytes = Math.max(memory.peakRssBytes, process.memoryUsage().rss)
    const now = performance.now()
    const processMemory = report.electronProcessMemory
    if (deps.getElectronProcessMetrics && processMemory && now >= nextProcessMemorySampleAt) {
      nextProcessMemorySampleAt = now + processMemory.sampleIntervalMs
      try { recordEditorV6ExportProcessMemorySample(processMemory, deps.getElectronProcessMetrics()) }
      catch { recordEditorV6ExportProcessMemorySampleFailure(processMemory) }
    }
    if (deps.getElectronProcessMetrics && processMemory && now - lastProcessMemoryReportSaveAt >= 10000 && !processMemoryReportSaveInFlight) {
      lastProcessMemoryReportSaveAt = now
      processMemoryReportSaveInFlight = true
      void saveReport()
        .catch(error => console.warn('[Editor V6 export] Falha ao atualizar amostra de memória:', message(error)))
        .finally(() => { processMemoryReportSaveInFlight = false })
    }
  }, 500)
  const motionCacheScope = randomUUID()
  let exportFailure: unknown
  try {
    const readiness = await prepareEditorV6ExportReadiness({
      project,
      options,
      testSettings,
      hairPreparation: deps.hairPreparation,
      motionPreparationConcurrency: deps.motionPreparationConcurrency,
      motionCacheScope,
      signal: deps.signal,
      getCharacters: deps.getCharacters,
      getMotionCacheStats: deps.getMotionCacheStats,
      bakeMotion: deps.bakeMotion,
      releaseIdleMotionWorkers: deps.releaseIdleMotionWorkers,
      getElectronProcessMetrics: deps.getElectronProcessMetrics,
      report,
      progress: deps.progress,
      saveReport
    })
    project = readiness.project
    characters = readiness.characters
    await mkdir(dirname(deps.outputPath), { recursive: true })
    await writeFile(candidate, '', { flag: 'wx' })
    report.currentPhase = 'encoderProbe'
    await saveReport()
    const encoder = await selectEditorV6ExportEncoder(options.encoder, testEncoder)
    if (!encoder && options.encoder === 'amf') throw Error('O codificador AMD AMF obrigatório (h264_amf) não está disponível neste FFmpeg ou não conseguiu iniciar. Nenhum outro codificador foi tentado.')
    if (!encoder) throw Error('Nenhum codificador H.264 pôde ser iniciado.')
    const finish = async (parts: EditorV6ExportPartReport[]) => {
      report.currentPhase = 'finalization'
      await saveReport()
      const result = await finalizeEditorV6Export({
        ffmpeg: deps.ffmpeg,
        ffprobe: deps.ffprobe,
        folder,
        candidate,
        project,
        options,
        totalFrames,
        parts,
        signal: deps.signal,
        audioPath: (clip) => deps.audioPath(clip),
        runCommand: runExportCommand,
        probeMedia: probeExportMedia,
        progress: (patch) => deps.progress(patch),
        setAudioClipCount: (count) => { report.audioClips = count },
        setDeliveryWarning: (warning) => { report.deliveryWarning = warning },
        setValidation: (validation) => { report.validation = validation }
      })
      return result.validation
    }
    const finishMeasured = async (parts: EditorV6ExportPartReport[]) => {
      const finalizationStarted = performance.now()
      try { return await finish(parts) }
      finally { addEditorV6PhaseTime(report, 'finalization', finalizationStarted) }
    }
    report.validation = await renderEditorV6ExportWithFallback({
      options,
      plannedParts: planned,
      requestedPartCount: requestedParts.length,
      stressWorkerOverride,
      speechInRange,
      encoder,
      signal: deps.signal,
      report,
      progress: deps.progress,
      renderAttempt,
      finishMeasured,
      selectFallbackEncoder: async (attemptedEncoder) => {
        report.currentPhase = 'encoderProbe'
        await saveReport()
        return selectEditorV6FallbackEncoder(attemptedEncoder, testEncoder)
      },
      formatError: message
    })
    deps.signal.throwIfAborted()
    // The destination only changes after the candidate passes all validations.
    await publishEditorV6ExportCandidate({
      report, candidate, outputPath: deps.outputPath, id: deps.id, started, memorySampler, signal: deps.signal, saveReport,
      formatError: message
    })
    published = true
    return report
  } catch (error) {
    exportFailure = error
    report.state = deps.signal.aborted ? 'cancelled' : 'failed'
    report.error = message(error)
    throw error
  } finally {
    await cleanupEditorV6ExportRun({
      report,
      published,
      started,
      exportFailure,
      motionCacheScope,
      releaseMotionCacheScope: deps.releaseMotionCacheScope,
      memorySampler,
      candidate,
      tempRoot: deps.tempRoot,
      folder,
      saveReport,
      removeCandidate: removeEditorV6ExportCandidate,
      removeTempFolder: removeEditorV6ExportTempFolder,
      now: () => performance.now(),
      timestamp: () => new Date().toISOString(),
      currentRss: () => process.memoryUsage().rss,
      clearMemorySampler: (sampler) => clearInterval(sampler),
      formatError: message,
      warn: (...data) => console.warn(...data)
    })
  }
}
