import { editorV6OutputFrame } from '../../../src/shared/editorV6Export'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { EditorV6ExportOptions, EditorV6ExportPart, EditorV6ExportStatus } from '../../../src/shared/editorV6Export'
import type { EditorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import { addEditorV6PhaseTime } from './exportMetrics'
import { renderEditorV6ExportPart, type EditorV6ExportPartReport } from './exportPartRenderer'
import type { EditorV6ExportAttemptReport, EditorV6ExportReport } from './exportReport'
import { summarizeEditorV6ExportAttempt } from './exportAttemptSummary'

export type EditorV6ExportPartWorkerFactory = Parameters<typeof renderEditorV6ExportPart>[0]['createWorker']
export type EditorV6ExportPartRenderer = typeof renderEditorV6ExportPart

type Dependencies = {
  project: EditorV6Document
  parts: EditorV6ExportPart[]
  encoder: string
  maxParallelism?: number
  exportStartedAt: number
  options: EditorV6ExportOptions
  layeredVideo: boolean
  speechInRange: boolean
  characters: CustomizerCharacter[]
  testSettings: EditorV6ExportTestSettings
  folder: string
  ffmpeg: string
  ffprobe: string
  motionCacheScope: string
  signal: AbortSignal
  report: Pick<EditorV6ExportReport, 'attempts' | 'fallback' | 'mouthAnimation' | 'phaseMilliseconds'>
  createWorker: EditorV6ExportPartWorkerFactory
  bakeMotion: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  mediaPath: (projectId: string, fileName: string, libraryVideoId?: string) => string | Promise<string>
  onFfmpegProcessStarted?: (pid: number) => void
  qualityReferenceFolder?: string
  progress: (patch: Partial<EditorV6ExportStatus>) => void
  saveReport: () => Promise<void>
  formatError: (error: unknown) => string
  renderPart?: EditorV6ExportPartRenderer
}

/** Schedules an attempt's parts, reports progress, and aggregates per-part diagnostics. */
export async function renderEditorV6ExportAttempt(dependencies: Dependencies): Promise<EditorV6ExportPartReport[]> {
  const {
    project, parts: plannedParts, encoder, maxParallelism = 2, exportStartedAt, options, layeredVideo, speechInRange,
    characters, testSettings, folder, ffmpeg, ffprobe, motionCacheScope, signal, report,
    createWorker, bakeMotion, mediaPath, onFfmpegProcessStarted, qualityReferenceFolder, progress, saveReport, formatError
  } = dependencies
  const renderPartDependency = dependencies.renderPart ?? renderEditorV6ExportPart
  const began = performance.now()
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const parts = plannedParts.filter(part => editorV6OutputFrame(part.endFrame, options.startFrame, options.fps) > editorV6OutputFrame(part.startFrame, options.startFrame, options.fps))
  const parallelism = Math.max(1, Math.min(maxParallelism, parts.length))
  const attempt: EditorV6ExportAttemptReport = { parts: [], encoder, parallelism }
  report.attempts.push(attempt)
  let done = 0
  const mouthStats = {
    states: 0,
    characterIds: new Set<string>(),
    isolatedStates: 0,
    legacyPatchStates: 0,
    skipped: 0,
    skippedStale: 0,
    atlasBytes: 0,
    atlasPixels: 0,
    preparationMilliseconds: 0,
    details: new Set<string>()
  }
  report.mouthAnimation = undefined
  const publishMouthStats = () => {
    report.mouthAnimation = {
      stateAtlases: mouthStats.states,
      characters: mouthStats.characterIds.size,
      isolatedStates: mouthStats.isolatedStates,
      legacyPatchStates: mouthStats.legacyPatchStates,
      skippedStates: mouthStats.skipped,
      staleStates: mouthStats.skippedStale,
      cycleFrames: options.mouthLoopCycleFrames ?? 30,
      atlasBytes: mouthStats.atlasBytes,
      atlasPixels: mouthStats.atlasPixels,
      preparationMilliseconds: mouthStats.preparationMilliseconds,
      details: [...mouthStats.details].slice(0, 3)
    }
  }
  const renderPart = (part: EditorV6ExportPart) => renderPartDependency({
    project,
    part,
    attemptNumber: report.attempts.length,
    attemptPartCount: parts.length,
    exportStartedAt,
    encoder,
    parallelism,
    options,
    layeredVideo,
    speechInRange,
    characters,
    testSettings,
    folder,
    ffmpeg,
    ffprobe,
    motionCacheScope,
    qualityReferenceFolder,
    signal: controller.signal,
    abort: (reason) => controller.abort(reason),
    completedFrames: () => done,
    createWorker,
    bakeMotion,
    mediaPath,
    onFfmpegProcessStarted,
    progress,
    onPartCreated: (result) => attempt.parts.push(result),
    onFrameWritten: () => { done++; progress({ frames: done }) },
    onMouthPrepared: (mouth) => {
      mouthStats.states += mouth.stats.states
      mouthStats.isolatedStates += mouth.stats.isolatedStates
      mouthStats.legacyPatchStates += mouth.stats.legacyPatchStates
      for (const id of mouth.mouthLoops.states.map((state) => state.characterId)) mouthStats.characterIds.add(id)
      mouthStats.skipped += mouth.stats.skipped
      mouthStats.skippedStale += mouth.stats.skippedStale
      mouthStats.atlasBytes += mouth.stats.atlasBytes
      mouthStats.atlasPixels += mouth.stats.atlasPixels
      mouthStats.preparationMilliseconds += mouth.stats.milliseconds
      for (const detail of mouth.stats.errors) mouthStats.details.add(detail)
      publishMouthStats()
    }
  })

  try {
    progress({ state: 'rendering', frames: 0, motionProgress: undefined, message: parallelism > 1 ? `Renderizando até ${parallelism} trechos em paralelo…` : 'Renderizando um trecho por vez…', fallback: report.fallback })
    const results: EditorV6ExportPartReport[] = []
    let nextPart = 0
    let completedSinceSave = 0
    let failure: { error: unknown } | undefined
    let saveQueue = Promise.resolve()
    const scheduleReportSave = () => {
      saveQueue = saveQueue.then(async () => {
        if (failure) return
        try {
          await saveReport()
        } catch (error) {
          failure ??= { error }
          controller.abort(error)
        }
      })
    }
    const worker = async () => {
      while (!failure && !controller.signal.aborted) {
        const part = parts[nextPart++]
        if (!part) return
        try {
          results.push(await renderPart(part))
        } catch (error) {
          failure ??= { error }
          controller.abort(error)
          return
        }
        completedSinceSave++
        if (completedSinceSave >= parallelism) {
          completedSinceSave = 0
          scheduleReportSave()
        }
      }
    }

    await Promise.all(Array.from({ length: parallelism }, worker))
    if (!failure && completedSinceSave > 0) scheduleReportSave()
    await saveQueue
    if (failure) throw failure.error
    if (controller.signal.aborted) throw signal.reason
    return results.sort((a, b) => a.index - b.index)
  } catch (error) {
    attempt.error = formatError(error)
    throw error
  } finally {
    attempt.milliseconds = performance.now() - began
    attempt.parts.sort((a, b) => a.index - b.index)
    attempt.summary = summarizeEditorV6ExportAttempt(attempt.parts, parts.length, attempt.milliseconds)
    addEditorV6PhaseTime(report, 'rendering', began)
    signal.removeEventListener('abort', abort)
  }
}
