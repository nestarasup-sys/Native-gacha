import { mkdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { EditorV6HairPreparationProfile } from '../../../src/shared/editorV6HairMotion'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import { missingEditorV6Motions, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import { splitEditorV6ExportParts, type EditorV6ExportAudio, type EditorV6ExportOptions, type EditorV6ExportPart, type EditorV6ExportStatus } from '../../../src/shared/editorV6Export'
import { runExportCommand } from './exportProcess'
import { encodingArgs } from './exportEncoding'
import { probeExportMedia } from './exportMediaProbe'
import type { EditorV6MotionCacheStats } from './motionCache'
import { prepareEditorV6ExportMotions, type EditorV6PreparedExportMotions } from './exportMotionPreparation'
import { createEditorV6ExportExecutionPlan, EDITOR_V6_MOUTH_LOOP_BATCH_FRAMES } from './exportPlanning'
import { renderEditorV6ExportPart, type EditorV6ExportPartReport } from './exportPartRenderer'
import { createEditorV6ExportReportContext, type EditorV6ExportAttemptReport, type EditorV6ExportReport } from './exportReport'
import { createEditorV6ExportTempFolder, publishEditorV6Output, removeEditorV6ExportCandidate, removeEditorV6ExportTempFolder, writeEditorV6ExportReport } from './exportArtifacts'
import { addEditorV6PhaseTime } from './exportMetrics'
import { finalizeEditorV6Export } from './exportFinalization'

export { editorV6OutputColorFilter } from './exportVideoComposition'
export { encodingArgs, probeExportMedia }
export type { MediaProbe } from './exportMediaProbe'
export type { EditorV6ExportReport } from './exportReport'
type Dependencies = {
  ffmpeg: string; ffprobe: string; tempRoot: string; reportPath: string; outputPath: string; id: string
  createWorker: Parameters<typeof renderEditorV6ExportPart>[0]['createWorker']
  getCharacters: () => Promise<CustomizerCharacter[]>
  bakeMotion: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  motionPreparationConcurrency?: 1 | 2 | 3
  hairPreparation?: EditorV6HairPreparationProfile
  getMotionCacheStats?: () => EditorV6MotionCacheStats
  releaseMotionCacheScope?: (scope: string) => void
  audioPath: (clip: EditorV6ExportAudio) => string | Promise<string>
  mediaPath: (projectId: string, fileName: string, libraryVideoId?: string) => string | Promise<string>
  /** Test/diagnostic hook for measuring the external encoder without exposing it over IPC. */
  onFfmpegProcessStarted?: (pid: number) => void
  signal: AbortSignal; progress: (patch: Partial<EditorV6ExportStatus>) => void
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

export async function runEditorV6Export(project: EditorV6Document, requestedOptions: EditorV6ExportOptions, deps: Dependencies): Promise<EditorV6ExportReport> {
  const { options, testSettings, requestedParts, parts: planned, speechInRange, stressWorkerOverride } = createEditorV6ExportExecutionPlan(project, requestedOptions)
  const { report, layeredVideo, started, totalFrames } = createEditorV6ExportReportContext({ project, options, testSettings, id: deps.id, outputPath: deps.outputPath })
  const saveReport = () => writeEditorV6ExportReport(deps.reportPath, report)
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
  const testEncoder = async (encoder: string) => {
    const probeStarted = performance.now()
    try {
      await runExportCommand(deps.ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30', '-frames:v', '1', ...encodingArgs(encoder, 1), '-an', '-f', 'null', '-'], deps.signal)
      report.encoderTests.push({ encoder }); return true
    } catch (error) { deps.signal.throwIfAborted(); report.encoderTests.push({ encoder, error: message(error) }); return false }
    finally { addEditorV6PhaseTime(report, 'encoderProbe', probeStarted) }
  }
  const renderAttempt = async (parts: EditorV6ExportPart[], encoder: string, maxParallelism = 2): Promise<EditorV6ExportPartReport[]> => {
    const began = performance.now(), controller = new AbortController(), abort = () => controller.abort(deps.signal.reason)
    deps.signal.addEventListener('abort', abort, { once: true })
    if (deps.signal.aborted) abort()
    const parallelism = Math.max(1, Math.min(maxParallelism, parts.length))
    const attempt: EditorV6ExportAttemptReport = { parts: [], encoder, parallelism }
    report.attempts.push(attempt)
    let done = 0
    const mouthStats = { states: 0, characterIds: new Set<string>(), isolatedStates: 0, legacyPatchStates: 0, skipped: 0, skippedStale: 0, atlasBytes: 0, atlasPixels: 0, preparationMilliseconds: 0, details: new Set<string>() }
    report.mouthAnimation = undefined
    const publishMouthStats = () => {
      report.mouthAnimation = { stateAtlases: mouthStats.states, characters: mouthStats.characterIds.size, isolatedStates: mouthStats.isolatedStates, legacyPatchStates: mouthStats.legacyPatchStates, skippedStates: mouthStats.skipped, staleStates: mouthStats.skippedStale, cycleFrames: options.mouthLoopCycleFrames ?? 30, atlasBytes: mouthStats.atlasBytes, atlasPixels: mouthStats.atlasPixels, preparationMilliseconds: mouthStats.preparationMilliseconds, details: [...mouthStats.details].slice(0, 3) }
    }
    deps.progress({ state: 'rendering', frames: 0, motionProgress: undefined, message: parallelism > 1 ? `Renderizando até ${parallelism} trechos em paralelo…` : 'Renderizando um trecho por vez…', fallback: report.fallback })
    const renderPart = (part: EditorV6ExportPart) => renderEditorV6ExportPart({
      project,
      part,
      attemptNumber: report.attempts.length,
      attemptPartCount: parts.length,
      exportStartedAt: started,
      encoder,
      parallelism,
      options,
      layeredVideo,
      speechInRange,
      characters,
      testSettings,
      folder,
      ffmpeg: deps.ffmpeg,
      ffprobe: deps.ffprobe,
      motionCacheScope,
      signal: controller.signal,
      abort: (reason) => controller.abort(reason),
      completedFrames: () => done,
      createWorker: deps.createWorker,
      bakeMotion: deps.bakeMotion,
      mediaPath: deps.mediaPath,
      onFfmpegProcessStarted: deps.onFfmpegProcessStarted,
      progress: deps.progress,
      onPartCreated: (result) => attempt.parts.push(result),
      onFrameWritten: () => { done++; deps.progress({ frames: done }) },
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
      const results: EditorV6ExportPartReport[] = []
      for (let offset = 0; offset < parts.length; offset += parallelism) {
        const group = parts.slice(offset, offset + parallelism)
        const settled = await Promise.allSettled(group.map(renderPart))
        const failed = settled.find((item) => item.status === 'rejected')
        if (failed?.status === 'rejected') throw failed.reason
        results.push(...settled.flatMap((item) => item.status === 'fulfilled' ? [item.value] : []))
        await saveReport()
      }
      return results.sort((a, b) => a.index - b.index)
    } catch (error) { attempt.error = message(error); throw error }
    finally {
      attempt.milliseconds = performance.now() - began
      addEditorV6PhaseTime(report, 'rendering', began)
      deps.signal.removeEventListener('abort', abort)
    }
  }
  // Start only after synchronous setup succeeds, immediately before the try/finally
  // that owns the sampler. This guarantees every started timer is cleared.
  const memorySampler = setInterval(() => {
    const memory = report.mainProcessMemory
    if (memory) memory.peakRssBytes = Math.max(memory.peakRssBytes, process.memoryUsage().rss)
  }, 500)
  const motionCacheScope = randomUUID()
  let exportFailure: unknown
  try {
    deps.signal.throwIfAborted()
    report.hairPreparation = deps.hairPreparation
    const characterLoadStarted = performance.now()
    try { characters = await deps.getCharacters() }
    finally { addEditorV6PhaseTime(report, 'characterLoading', characterLoadStarted) }
    const motionPreparationStarted = performance.now()
    const cacheBefore = deps.getMotionCacheStats?.()
    let prepared: EditorV6PreparedExportMotions
    try {
      prepared = await prepareEditorV6ExportMotions({
        project,
        options,
        testSettings,
        characters,
        signal: deps.signal,
        motionPreparationConcurrency: deps.motionPreparationConcurrency,
        motionCacheScope,
        cacheBefore,
        getMotionCacheStats: deps.getMotionCacheStats,
        bakeMotion: deps.bakeMotion,
        onProgress: (completed, total, name) => {
          report.motionTransitionsRequired = total
          report.motionTransitionsPrepared = completed
          deps.progress({ state: 'preparing', frames: 0, motionProgress: { completed, total }, message: completed === total ? 'Transições prontas.' : `Preparando transição ${completed + 1}/${total} · ${name}…` })
        }
      })
    } finally { addEditorV6PhaseTime(report, 'motionPreparation', motionPreparationStarted) }
    project = prepared.project
    report.motionTransitionsRequired = prepared.stats.total
    report.motionTransitionsPrepared = prepared.stats.total
    report.motionPreparation = prepared.stats
    if (prepared.motionCache) report.motionCache = prepared.motionCache
    if (missingEditorV6Motions(project, options.startFrame, options.endFrame).length) throw Error('Não foi possível preparar todas as transições deste intervalo.')
    await saveReport()
    await mkdir(dirname(deps.outputPath), { recursive: true })
    await writeFile(candidate, '', { flag: 'wx' })
    let encoder = ''
    for (const candidate of options.encoder === 'auto' ? ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_mf', 'libx264', 'libopenh264'] : ['libx264', 'libopenh264']) if (await testEncoder(candidate)) { encoder = candidate; break }
    if (!encoder) throw Error('Nenhum codificador H.264 pôde ser iniciado.')
    const finish = async (parts: EditorV6ExportPartReport[]) => {
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
    try {
      const turboParallelism = stressWorkerOverride ? Number(stressWorkerOverride) : options.turbo ? 2 : 1
      report.validation = await finishMeasured(await renderAttempt(planned, encoder, turboParallelism))
    } catch (error) {
      deps.signal.throwIfAborted()
      const attempt = report.attempts.at(-1)
      if (attempt) attempt.error = message(error)
      if (options.forceTurbo1080) throw Error(`Turbo obrigatório falhou: ${message(error)}`)
      if (!options.turbo || requestedParts.length < 2) throw error
      report.fallback = true
      deps.progress({ message: 'O Turbo falhou. Reiniciando com um renderizador e CPU…', fallback: true })
      const safeEncoder = encoder === 'libx264' || encoder === 'libopenh264' ? encoder : (await testEncoder('libx264') ? 'libx264' : await testEncoder('libopenh264') ? 'libopenh264' : '')
      if (!safeEncoder) throw Error('Nenhum codificador H.264 de fallback pôde ser iniciado.')
      const safePart = [{ index: 0, startFrame: options.startFrame, endFrame: options.endFrame }]
      const safeParts = speechInRange ? splitEditorV6ExportParts(safePart, EDITOR_V6_MOUTH_LOOP_BATCH_FRAMES) : safePart
      report.validation = await finishMeasured(await renderAttempt(safeParts, safeEncoder, 1))
    }
    deps.signal.throwIfAborted()
    // The destination only changes after the candidate passes all validations.
    report.state = 'publishing'
    await saveReport()
    deps.signal.throwIfAborted()
    const publicationStarted = performance.now()
    let publication: Awaited<ReturnType<typeof publishEditorV6Output>>
    try { publication = await publishEditorV6Output(candidate, deps.outputPath, deps.id) }
    finally { addEditorV6PhaseTime(report, 'publication', publicationStarted) }
    report.outputPath = publication.outputPath
    report.deliveryWarning = [report.deliveryWarning, publication.warning].filter(Boolean).join(' ') || undefined
    published = true
    report.state = 'completed'
    report.endedAt = new Date().toISOString(); report.milliseconds = performance.now() - started
    clearInterval(memorySampler)
    report.mainProcessMemory!.peakRssBytes = Math.max(report.mainProcessMemory!.peakRssBytes, process.memoryUsage().rss)
    try { await saveReport() }
    catch (error) {
      report.deliveryWarning = [report.deliveryWarning, `Vídeo salvo, mas não foi possível atualizar o relatório: ${message(error)}`].filter(Boolean).join(' ')
    }
    return report
  } catch (error) {
    exportFailure = error
    report.state = deps.signal.aborted ? 'cancelled' : 'failed'
    report.error = message(error)
    throw error
  } finally {
    deps.releaseMotionCacheScope?.(motionCacheScope)
    clearInterval(memorySampler)
    const memory = report.mainProcessMemory
    if (memory) memory.peakRssBytes = Math.max(memory.peakRssBytes, process.memoryUsage().rss)
    const cleanupErrors: unknown[] = []
    if (!published) {
      report.endedAt = new Date().toISOString(); report.milliseconds = performance.now() - started
      try { await saveReport() } catch (error) { cleanupErrors.push(error) }
    }
    try { await removeEditorV6ExportCandidate(candidate) } catch (error) { cleanupErrors.push(error) }
    try { await removeEditorV6ExportTempFolder(deps.tempRoot, folder) } catch (error) { cleanupErrors.push(error) }
    if (cleanupErrors.length) {
      const details = cleanupErrors.map(message)
      if (published) {
        report.deliveryWarning = [report.deliveryWarning, 'O MP4 foi salvo, mas houve falha ao limpar arquivos temporários.'].filter(Boolean).join(' ')
        try { await saveReport() } catch (error) { console.warn('Não foi possível registrar a falha de limpeza do Editor V6:', message(error)) }
        console.warn('Falha ao limpar arquivos temporários do Editor V6:', details.join('; '))
      } else {
        const primary = exportFailure === undefined ? [] : [exportFailure]
        throw new AggregateError([...primary, ...cleanupErrors], [exportFailure === undefined ? 'Falha ao limpar arquivos temporários da exportação.' : `A exportação falhou: ${message(exportFailure)}.`, `Falha adicional na limpeza: ${details.join('; ')}`].join(' '))
      }
    }
  }
}
