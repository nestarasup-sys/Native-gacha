import { mkdir, mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { availableParallelism } from 'node:os'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import { planEditorV6VideoOverlays } from '../../../src/shared/editorV6VideoComposition'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import { missingEditorV6Motions, type EditorV6MotionBakeRequest, type EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import { prepareExportMotions } from './prepareMotions'
import { prepareExportMouthLoops } from './prepareMouthLoops'
import { planEditorV6Audio, planEditorV6Export, splitEditorV6ExportParts, type EditorV6ExportAudio, type EditorV6ExportMouthLoops, type EditorV6ExportOptions, type EditorV6ExportPart, type EditorV6ExportStatus, type EditorV6FrameTimings } from '../../../src/shared/editorV6Export'
import { runExportCommand, spawnExportProcess, waitForExport } from './exportProcess'
import type { EditorV6FrameWorker } from './exportWorkers'
import { motionCacheKey, type EditorV6MotionCacheStats } from './motionCache'
type StreamProbe = { codec_type: string; codec_name: string; profile?: string; pix_fmt?: string; width?: number; height?: number; r_frame_rate?: string; time_base?: string; nb_read_frames?: string; nb_frames?: string; duration?: string; extradata_hash?: string }
export type MediaProbe = { streams: StreamProbe[]; format: { duration?: string } }
export async function probeExportMedia(ffprobe: string, path: string, signal: AbortSignal, count = false): Promise<MediaProbe> {
  const result = await runExportCommand(ffprobe, ['-v', 'error', ...(count ? ['-count_frames'] : []), '-show_streams', '-show_format', '-show_data_hash', 'sha256', '-of', 'json', path], signal)
  return JSON.parse(result.stdout) as MediaProbe
}
type TimingPhase = keyof EditorV6FrameTimings | 'workerStartupMs' | 'ffmpegFinalizeMs'
type TimingAccumulator = { count: number; totalMs: number; maxMs: number; histogram: number[] }
type FrameTimingReport = Partial<Record<TimingPhase, { samples: number; totalMs: number; p50Ms: number; p95Ms: number; maxMs: number }>>
type PartReport = EditorV6ExportPart & { encoder: string; rendered: number; reused: number; frames: number; milliseconds: number; frameTiming?: FrameTimingReport; path: string; probe?: MediaProbe }
type AttemptReport = { parts: PartReport[]; encoder: string; parallelism: number; milliseconds?: number; error?: string }
type ExportPhase = 'temporarySetup' | 'characterLoading' | 'motionPreparation' | 'encoderProbe' | 'rendering' | 'finalization' | 'publication'
type ExportPhaseTimings = Record<ExportPhase, number>
export type EditorV6ExportReport = { schemaVersion: 1; id: string; state: string; projectId: string; options: EditorV6ExportOptions; fps: 30; totalFrames: number; fallback: boolean; attempts: AttemptReport[]; encoderTests: Array<{ encoder: string; error?: string }>; audioClips: number; videoInputs: number; proxies: 0; motionTransitionsRequired: number; motionTransitionsPrepared: number; motionPreparation?: Awaited<ReturnType<typeof prepareExportMotions>>['stats']; motionCache?: EditorV6MotionCacheStats & { inputSamples: Array<{ cacheKey: string; planKeyHash: string; characterId: string; characterFingerprint: string }> }; mouthAnimation?: { stateAtlases: number; characters: number; skippedStates: number; staleStates: number; cycleFrames: number; atlasBytes: number; atlasPixels: number; preparationMilliseconds: number; details: string[] }; mainProcessMemory?: { startRssBytes: number; peakRssBytes: number; sampleIntervalMs: number }; phaseMilliseconds: ExportPhaseTimings; startedAt: string; endedAt?: string; milliseconds?: number; outputPath: string; deliveryWarning?: string; validation?: unknown; error?: string }
type Dependencies = {
  ffmpeg: string; ffprobe: string; tempRoot: string; reportPath: string; outputPath: string; id: string
  createWorker: (project: EditorV6Document, part: EditorV6ExportPart, signal: AbortSignal, layeredVideo: boolean, mouthLoops?: EditorV6ExportMouthLoops) => Promise<EditorV6FrameWorker>
  getCharacters: () => Promise<CustomizerCharacter[]>
  bakeMotion: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  motionPreparationConcurrency?: 1 | 2
  getMotionCacheStats?: () => EditorV6MotionCacheStats
  audioPath: (clip: EditorV6ExportAudio) => string | Promise<string>
  mediaPath: (projectId: string, fileName: string, libraryVideoId?: string) => string | Promise<string>
  signal: AbortSignal; progress: (patch: Partial<EditorV6ExportStatus>) => void
}

export async function publishEditorV6Output(candidate: string, requestedPath: string, id: string, move: (from: string, to: string) => Promise<void> = rename): Promise<{ outputPath: string; warning?: string }> {
  try { await move(candidate, requestedPath); return { outputPath: requestedPath } }
  catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (!['EPERM', 'EACCES', 'EBUSY', 'EEXIST'].includes(String(code))) throw error
    const extension = extname(requestedPath) || '.mp4'
    const recoveryPath = join(dirname(requestedPath), `${basename(requestedPath, extension)} (recuperado-${id.slice(0, 8)})${extension}`)
    await move(candidate, recoveryPath)
    return { outputPath: recoveryPath, warning: `O destino escolhido estava ocupado; o vídeo foi salvo como ${basename(recoveryPath)}.` }
  }
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
function addPhaseTime(report: EditorV6ExportReport, phase: ExportPhase, started: number) {
  report.phaseMilliseconds[phase] = Math.round((report.phaseMilliseconds[phase] + performance.now() - started) * 100) / 100
}
const TIMING_BUCKET_MS = .1
const TIMING_BUCKETS = 2001
function newTimingAccumulators(): Record<TimingPhase, TimingAccumulator> {
  return Object.fromEntries((['workerStartupMs', 'sceneResolutionMs', 'assetPreparationMs', 'reactCommitMs', 'rafWaitMs', 'ipcDrawMs', 'captureMs', 'backgroundCaptureMs', 'foregroundCaptureMs', 'frameRoundTripMs', 'ffmpegWriteMs', 'ffmpegFinalizeMs'] as const).map((phase) => [phase, { count: 0, totalMs: 0, maxMs: 0, histogram: Array<number>(TIMING_BUCKETS).fill(0) }])) as Record<TimingPhase, TimingAccumulator>
}
function recordTiming(accumulators: Record<TimingPhase, TimingAccumulator>, phase: TimingPhase, milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return
  const stats = accumulators[phase], bucket = Math.min(TIMING_BUCKETS - 1, Math.floor(milliseconds / TIMING_BUCKET_MS))
  stats.count++; stats.totalMs += milliseconds; stats.maxMs = Math.max(stats.maxMs, milliseconds); stats.histogram[bucket]++
}
function summarizeTimings(accumulators: Record<TimingPhase, TimingAccumulator>): FrameTimingReport {
  const report: FrameTimingReport = {}
  for (const [phase, stats] of Object.entries(accumulators) as Array<[TimingPhase, TimingAccumulator]>) {
    if (!stats.count) continue
    const percentile = (fraction: number) => {
      const target = Math.ceil(stats.count * fraction)
      let accumulated = 0
      for (let bucket = 0; bucket < stats.histogram.length; bucket++) {
        accumulated += stats.histogram[bucket]
        if (accumulated >= target) return Number((bucket * TIMING_BUCKET_MS).toFixed(1))
      }
      return 0
    }
    report[phase] = { samples: stats.count, totalMs: Math.round(stats.totalMs * 100) / 100, p50Ms: percentile(.5) as number, p95Ms: percentile(.95) as number, maxMs: Math.round(stats.maxMs * 100) / 100 }
  }
  return report
}
const encodingArgs = (encoder: string, threads: number) => ['-c:v', encoder, ...(encoder === 'libopenh264' ? ['-b:v', '12M', '-rc_mode', 'quality', '-allow_skip_frames', '0', '-threads', String(threads)] : ['-b:v', '12M']), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.1', '-g', '60', '-bf', '0', '-video_track_timescale', '30000']
const MOUTH_LOOP_BATCH_FRAMES = 300
function hasLinkedSpeech(project: EditorV6Document, startFrame: number, endFrame: number) {
  return project.timeline.tracks.some((track) => track.kind === 'speech' && !track.hidden && !track.muted && track.blocks.some((block) => Boolean(block.characterId ?? block.state?.characterId) && block.startFrame < endFrame && block.startFrame + block.durationFrames > startFrame))
}

function timelineMediaAudio(project: EditorV6Document): EditorV6ExportAudio[] {
  const media = new Map((project.media ?? []).filter((asset) => asset.hasAudio).map((asset) => [asset.id, asset]))
  return project.timeline.tracks.flatMap((track) => track.blocks.flatMap((block) => {
    const asset = block.mediaId ? media.get(block.mediaId) : undefined
    if (!asset || (track.kind !== 'audio' && !(track.kind === 'video' && asset.kind === 'video')) || track.muted || track.hidden || block.audioEnabled === false) return []
    return [{ id: block.id, name: asset.name, fileName: asset.fileName, ...(asset.libraryVideoId ? { libraryVideoId: asset.libraryVideoId } : {}), sourceFrames: asset.sourceFrames, startFrame: block.startFrame, sourceInFrame: block.mediaInFrame ?? 0, durationFrames: block.durationFrames, gain: block.gain ?? 1, muted: false }]
  }))
}
export async function runEditorV6Export(project: EditorV6Document, requestedOptions: EditorV6ExportOptions, deps: Dependencies): Promise<EditorV6ExportReport> {
  const options: EditorV6ExportOptions = { ...requestedOptions, mouthLoop: true }
  const requestedParts = planEditorV6Export(options, project.timeline.durationFrames)
  const speechInRange = hasLinkedSpeech(project, options.startFrame, options.endFrame)
  const planned = speechInRange ? splitEditorV6ExportParts(requestedParts, MOUTH_LOOP_BATCH_FRAMES) : requestedParts
  if (process.platform !== 'win32') throw Error('Este exportador BGRA está preparado para Windows.')
  const started = performance.now(), totalFrames = options.endFrame - options.startFrame
  const layeredVideo = planEditorV6VideoOverlays(project, options.startFrame, options.endFrame).length > 0
  const report: EditorV6ExportReport = { schemaVersion: 1, id: deps.id, projectId: project.id, options, fps: 30, totalFrames, state: 'preparing', fallback: false, attempts: [], encoderTests: [], audioClips: 0, videoInputs: new Set(planEditorV6VideoOverlays(project, options.startFrame, options.endFrame).map((clip) => clip.fileName)).size, proxies: 0, motionTransitionsRequired: 0, motionTransitionsPrepared: 0, phaseMilliseconds: { temporarySetup: 0, characterLoading: 0, motionPreparation: 0, encoderProbe: 0, rendering: 0, finalization: 0, publication: 0 }, startedAt: new Date().toISOString(), outputPath: deps.outputPath }
  const startRssBytes = process.memoryUsage().rss
  report.mainProcessMemory = { startRssBytes, peakRssBytes: startRssBytes, sampleIntervalMs: 500 }
  const saveReport = async () => {
    await mkdir(dirname(deps.reportPath), { recursive: true })
    const temporary = `${deps.reportPath}.${randomUUID()}.tmp`
    try { await writeFile(temporary, JSON.stringify(report, null, 2), { flag: 'wx' }); await rename(temporary, deps.reportPath) }
    finally { await unlink(temporary).catch(() => {}) }
  }
  let folder: string
  const temporarySetupStarted = performance.now()
  try {
    await mkdir(deps.tempRoot, { recursive: true })
    folder = await mkdtemp(join(deps.tempRoot, 'editor-v6-export-'))
  } catch (error) {
    addPhaseTime(report, 'temporarySetup', temporarySetupStarted)
    report.state = deps.signal.aborted ? 'cancelled' : 'failed'
    report.error = message(error)
    report.endedAt = new Date().toISOString(); report.milliseconds = performance.now() - started
    try { await saveReport() }
    catch (reportError) { throw new AggregateError([error, reportError], 'Falha ao preparar o export e salvar seu relatório.') }
    throw error
  }
  addPhaseTime(report, 'temporarySetup', temporarySetupStarted)
  const candidate = join(dirname(deps.outputPath), `.editor-v6-${deps.id}.mp4`)
  let published = false
  let characters: CustomizerCharacter[] = []
  const testEncoder = async (encoder: string) => {
    const probeStarted = performance.now()
    try {
      await runExportCommand(deps.ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30', '-frames:v', '1', ...encodingArgs(encoder, 1), '-an', '-f', 'null', '-'], deps.signal)
      report.encoderTests.push({ encoder }); return true
    } catch (error) { deps.signal.throwIfAborted(); report.encoderTests.push({ encoder, error: message(error) }); return false }
    finally { addPhaseTime(report, 'encoderProbe', probeStarted) }
  }
  const renderAttempt = async (parts: EditorV6ExportPart[], encoder: string, maxParallelism = 2): Promise<PartReport[]> => {
    const began = performance.now(), controller = new AbortController(), abort = () => controller.abort(deps.signal.reason)
    deps.signal.addEventListener('abort', abort, { once: true })
    if (deps.signal.aborted) abort()
    const parallelism = Math.max(1, Math.min(maxParallelism, parts.length))
    const attempt: AttemptReport = { parts: [], encoder, parallelism }
    report.attempts.push(attempt)
    let done = 0
    const mouthStats = { states: 0, characterIds: new Set<string>(), skipped: 0, skippedStale: 0, atlasBytes: 0, atlasPixels: 0, preparationMilliseconds: 0, details: new Set<string>() }
    report.mouthAnimation = undefined
    const publishMouthStats = () => {
      report.mouthAnimation = { stateAtlases: mouthStats.states, characters: mouthStats.characterIds.size, skippedStates: mouthStats.skipped, staleStates: mouthStats.skippedStale, cycleFrames: options.mouthLoopCycleFrames ?? 30, atlasBytes: mouthStats.atlasBytes, atlasPixels: mouthStats.atlasPixels, preparationMilliseconds: mouthStats.preparationMilliseconds, details: [...mouthStats.details].slice(0, 3) }
    }
    deps.progress({ state: 'rendering', frames: 0, motionProgress: undefined, message: parallelism === 2 ? 'Renderizando até dois trechos em paralelo…' : 'Renderizando um trecho por vez…', fallback: report.fallback })
    const renderPart = async (part: EditorV6ExportPart): Promise<PartReport> => {
      controller.signal.throwIfAborted()
      let renderProject = project
      let mouthLoops: EditorV6ExportMouthLoops | undefined
      try {
        if (speechInRange) {
          const mouth = await prepareExportMouthLoops(project, part.startFrame, part.endFrame, options.mouthLoopCycleFrames ?? 30, {
            signal: controller.signal, characters, bake: deps.bakeMotion,
            progress: (completed, total, name) => deps.progress({ state: 'preparing', frames: done, motionProgress: undefined, message: `Preparando boca · trecho ${part.index + 1}/${parts.length} · estado ${Math.min(completed + 1, total)}/${total} · ${name}…` })
          }, options.startFrame, parallelism as 1 | 2)
          renderProject = mouth.project
          mouthLoops = mouth.mouthLoops
          mouthStats.states += mouth.stats.states
          for (const id of mouth.mouthLoops.states.map((state) => state.characterId)) mouthStats.characterIds.add(id)
          mouthStats.skipped += mouth.stats.skipped
          mouthStats.skippedStale += mouth.stats.skippedStale
          mouthStats.atlasBytes += mouth.stats.atlasBytes
          mouthStats.atlasPixels += mouth.stats.atlasPixels
          mouthStats.preparationMilliseconds += mouth.stats.milliseconds
          for (const detail of mouth.stats.errors) mouthStats.details.add(detail)
          publishMouthStats()
        }
      } catch (error) {
        controller.abort(error)
        throw error
      }
      const beganPart = performance.now(), path = join(folder, `attempt-${report.attempts.length}-part-${part.index}.mp4`)
      const result: PartReport = { ...part, path, encoder, rendered: 0, reused: 0, frames: 0, milliseconds: 0 }
      const timingAccumulators = newTimingAccumulators()
      let worker: EditorV6FrameWorker | undefined
      let process: ReturnType<typeof spawnExportProcess> | undefined
      attempt.parts.push(result)
      try {
        const videoClips = planEditorV6VideoOverlays(project, part.startFrame, part.endFrame)
        const videoPaths = await Promise.all(videoClips.map((clip) => deps.mediaPath(project.id, clip.fileName, clip.libraryVideoId)))
        const videoInputs = videoClips.flatMap((clip, index) => ['-ss', String(clip.mediaInFrame / 30), '-t', String((clip.endFrame - clip.startFrame) / 30), '-i', videoPaths[index]])
        const filters = layeredVideo ? ['[0:v]crop=iw:ih/2:0:0,format=rgba,setsar=1[base]', '[0:v]crop=iw:ih/2:0:ih/2,format=rgba,setsar=1[fg]'] : ['[0:v]setsar=1[base]']
        let lastVideo = 'base'
        videoClips.forEach((clip, index) => {
          const offset = (clip.startFrame - part.startFrame) / 30, end = (clip.endFrame - part.startFrame) / 30
          const output = index === videoClips.length - 1 && !layeredVideo ? 'vout' : `mix${index}`
          const boxWidth = clip.layout.width * options.width / 100, boxHeight = clip.layout.height * options.height / 100
          const centerX = (50 + clip.layout.x) * options.width / 100, centerY = (50 + clip.layout.y) * options.height / 100
          const rotation = clip.layout.rotation * Math.PI / 180
          filters.push(`[${index + 1}:v:0]scale=${boxWidth}:${boxHeight}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,format=rgba,rotate=${rotation}:ow=rotw(iw):oh=roth(ih):c=none,setpts=PTS-STARTPTS+${offset}/TB[clip${index}]`)
          filters.push(`[${lastVideo}][clip${index}]overlay=x='${centerX}-overlay_w/2':y='${centerY}-overlay_h/2':enable='gte(t,${offset})*lt(t,${end})':eof_action=pass:repeatlast=0[${output}]`)
          lastVideo = output
        })
        if (layeredVideo) filters.push(`[${lastVideo}][fg]overlay=0:0:format=auto:eof_action=pass:repeatlast=1[vout]`)
        const filterArgs = layeredVideo || videoClips.length ? ['-filter_complex', filters.join(';'), '-map', '[vout]'] : ['-map', '0:v:0']
        const rawHeight = options.height * (layeredVideo ? 2 : 1)
        process = spawnExportProcess(deps.ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'bgra', '-video_size', `${options.width}x${rawHeight}`, '-framerate', '30', '-i', 'pipe:0', ...videoInputs, ...filterArgs, '-an', ...encodingArgs(encoder, Math.max(1, Math.min(8, Math.floor(availableParallelism() / parallelism)))), '-frames:v', String(part.endFrame - part.startFrame), path], controller.signal)
        const workerStarted = performance.now()
        worker = await deps.createWorker(renderProject, part, controller.signal, layeredVideo, mouthLoops)
        recordTiming(timingAccumulators, 'workerStartupMs', performance.now() - workerStarted)
        let bitmap: Buffer | undefined
        for (let frame = part.startFrame; frame < part.endFrame; frame++) {
          controller.signal.throwIfAborted()
          const frameStarted = performance.now()
          const rendered = await worker.frame(frame)
          recordTiming(timingAccumulators, 'frameRoundTripMs', performance.now() - frameStarted)
          for (const [phase, milliseconds] of Object.entries(rendered.timings ?? {}) as Array<[TimingPhase, number]>) recordTiming(timingAccumulators, phase, milliseconds)
          if (rendered.reused && bitmap) result.reused++
          else { if (!rendered.bitmap) throw Error('O renderizador não entregou o bitmap.'); bitmap = rendered.bitmap; result.rendered++ }
          const writeStarted = performance.now()
          await waitForExport(new Promise<void>((resolve, reject) => process!.child.stdin.write(bitmap!, (error) => error ? reject(error) : resolve())), controller.signal, 60000, 'enviar quadro ao FFmpeg')
          recordTiming(timingAccumulators, 'ffmpegWriteMs', performance.now() - writeStarted)
          result.frames++; done++
          deps.progress({ frames: done })
        }
        const finalizeStarted = performance.now()
        process.child.stdin.end()
        await waitForExport(process.done, controller.signal, 120000, 'finalizar parte')
        recordTiming(timingAccumulators, 'ffmpegFinalizeMs', performance.now() - finalizeStarted)
        result.probe = await probeExportMedia(deps.ffprobe, path, controller.signal)
        if (Number(result.probe.streams.find((stream) => stream.codec_type === 'video')?.nb_frames) !== part.endFrame - part.startFrame) throw Error('Uma parte não contém todos os quadros previstos.')
        result.milliseconds = performance.now() - beganPart
        result.frameTiming = summarizeTimings(timingAccumulators)
        return result
      } catch (error) { result.frameTiming = summarizeTimings(timingAccumulators); controller.abort(error); throw error }
      finally { worker?.close(); if (process?.child.exitCode === null) process.child.kill(); await process?.done.catch(() => {}) }
    }
    try {
      const results: PartReport[] = []
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
      addPhaseTime(report, 'rendering', began)
      deps.signal.removeEventListener('abort', abort)
    }
  }
  // Start only after synchronous setup succeeds, immediately before the try/finally
  // that owns the sampler. This guarantees every started timer is cleared.
  const memorySampler = setInterval(() => {
    const memory = report.mainProcessMemory
    if (memory) memory.peakRssBytes = Math.max(memory.peakRssBytes, process.memoryUsage().rss)
  }, 500)
  let exportFailure: unknown
  try {
    deps.signal.throwIfAborted()
    const characterLoadStarted = performance.now()
    try { characters = await deps.getCharacters() }
    finally { addPhaseTime(report, 'characterLoading', characterLoadStarted) }
    const motionPreparationStarted = performance.now()
    const cacheBefore = deps.getMotionCacheStats?.()
    const cacheInputSamples: NonNullable<EditorV6ExportReport['motionCache']>['inputSamples'] = []
    const prepared = await (async () => {
      try {
        return await prepareExportMotions(project, options.startFrame, options.endFrame, {
          signal: deps.signal, characters, concurrency: deps.motionPreparationConcurrency ?? 2, mouthLoop: { startFrame: options.startFrame, cycleFrames: options.mouthLoopCycleFrames ?? 30 }, bake: (request, signal) => {
            if (cacheInputSamples.length < 3 && !cacheInputSamples.some((sample) => sample.characterId === request.character.id)) {
              cacheInputSamples.push({ cacheKey: motionCacheKey(request),
                planKeyHash: createHash('sha256').update(request.plan.key).digest('hex'), characterId: request.character.id,
                characterFingerprint: createHash('sha256').update(JSON.stringify(request.character)).digest('hex') })
            }
            return deps.bakeMotion(request, signal)
          },
          progress: (completed, total, name) => {
            report.motionTransitionsRequired = total; report.motionTransitionsPrepared = completed
            deps.progress({ state: 'preparing', frames: 0, motionProgress: { completed, total }, message: completed === total ? 'Transições prontas.' : `Preparando transição ${completed + 1}/${total} · ${name}…` })
          }
        })
      } finally { addPhaseTime(report, 'motionPreparation', motionPreparationStarted) }
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
    for (const candidate of options.encoder === 'auto' ? ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libopenh264'] : ['libopenh264']) if (await testEncoder(candidate)) { encoder = candidate; break }
    if (!encoder) throw Error('Nenhum codificador H.264 pôde ser iniciado.')
    const finish = async (parts: PartReport[]) => {
      if (new Set(parts.map((part) => part.encoder)).size !== 1) throw Error('As partes usaram codificadores diferentes.')
      const signatures = parts.map((part) => {
        const video = part.probe?.streams.find((stream) => stream.codec_type === 'video')
        if (!video || video.codec_name !== 'h264') throw Error('Uma parte não contém vídeo H.264 válido.')
        return JSON.stringify([video.codec_name, video.profile, video.pix_fmt, video.width, video.height, video.r_frame_rate, video.time_base, video.extradata_hash])
      })
      if (new Set(signatures).size !== 1) throw Error('Os parâmetros das partes são incompatíveis para junção sem recodificação.')
      const audio = planEditorV6Audio([...(project.exportAudio ?? []), ...timelineMediaAudio(project)], options.startFrame, options.endFrame)
      deps.progress({ state: 'joining', message: audio.length ? 'Juntando o vídeo e preparando a mixagem de áudio…' : 'Juntando o vídeo final…', frames: totalFrames })
      const list = join(folder, 'parts.txt')
      await writeFile(list, parts.map((part) => `file '${basename(part.path)}'`).join('\n') + '\n')
      report.audioClips = audio.length
      const filters = audio.map((item, index) => `[${index + 1}:a:0]atrim=start=${item.sourceInFrame / 30}:duration=${item.durationFrames / 30},asetpts=N/SR/TB,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${item.clip.gain},adelay=${item.delayFrames * 1600}S:all=1[a${index}]`)
      if (audio.length) filters.push(`${audio.map((_item, index) => `[a${index}]`).join('')}amix=inputs=${audio.length}:normalize=0:duration=longest:dropout_transition=0,asetpts=N/SR/TB,apad=whole_dur=${totalFrames / 30},atrim=duration=${totalFrames / 30},asetpts=N/SR/TB[mix]`)
      const audioPaths = await Promise.all(audio.map((item) => deps.audioPath(item.clip)))
      await runExportCommand(deps.ffmpeg, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, ...audioPaths.flatMap((path) => ['-i', path]), ...(audio.length ? ['-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[mix]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : ['-map', '0:v:0', '-an']), '-c:v', 'copy', '-t', String(totalFrames / 30), '-movflags', '+faststart', candidate], deps.signal, folder)
      deps.progress({ state: 'validating', message: 'Conferindo quadros, duração e emendas do MP4…' })
      const seams = parts.slice(1).map((part) => part.startFrame - options.startFrame)
      const validateSeams = async () => {
        for (let offset = 0; offset < seams.length; offset += 2) {
          const checks = await Promise.allSettled(seams.slice(offset, offset + 2).map((seam) =>
            runExportCommand(deps.ffmpeg, ['-v', 'error', '-err_detect', 'explode', '-ss', String(Math.max(0, seam - 1) / 30), '-i', candidate, '-frames:v', '3', '-an', '-f', 'null', '-'], deps.signal)
          ))
          const failed = checks.find((check) => check.status === 'rejected')
          if (failed?.status === 'rejected') throw failed.reason
        }
      }
      const [validationResult, seamResult] = await Promise.allSettled([
        probeExportMedia(deps.ffprobe, candidate, deps.signal, true),
        validateSeams()
      ])
      if (validationResult.status === 'rejected') throw validationResult.reason
      if (seamResult.status === 'rejected') throw seamResult.reason
      const validation = validationResult.value
      report.validation = validation
      const video = validation.streams.find((stream) => stream.codec_type === 'video')
      if (!video || Number(video.nb_read_frames) !== totalFrames || video.width !== options.width || video.height !== options.height || video.r_frame_rate !== '30/1' || !Number.isFinite(Number(video.duration)) || Math.abs(Number(video.duration) - totalFrames / 30) > 1 / 30 + .001) throw Error('O arquivo final não passou na validação de quadros, resolução, FPS ou duração.')
      if (audio.length) {
        const sound = validation.streams.find((stream) => stream.codec_type === 'audio')
        if (!sound || !Number.isFinite(Number(sound.duration)) || Math.abs(Number(sound.duration) - totalFrames / 30) > .05) throw Error('O arquivo final perdeu ou truncou a trilha de áudio.')
      }
      return { ...validation, seams, decodedFramesNearEachSeam: seams.length ? 3 : 0 }
    }
    const finishMeasured = async (parts: PartReport[]) => {
      const finalizationStarted = performance.now()
      try { return await finish(parts) }
      finally { addPhaseTime(report, 'finalization', finalizationStarted) }
    }
    try {
      report.validation = await finishMeasured(await renderAttempt(planned, encoder, options.turbo ? 2 : 1))
    } catch (error) {
      deps.signal.throwIfAborted()
      const attempt = report.attempts.at(-1)
      if (attempt) attempt.error = message(error)
      if (!options.turbo || requestedParts.length < 2) throw error
      report.fallback = true
      deps.progress({ message: 'O Turbo falhou. Reiniciando com um renderizador e CPU…', fallback: true })
      if (encoder !== 'libopenh264' && !await testEncoder('libopenh264')) throw Error('O codificador seguro também não está disponível.')
      const safePart = [{ index: 0, startFrame: options.startFrame, endFrame: options.endFrame }]
      const safeParts = speechInRange ? splitEditorV6ExportParts(safePart, MOUTH_LOOP_BATCH_FRAMES) : safePart
      report.validation = await finishMeasured(await renderAttempt(safeParts, 'libopenh264', 1))
    }
    deps.signal.throwIfAborted()
    // The destination only changes after the candidate passes all validations.
    report.state = 'publishing'
    await saveReport()
    deps.signal.throwIfAborted()
    const publicationStarted = performance.now()
    let publication: Awaited<ReturnType<typeof publishEditorV6Output>>
    try { publication = await publishEditorV6Output(candidate, deps.outputPath, deps.id) }
    finally { addPhaseTime(report, 'publication', publicationStarted) }
    report.outputPath = publication.outputPath
    report.deliveryWarning = publication.warning
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
    clearInterval(memorySampler)
    const memory = report.mainProcessMemory
    if (memory) memory.peakRssBytes = Math.max(memory.peakRssBytes, process.memoryUsage().rss)
    const cleanupErrors: unknown[] = []
    if (!published) {
      report.endedAt = new Date().toISOString(); report.milliseconds = performance.now() - started
      try { await saveReport() } catch (error) { cleanupErrors.push(error) }
    }
    try { await unlink(candidate) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') cleanupErrors.push(error) }
    const absolute = resolve(folder)
    if (absolute.startsWith(resolve(deps.tempRoot) + sep) && basename(absolute).startsWith('editor-v6-export-')) {
      try { await rm(absolute, { recursive: true, force: true }) } catch (error) { cleanupErrors.push(error) }
    }
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
