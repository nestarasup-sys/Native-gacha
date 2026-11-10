import { mkdir, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { release as osRelease } from 'node:os'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { EditorV6HairPreparationProfile } from '../../../src/shared/editorV6HairMotion'
import { planEditorV6VideoOverlays } from '../../../src/shared/editorV6VideoComposition'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import { missingEditorV6Motions, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import { prepareExportMotions } from './prepareMotions'
import { editorV6ExportTestSettings, type EditorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import { planEditorV6Export, splitEditorV6ExportParts, type EditorV6ExportAudio, type EditorV6ExportOptions, type EditorV6ExportPart, type EditorV6ExportStatus } from '../../../src/shared/editorV6Export'
import { runExportCommand } from './exportProcess'
import { encodingArgs } from './exportEncoding'
import { probeExportMedia } from './exportMediaProbe'
import { motionCacheKey, type EditorV6MotionCacheStats } from './motionCache'
import { renderEditorV6ExportPart, type EditorV6ExportPartReport } from './exportPartRenderer'
import { createEditorV6ExportTempFolder, publishEditorV6Output, removeEditorV6ExportCandidate, removeEditorV6ExportTempFolder, writeEditorV6ExportReport } from './exportArtifacts'
import { addEditorV6PhaseTime, type EditorV6ExportPhaseTimings } from './exportMetrics'
import { finalizeEditorV6Export } from './exportFinalization'

export { editorV6OutputColorFilter } from './exportVideoComposition'
export { encodingArgs, probeExportMedia }
export type { MediaProbe } from './exportMediaProbe'

declare const __NATIVE_GACHA_BUILD_SHA__: string
declare const __NATIVE_GACHA_BUILD_DIRTY__: boolean
type AttemptReport = { parts: EditorV6ExportPartReport[]; encoder: string; parallelism: number; milliseconds?: number; error?: string }
export type EditorV6ExportReport = { schemaVersion: 1; id: string; state: string; projectId: string; options: EditorV6ExportOptions; fps: 30; totalFrames: number; fallback: boolean; attempts: AttemptReport[]; encoderTests: Array<{ encoder: string; error?: string }>; audioClips: number; videoInputs: number; proxies: 0; motionTransitionsRequired: number; motionTransitionsPrepared: number; motionPreparation?: Awaited<ReturnType<typeof prepareExportMotions>>['stats']; hairPreparation?: EditorV6HairPreparationProfile; exportTestSettings?: EditorV6ExportTestSettings; runtime?: { platform: string; arch: string; osRelease: string; node: string; electron?: string; buildSha?: string; workingTreeDirty?: boolean }; motionCache?: EditorV6MotionCacheStats & { inputSamples: Array<{ cacheKey: string; planKeyHash: string; characterId: string; characterFingerprint: string }> }; mouthAnimation?: { stateAtlases: number; characters: number; isolatedStates: number; legacyPatchStates: number; skippedStates: number; staleStates: number; cycleFrames: number; atlasBytes: number; atlasPixels: number; preparationMilliseconds: number; details: string[] }; mainProcessMemory?: { startRssBytes: number; peakRssBytes: number; sampleIntervalMs: number }; phaseMilliseconds: EditorV6ExportPhaseTimings; startedAt: string; endedAt?: string; milliseconds?: number; outputPath: string; deliveryWarning?: string; validation?: unknown; error?: string }
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
const MOUTH_LOOP_BATCH_FRAMES = 300
function hasLinkedSpeech(project: EditorV6Document, startFrame: number, endFrame: number) {
  return project.timeline.tracks.some((track) => track.kind === 'speech' && !track.hidden && !track.muted && track.blocks.some((block) => Boolean(block.characterId ?? block.state?.characterId) && block.startFrame < endFrame && block.startFrame + block.durationFrames > startFrame))
}

export async function runEditorV6Export(project: EditorV6Document, requestedOptions: EditorV6ExportOptions, deps: Dependencies): Promise<EditorV6ExportReport> {
  const options: EditorV6ExportOptions = { ...requestedOptions, mouthLoop: true }
  const testSettings = editorV6ExportTestSettings(options.testMode)
  const stressWorkerOverride = process.env.GACHA_VIDEO_STRESS_OFFSCREEN === '1' ? process.env.GACHA_EDITOR_V6_STRESS_EXPORT_WORKERS : undefined
  // The default 300-frame mouth-loop windows expose at most two lanes in a
  // 20-second benchmark. Split only stress runs asking for four renderers so
  // the override measures four actual workers; frame content remains intact.
  const mouthLoopBatchFrames = stressWorkerOverride === '4' ? Math.floor(MOUTH_LOOP_BATCH_FRAMES / 2) : MOUTH_LOOP_BATCH_FRAMES
  const requestedParts = planEditorV6Export(options, project.timeline.durationFrames)
  const speechInRange = hasLinkedSpeech(project, options.startFrame, options.endFrame)
  const planned = speechInRange ? splitEditorV6ExportParts(requestedParts, mouthLoopBatchFrames) : requestedParts
  if (stressWorkerOverride !== undefined && (!options.turbo || !/^([2-4])$/.test(stressWorkerOverride))) {
    throw Error('O benchmark isolado do Editor V6 aceita de 2 a 4 renderizadores Turbo.')
  }
  if (process.platform !== 'win32') throw Error('Este exportador BGRA está preparado para Windows.')
  const started = performance.now(), totalFrames = options.endFrame - options.startFrame
  const layeredVideo = planEditorV6VideoOverlays(project, options.startFrame, options.endFrame).length > 0
  const compiledSha = typeof __NATIVE_GACHA_BUILD_SHA__ === 'string' ? __NATIVE_GACHA_BUILD_SHA__ : ''
  const revision = process.env.NATIVE_GACHA_BUILD_SHA || compiledSha
  const runtime = { platform: process.platform, arch: process.arch, osRelease: osRelease(), node: process.versions.node,
    ...(process.versions.electron ? { electron: process.versions.electron } : {}),
    ...(revision && /^[0-9a-f]{7,40}$/i.test(revision) ? { buildSha: revision } : {}),
    ...(typeof __NATIVE_GACHA_BUILD_DIRTY__ === 'boolean' ? { workingTreeDirty: __NATIVE_GACHA_BUILD_DIRTY__ } : {}) }
  const report: EditorV6ExportReport = { schemaVersion: 1, id: deps.id, projectId: project.id, options, fps: 30, totalFrames, state: 'preparing', fallback: false, attempts: [], encoderTests: [], audioClips: 0, runtime, exportTestSettings: testSettings, videoInputs: new Set(planEditorV6VideoOverlays(project, options.startFrame, options.endFrame).map((clip) => clip.fileName)).size, proxies: 0, motionTransitionsRequired: 0, motionTransitionsPrepared: 0, phaseMilliseconds: { temporarySetup: 0, characterLoading: 0, motionPreparation: 0, encoderProbe: 0, rendering: 0, finalization: 0, publication: 0 }, startedAt: new Date().toISOString(), outputPath: deps.outputPath }
  const startRssBytes = process.memoryUsage().rss
  report.mainProcessMemory = { startRssBytes, peakRssBytes: startRssBytes, sampleIntervalMs: 500 }
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
    const attempt: AttemptReport = { parts: [], encoder, parallelism }
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
    const cacheInputSamples: NonNullable<EditorV6ExportReport['motionCache']>['inputSamples'] = []
    const prepared = await (async () => {
      try {
        return await prepareExportMotions(project, options.startFrame, options.endFrame, {
          signal: deps.signal, characters, concurrency: options.testMode && options.testMode !== 'controle' ? testSettings.motionConcurrency : deps.motionPreparationConcurrency ?? 2, mouthLoop: { startFrame: options.startFrame, cycleFrames: options.mouthLoopCycleFrames ?? 30 }, bake: (request, signal) => {
            if (cacheInputSamples.length < 3 && !cacheInputSamples.some((sample) => sample.characterId === request.character.id)) {
              cacheInputSamples.push({ cacheKey: motionCacheKey(request),
                planKeyHash: createHash('sha256').update(request.plan.key).digest('hex'), characterId: request.character.id,
                characterFingerprint: createHash('sha256').update(JSON.stringify(request.character)).digest('hex') })
            }
            return deps.bakeMotion({ ...request, cacheScope: motionCacheScope }, signal)
          },
          progress: (completed, total, name) => {
            report.motionTransitionsRequired = total; report.motionTransitionsPrepared = completed
            deps.progress({ state: 'preparing', frames: 0, motionProgress: { completed, total }, message: completed === total ? 'Transições prontas.' : `Preparando transição ${completed + 1}/${total} · ${name}…` })
          }
        })
      } finally { addEditorV6PhaseTime(report, 'motionPreparation', motionPreparationStarted) }
    })()
    project = prepared.project
    report.motionTransitionsRequired = prepared.stats.total
    report.motionTransitionsPrepared = prepared.stats.total
    report.motionPreparation = prepared.stats
    const cacheAfter = deps.getMotionCacheStats?.()
    if (cacheBefore && cacheAfter) {
      const counters = Object.fromEntries(Object.entries(cacheAfter).filter((entry): entry is [string, number] => typeof entry[1] === 'number').map(([key, value]) => [key, value - (cacheBefore[key as keyof EditorV6MotionCacheStats] as number)]))
      report.motionCache = { ...counters, inputSamples: cacheInputSamples } as NonNullable<EditorV6ExportReport['motionCache']>
    }
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
      const safeParts = speechInRange ? splitEditorV6ExportParts(safePart, MOUTH_LOOP_BATCH_FRAMES) : safePart
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
