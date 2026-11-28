import { editorV6OutputFrame } from '../../../src/shared/editorV6Export'
import { EDITOR_V6_TIMELINE_FPS } from '../../../src/shared/editorV6Timing'
import { availableParallelism } from 'node:os'
import { env as nodeEnv } from 'node:process'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { constants, createWriteStream } from 'node:fs'
import { copyFile, lstat, mkdir, realpath, writeFile } from 'node:fs/promises'
import { Writable } from 'node:stream'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import type {
  EditorV6ExportMouthLoops,
  EditorV6ExportOptions,
  EditorV6ExportPart,
  EditorV6ExportStatus,
  EditorV6FrameMetrics
} from '../../../src/shared/editorV6Export'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import { planEditorV6VideoOverlays } from '../../../src/shared/editorV6VideoComposition'
import type { EditorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import { prepareExportMouthLoops } from './prepareMouthLoops'
import { spawnExportProcess, waitForExport, type EditorV6ExportProcessDiagnosticSnapshot } from './exportProcess'
import { editorV6EncodingThreadCount, encodingArgs } from './exportEncoding'
import { probeExportMedia } from './exportMediaProbe'
import type { EditorV6FrameWorker } from './exportWorkers'
import { buildEditorV6VideoComposition } from './exportVideoComposition'
import { EDITOR_V6_EXPORT_QUALITY_SAMPLE_FRAMES } from './exportQualitySamples'
import {
  createEditorV6TimingAccumulators,
  recordEditorV6Timing,
  summarizeEditorV6Timings,
  type EditorV6FrameTimingReport
} from './exportMetrics'
import { renderAndWriteEditorV6Frames } from './exportFramePipeline'
import { NutRawVideoWriter } from './nutRawVideoWriter'
import { NutUniqueFrameInput } from './nutUniqueFrameInput'
import type { EditorV6ExportFinalizationPart } from './exportFinalization'
import { editorV6PipeRawCaptureFirstFrame, editorV6PipeRawCaptureFrameCount, editorV6PipeRawCaptureKind } from './pipeRawCaptureWindow'
import { formatEditorV6Error } from '../../../src/shared/editorV6Error'
import type { EditorV6FrameSequenceDiagnostics, EditorV6FrameWriteTimelineSample } from './exportFramePipeline'

type EditorV6PipeWriteFailureContext = {
  partIndex: number
  outputFrame: number
  bytes: number
  writeStartedOffsetMs: number
  failureOffsetMs: number
  millisecondsSincePreviousSuccessfulWrite: number | null
  writableLengthBefore: number
  writableNeedDrainBefore: boolean
  writableLengthAtFailure: number
  writableNeedDrainAtFailure: boolean
  error: { name: string; message: string; code?: string; syscall?: string }
  processAtFailure?: EditorV6ExportProcessDiagnosticSnapshot
  processAfterStop?: EditorV6ExportProcessDiagnosticSnapshot
}
type EditorV6PipeWriteSample = {
  partIndex: number
  outputFrame: number
  bytes: number
  writeStartedOffsetMs: number
  writeCompletedOffsetMs: number
  millisecondsSincePreviousSuccessfulWrite: number | null
  writableLengthBefore: number
  writableNeedDrainBefore: boolean
  writableLengthAfter: number
  writableNeedDrainAfter: boolean
}
type EditorV6PipeRawCapture = {
  kind: 'without-video' | 'with-video'
  rawPath: string
  metadataPath: string
  ffmpeg: string
  argsTemplate: string[]
  stream: ReturnType<typeof createWriteStream>
  framesCaptured: number
  bytesCaptured: number
  firstFrame: number
  frameCount: number
  rawBytesPerFrame: number
  width: number
  rawHeight: number
  fps: number
  partIndex: number
  partStartFrame: number
  partEndFrame: number
}

async function createEditorV6PipeRawCapture(
  directoryValue: string | undefined,
  part: EditorV6ExportPart,
  options: EditorV6ExportOptions,
  layeredVideo: boolean,
  rawHeight: number,
  fps: number,
  ffmpeg: string,
  ffmpegArgs: string[],
  outputPath: string,
  videoPaths: string[]
): Promise<EditorV6PipeRawCapture | undefined> {
  if (!directoryValue) return undefined
  if (process.env.GACHA_EDITOR_V6_PIPE_FAILURE_DIAGNOSTICS !== '1' || process.env.GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS !== '1')
    throw Error('A captura bruta do pipe exige os diagnósticos de falha e de fase ativos.')
  if (options.startFrame !== 0 || options.endFrame !== 1200 || fps !== 30)
    throw Error('A captura bruta do pipe exige o corte fixo [0,1200) a 30 FPS.')

  const allowedRoot = resolve(process.cwd(), 'out', 'editor-v6-stress', 'dumps')
  const directory = resolve(directoryValue)
  const relativeDirectory = relative(allowedRoot, directory)
  if (!relativeDirectory || relativeDirectory.startsWith('..') || isAbsolute(relativeDirectory))
    throw Error('A captura bruta só pode gravar em um subdiretório dedicado de out/editor-v6-stress/dumps.')
  const [rootInfo, directoryInfo, canonicalRoot, canonicalDirectory] = await Promise.all([
    lstat(allowedRoot),
    lstat(directory),
    realpath(allowedRoot),
    realpath(directory)
  ])
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || !directoryInfo.isDirectory() || directoryInfo.isSymbolicLink())
    throw Error('A raiz e o destino da captura bruta precisam ser diretórios físicos, sem links simbólicos.')
  const canonicalRelative = relative(canonicalRoot, canonicalDirectory)
  if (!canonicalRelative || canonicalRelative.startsWith('..') || isAbsolute(canonicalRelative))
    throw Error('O destino canônico da captura bruta saiu da raiz isolada permitida.')

  const kind = part.startFrame === 0 && !layeredVideo
    ? 'without-video'
    : part.startFrame === 600 && layeredVideo
      ? 'with-video'
      : undefined
  const requestedKind = editorV6PipeRawCaptureKind(nodeEnv.GACHA_EDITOR_V6_PIPE_RAW_CAPTURE_KIND)
  if (!kind || (requestedKind && requestedKind !== kind)) return undefined
  if (part.endFrame - part.startFrame !== 600)
    throw Error('Cada trecho de captura bruta precisa conter 600 quadros.')

  const frameCount = editorV6PipeRawCaptureFrameCount(nodeEnv.GACHA_EDITOR_V6_PIPE_RAW_CAPTURE_FRAME_COUNT)
  const firstFrame = editorV6PipeRawCaptureFirstFrame(
    kind,
    part.startFrame,
    part.endFrame,
    nodeEnv.GACHA_EDITOR_V6_PIPE_RAW_CAPTURE_OFFSET_FRAMES,
    frameCount
  )

  const rawPath = join(directory, `frames-${kind}.bgra`)
  const metadataPath = join(directory, `frames-${kind}.json`)
  const argsTemplate = [...ffmpegArgs]
  const rawInputIndex = argsTemplate.indexOf('pipe:0')
  const outputIndex = argsTemplate.indexOf(outputPath)
  const frameLimitIndex = argsTemplate.indexOf('-frames:v')
  if (rawInputIndex < 0 || outputIndex < 0 || frameLimitIndex < 0)
    throw Error('Não consegui derivar o comando de produção para a captura bruta.')
  argsTemplate[rawInputIndex] = rawPath
  argsTemplate[outputIndex] = '{{OUTPUT}}'
  argsTemplate[frameLimitIndex + 1] = String(frameCount)
  let mediaIndex = 0
  for (let index = 0; index < argsTemplate.length - 1; index++) {
    if (argsTemplate[index] !== '-i' || argsTemplate[index + 1] === rawPath) continue
    const source = videoPaths[mediaIndex]
    if (!source) throw Error('O comando contém uma entrada de vídeo que não corresponde ao plano da timeline.')
    const destination = join(directory, `video-input-${mediaIndex}${extname(source) || '.bin'}`)
    await copyFile(source, destination, constants.COPYFILE_EXCL)
    argsTemplate[index + 1] = destination
    mediaIndex++
  }
  if (mediaIndex !== videoPaths.length) throw Error('Nem todas as mídias de vídeo da parte foram copiadas para a captura bruta.')

  const stream = createWriteStream(rawPath, { flags: 'wx' })
  stream.on('error', () => {})
  return {
    kind,
    rawPath,
    metadataPath,
    ffmpeg,
    argsTemplate,
    stream,
    framesCaptured: 0,
    bytesCaptured: 0,
    firstFrame,
    frameCount,
    rawBytesPerFrame: options.width * rawHeight * 4,
    width: options.width,
    rawHeight,
    fps,
    partIndex: part.index,
    partStartFrame: part.startFrame,
    partEndFrame: part.endFrame
  }
}

async function finishEditorV6PipeRawCapture(capture: EditorV6PipeRawCapture | undefined): Promise<void> {
  if (!capture) return
  await new Promise<void>((resolveFinish, reject) => {
    capture.stream.once('error', reject)
    capture.stream.once('finish', resolveFinish)
    capture.stream.end()
  })
  await writeFile(capture.metadataPath, JSON.stringify({
    schemaVersion: 1,
    kind: capture.kind,
    rawPath: capture.rawPath,
    ffmpeg: capture.ffmpeg,
    argsTemplate: capture.argsTemplate,
    pixelFormat: 'bgra',
    width: capture.width,
    height: capture.rawHeight,
    fps: capture.fps,
    firstFrame: capture.firstFrame,
    expectedFrames: capture.frameCount,
    framesCaptured: capture.framesCaptured,
    bytesPerFrame: capture.rawBytesPerFrame,
    bytesCaptured: capture.bytesCaptured,
    partIndex: capture.partIndex,
    partStartFrame: capture.partStartFrame,
    partEndFrame: capture.partEndFrame
  }, null, 2), { flag: 'wx' })
  if (capture.framesCaptured !== capture.frameCount || capture.bytesCaptured !== capture.rawBytesPerFrame * capture.frameCount)
    throw Error(`Captura bruta incompleta (${capture.framesCaptured}/${capture.frameCount} quadros).`)
}

export type EditorV6ExportPartReport = EditorV6ExportPart &
  EditorV6ExportFinalizationPart & {
    rendered: number
    reused: number
    frames: number
    milliseconds: number
    startedAtOffsetMs: number
    finishedAtOffsetMs?: number
    mouthPreparationMs?: number
    mouthAtlases?: number
    mouthAtlasPixels?: number
    mouthBakeMs?: number
    mouthBakeQueueWaitMs?: number
    mouthBakeQueueWaitSamples?: number
    mouthBakeMaxQueueDepth?: number
    expectedFrames?: number
    firstOutputFrame?: number
    videoOverlayClips?: number
    rawBytesPerFrame?: number
    encoderThreads?: number
    filterThreads?: number
    ffmpegArgs?: string[]
    mediaPlanningMs?: number
    probeMs?: number
    /** Destination used by the opt-in producer ceiling benchmark. */
    pipeSink?: 'ffmpeg' | 'discard'
    /** Frame/byte accounting for NUT input; absent only in explicit CFR comparison mode. */
    nutUniqueInput?: {
      logicalFrames: number
      uniqueRunFrames: number
      repeatedFrames: number
      framePackets: number
      bitmapPayloadBytes: number
      nutBytesWritten: number
    }
    workerStartup?: EditorV6FrameWorker['startup']
    failedOutputFrame?: number
    pipeFailureContext?: EditorV6PipeWriteFailureContext
    pipeWriteDiagnostics?: {
      process: EditorV6ExportProcessDiagnosticSnapshot
      recentWrites: EditorV6PipeWriteSample[]
    }
    stage?:
      | 'mouthPreparation'
      | 'mediaPlanning'
      | 'encoderStart'
      | 'workerStartup'
      | 'streaming'
      | 'encoderDrain'
      | 'validation'
      | 'completed'
    error?: string
    frameTiming?: EditorV6FrameTimingReport
    frameMetrics?: EditorV6FrameMetrics
    frameSequenceDiagnostics?: EditorV6FrameSequenceDiagnostics
    frameWriteTimeline?: EditorV6FrameWriteTimelineSample[]
    /** Whether one ordinary offscreen frame may render during FFmpeg backpressure. */
    framePipelineOverlap?: boolean
    /** True only for the old mandatory requestAnimationFrame compositor handoff. */
    frameRafGate?: boolean
    /** Whether stationary hair composites can be reused during this export. */
    frameRestHairReuse?: boolean
    /** Layer capture strategy: one combined paint or two sequential paints. */
    frameLayerCapture?: 'single' | 'stacked' | 'serial'
  }

type PreparedMouthLoops = Awaited<ReturnType<typeof prepareExportMouthLoops>>

type Dependencies = {
  project: EditorV6Document
  part: EditorV6ExportPart
  attemptNumber: number
  attemptPartCount: number
  exportStartedAt: number
  encoder: string
  parallelism: number
  options: EditorV6ExportOptions
  layeredVideo: boolean
  speechInRange: boolean
  characters: CustomizerCharacter[]
  testSettings: EditorV6ExportTestSettings
  folder: string
  ffmpeg: string
  ffprobe: string
  qualityReferenceFolder?: string
  motionCacheScope: string
  signal: AbortSignal
  abort: (reason: unknown) => void
  completedFrames: () => number
  createWorker: (
    project: EditorV6Document,
    part: EditorV6ExportPart,
    signal: AbortSignal,
    layeredVideo: boolean,
    mouthLoops?: EditorV6ExportMouthLoops
  ) => Promise<EditorV6FrameWorker>
  bakeMotion: (request: EditorV6MotionBakeRequest, signal: AbortSignal) => Promise<EditorV6MotionBakeResult>
  mediaPath: (projectId: string, fileName: string, libraryVideoId?: string) => string | Promise<string>
  onFfmpegProcessStarted?: (pid: number) => void
  progress: (patch: Partial<EditorV6ExportStatus>) => void
  onMouthPrepared: (mouth: PreparedMouthLoops) => void
  onPartCreated: (part: EditorV6ExportPartReport) => void
  onFrameWritten: (count?: number) => void
}

/** Owns preparation, FFmpeg/worker lifetime, streaming, probing, and cleanup for one render part. */
export async function renderEditorV6ExportPart(dependencies: Dependencies): Promise<EditorV6ExportPartReport> {
  const {
    project,
    part,
    attemptNumber,
    attemptPartCount,
    exportStartedAt,
    encoder,
    parallelism,
    options,
    layeredVideo: exportHasVideo,
    speechInRange,
    characters,
    testSettings,
    folder,
    ffmpeg,
    ffprobe,
    motionCacheScope,
    qualityReferenceFolder,
    signal,
    abort,
    completedFrames,
    createWorker,
    bakeMotion,
    mediaPath,
    onFfmpegProcessStarted,
    progress,
    onMouthPrepared,
    onPartCreated,
    onFrameWritten
  } = dependencies

  signal.throwIfAborted()
  const fps = options.fps ?? EDITOR_V6_TIMELINE_FPS
  const firstOutputFrame = editorV6OutputFrame(part.startFrame, options.startFrame, fps)
  const outputFrames = editorV6OutputFrame(part.endFrame, options.startFrame, fps) - firstOutputFrame
  const path = join(folder, `attempt-${attemptNumber}-part-${part.index}.mp4`)
  const phase2Diagnostics = nodeEnv.GACHA_EDITOR_V6_PHASE2_DIAGNOSTICS === '1'
  const capturePipeFailureDiagnostics = nodeEnv.GACHA_EDITOR_V6_PIPE_FAILURE_DIAGNOSTICS === '1'
  const discardPipeOutput = nodeEnv.GACHA_EDITOR_V6_PRODUCER_ONLY === '1'
  const nutUniqueFrames = nodeEnv.GACHA_EDITOR_V6_NUT_UNIQUE_FRAMES !== '0'
  if (discardPipeOutput && nodeEnv.GACHA_VIDEO_STRESS_OFFSCREEN !== '1')
    throw Error('O descarte do pipe só pode ser habilitado pelo harness isolado do Editor V6.')
  if (nutUniqueFrames && discardPipeOutput)
    throw Error('O transporte NUT de quadros únicos não pode combinar com o sink de descarte.')
  if (nutUniqueFrames && nodeEnv.GACHA_EDITOR_V6_PIPE_RAW_CAPTURE_DIRECTORY)
    throw Error('A captura bruta do pipe não pode combinar com o transporte NUT de quadros únicos.')
  if (discardPipeOutput && (phase2Diagnostics || capturePipeFailureDiagnostics || nodeEnv.GACHA_EDITOR_V6_PIPE_RAW_CAPTURE_DIRECTORY))
    throw Error('O corte de teto do produtor não pode combinar descarte com diagnósticos do pipe ou captura bruta.')
  const framePipelineOverlap = nodeEnv.GACHA_EDITOR_V6_FRAME_OVERLAP !== '0'
  const automaticEncoderThreads = Math.max(1, Math.min(2, Math.floor(availableParallelism() / parallelism)))
  const filterThreads = 2
  const captureFfmpegArgs = nodeEnv.GACHA_VIDEO_STRESS_OFFSCREEN === '1' &&
    nodeEnv.GACHA_EDITOR_V6_STRESS_CAPTURE_FFMPEG_ARGS === '1'
  const encoderThreads =
    encoder === 'libx264' || encoder === 'libopenh264'
      ? editorV6EncodingThreadCount(automaticEncoderThreads)
      : undefined
  const partStarted = performance.now()
  const result: EditorV6ExportPartReport = {
    ...part,
    path,
    encoder,
    rendered: 0,
    reused: 0,
    frames: 0,
    milliseconds: 0,
    startedAtOffsetMs: partStarted - exportStartedAt,
    expectedFrames: outputFrames,
    firstOutputFrame,
    framePipelineOverlap,
    encoderThreads,
    filterThreads,
    pipeSink: discardPipeOutput ? 'discard' : 'ffmpeg',
    frameRafGate: nodeEnv.GACHA_EDITOR_V6_RAF_GATE === '1',
    frameRestHairReuse: Boolean(options.hairPoseReactionOnly) && nodeEnv.GACHA_EDITOR_V6_REUSE_REST_HAIR !== '0'
  }
  onPartCreated(result)
  let renderProject = project
  let mouthLoops: EditorV6ExportMouthLoops | undefined
  try {
    if (speechInRange && options.mouthLoop !== false) {
      result.stage = 'mouthPreparation'
      const mouth = await prepareExportMouthLoops(
        project,
        part.startFrame,
        part.endFrame,
        options.mouthLoopCycleFrames ?? EDITOR_V6_TIMELINE_FPS,
        {
          signal,
          characters,
          bake: (request, bakeSignal) => bakeMotion({ ...request, cacheScope: motionCacheScope }, bakeSignal),
          progress: (completed, total, name) =>
            progress({
              state: 'preparing',
              frames: completedFrames(),
              motionProgress: undefined,
              message: `Preparando boca · trecho ${part.index + 1}/${attemptPartCount} · estado ${Math.min(completed + 1, total)}/${total} · ${name}…`
            })
        },
        options.startFrame,
        Math.min(2, parallelism) as 1 | 2,
        testSettings.mouthConcurrency
      )
      renderProject = mouth.project
      mouthLoops = mouth.mouthLoops
      result.mouthPreparationMs = mouth.stats.milliseconds
      result.mouthAtlases = mouth.stats.states
      result.mouthAtlasPixels = mouth.stats.atlasPixels
      result.mouthBakeMs = mouth.stats.bakeMilliseconds
      result.mouthBakeQueueWaitMs = mouth.stats.serviceQueueWaitMilliseconds
      result.mouthBakeQueueWaitSamples = mouth.stats.serviceQueueWaitSamples
      result.mouthBakeMaxQueueDepth = mouth.stats.maxServiceQueueDepth
      onMouthPrepared(mouth)
    }
  } catch (error) {
    result.mouthPreparationMs ??= performance.now() - partStarted
    result.finishedAtOffsetMs = performance.now() - exportStartedAt
    result.error = formatEditorV6Error(error)
    abort(error)
    throw error
  }

  const sampleTimelineFrame = (index: number) => options.startFrame + Math.floor((index * EDITOR_V6_TIMELINE_FPS) / fps)
  const beganPart = performance.now()
  const timingAccumulators = phase2Diagnostics ? createEditorV6TimingAccumulators() : undefined
  const frameMetrics: EditorV6FrameMetrics | undefined = phase2Diagnostics ? {} : undefined
  const frameWriteTimeline = phase2Diagnostics ? [] as EditorV6FrameWriteTimelineSample[] : undefined
  let worker: EditorV6FrameWorker | undefined
  let process: ReturnType<typeof spawnExportProcess> | undefined
  let outputStream: Writable | undefined
  let nutUniqueInput: NutUniqueFrameInput | undefined
  let pipeFailureContext: EditorV6PipeWriteFailureContext | undefined
  const pipeWriteSamples = capturePipeFailureDiagnostics ? [] as EditorV6PipeWriteSample[] : undefined
  let previousWriteCompletedAt: number | undefined
  let pipeRawCapture: EditorV6PipeRawCapture | undefined
  let pipeRawCaptureFinished = false
  try {
    result.stage = 'mediaPlanning'
    const videoClips = exportHasVideo ? planEditorV6VideoOverlays(project, part.startFrame, part.endFrame) : []
    const layeredVideo = videoClips.length > 0
    result.videoOverlayClips = videoClips.length
    result.frameLayerCapture = layeredVideo ? 'serial' : 'single'
    const videoPaths = await Promise.all(
      videoClips.map((clip) => mediaPath(project.id, clip.fileName, clip.libraryVideoId))
    )
    const qualityFrames = qualityReferenceFolder
      ? EDITOR_V6_EXPORT_QUALITY_SAMPLE_FRAMES.map((frame) => editorV6OutputFrame(frame, options.startFrame, fps))
          .filter((index) => index >= firstOutputFrame && index < firstOutputFrame + outputFrames)
          .map((index) => index - firstOutputFrame)
      : []
    const absoluteQualityFrames = qualityFrames.map((frame) => sampleTimelineFrame(frame + firstOutputFrame))
    const qualityReferencePath = qualityFrames.length
      ? join(qualityReferenceFolder!, `part-${part.index}.bgra`)
      : undefined
    if (qualityReferencePath) await mkdir(qualityReferenceFolder!, { recursive: true })
    const videoComposition = buildEditorV6VideoComposition({
      clips: videoClips,
      mediaPaths: videoPaths,
      partStartFrame: options.startFrame + (firstOutputFrame * EDITOR_V6_TIMELINE_FPS) / fps,
      width: options.width,
      height: options.height,
      layeredVideo,
      ...(nutUniqueFrames ? { inputFrameRate: fps } : {}),
      ...(qualityReferencePath ? { qualityReference: { frames: qualityFrames, outputPath: qualityReferencePath } } : {})
    })
    result.mediaPlanningMs = performance.now() - beganPart
    result.stage = 'encoderStart'
    const ffmpegArgs = [
        '-v',
        'error',
        '-y',
        ...(filterThreads ? ['-filter_threads', String(filterThreads), '-filter_complex_threads', String(filterThreads)] : []),
        ...(nutUniqueFrames
          ? ['-f', 'nut', '-i', 'pipe:0']
          : [
              '-f', 'rawvideo',
              '-pixel_format', 'bgra',
              '-video_size', `${options.width}x${videoComposition.rawHeight}`,
              '-framerate', String(fps),
              '-i', 'pipe:0'
            ]),
        ...videoComposition.videoInputs,
        ...videoComposition.filterArgs,
        '-an',
        ...encodingArgs(encoder, automaticEncoderThreads),
        '-frames:v',
        String(outputFrames),
        path,
        ...(videoComposition.qualityOutputArgs ?? [])
      ]
    if (captureFfmpegArgs) result.ffmpegArgs = [...ffmpegArgs]
    pipeRawCapture = await createEditorV6PipeRawCapture(
      nodeEnv.GACHA_EDITOR_V6_PIPE_RAW_CAPTURE_DIRECTORY,
      part,
      options,
      layeredVideo,
      videoComposition.rawHeight,
      fps,
      ffmpeg,
      ffmpegArgs,
      path,
      videoPaths
    )
    if (discardPipeOutput) {
      outputStream = new Writable({ highWaterMark: 1, write: (_chunk, _encoding, callback) => callback() })
    } else {
      process = capturePipeFailureDiagnostics
        ? spawnExportProcess(ffmpeg, ffmpegArgs, signal, undefined, true)
        : spawnExportProcess(ffmpeg, ffmpegArgs, signal)
      outputStream = process.child.stdin
      if (process.child.pid) onFfmpegProcessStarted?.(process.child.pid)
    }
    if (nutUniqueFrames) {
      if (!process) throw Error('O transporte NUT exige um processo FFmpeg ativo.')
      const nutWriter = new NutRawVideoWriter({
        width: options.width,
        height: videoComposition.rawHeight,
        fps,
        writable: process.child.stdin,
        signal
      })
      const headerBytes = await nutWriter.writeHeader()
      nutUniqueInput = new NutUniqueFrameInput(nutWriter, headerBytes)
      result.nutUniqueInput = { ...nutUniqueInput.stats }
    }
    result.rawBytesPerFrame = options.width * videoComposition.rawHeight * 4
    result.stage = 'workerStartup'
    const workerStarted = performance.now()
    const frameWorker = await createWorker(renderProject, part, signal, layeredVideo, mouthLoops)
    worker = frameWorker
    result.workerStartup = frameWorker.startup
    if (timingAccumulators) recordEditorV6Timing(timingAccumulators, 'workerStartupMs', performance.now() - workerStarted)

    result.stage = 'streaming'
    await renderAndWriteEditorV6Frames({
      worker: { frame: (index) => frameWorker.frame(sampleTimelineFrame(index)) },
      part: { startFrame: firstOutputFrame, endFrame: firstOutputFrame + outputFrames },
      signal,
      counters: result,
      ...(timingAccumulators ? { timingAccumulators } : {}),
      ...(frameMetrics ? { frameMetrics } : {}),
      collectDiagnostics: phase2Diagnostics,
      // Ordinary captures own BGRA views; layered workers alternate two
      // buffers so FFmpeg never observes pixels from the subsequent frame.
      // Set GACHA_EDITOR_V6_FRAME_OVERLAP=0 for a comparable serial A/B run.
      overlapEncoding: framePipelineOverlap,
      ...(phase2Diagnostics
        ? {
            diagnosticLayerBytes: layeredVideo ? options.width * options.height * 4 : undefined,
            diagnosticExportStartedAt: exportStartedAt,
            onDiagnosticWrite: (sample: EditorV6FrameWriteTimelineSample) => frameWriteTimeline!.push(sample)
          }
        : {}),
      writeFrame: (bitmap, frame) => {
        if (nutUniqueInput) {
          const lastWriteAt = previousWriteCompletedAt
          const writeStartedAt = performance.now()
          const writableLengthBefore = process!.child.stdin.writableLength
          const writableNeedDrainBefore = process!.child.stdin.writableNeedDrain
          return nutUniqueInput.writeFrame(frame - firstOutputFrame, bitmap).then((write) => {
            const writeCompletedAt = performance.now()
            result.nutUniqueInput = { ...nutUniqueInput!.stats }
            if (write.bytesWritten > 0) previousWriteCompletedAt = writeCompletedAt
            if (pipeWriteSamples) {
              pipeWriteSamples.push({
                partIndex: part.index,
                outputFrame: frame,
                bytes: write.bytesWritten,
                writeStartedOffsetMs: writeStartedAt - exportStartedAt,
                writeCompletedOffsetMs: writeCompletedAt - exportStartedAt,
                millisecondsSincePreviousSuccessfulWrite: lastWriteAt === undefined ? null : writeCompletedAt - lastWriteAt,
                writableLengthBefore,
                writableNeedDrainBefore,
                writableLengthAfter: process!.child.stdin.writableLength,
                writableNeedDrainAfter: process!.child.stdin.writableNeedDrain
              })
              if (pipeWriteSamples.length > 64) pipeWriteSamples.shift()
            }
            return { bytesWritten: write.bytesWritten }
          }).catch((error: unknown) => {
            if (capturePipeFailureDiagnostics) {
              const failureAt = performance.now()
              const failure = error instanceof Error ? error : new Error(String(error))
              const failureCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
                ? error.code
                : undefined
              const failureSyscall = typeof error === 'object' && error !== null && 'syscall' in error && typeof error.syscall === 'string'
                ? error.syscall
                : undefined
              pipeFailureContext = {
                partIndex: part.index,
                outputFrame: frame,
                bytes: bitmap.byteLength,
                writeStartedOffsetMs: writeStartedAt - exportStartedAt,
                failureOffsetMs: failureAt - exportStartedAt,
                millisecondsSincePreviousSuccessfulWrite: lastWriteAt === undefined ? null : failureAt - lastWriteAt,
                writableLengthBefore,
                writableNeedDrainBefore,
                writableLengthAtFailure: process!.child.stdin.writableLength,
                writableNeedDrainAtFailure: process!.child.stdin.writableNeedDrain,
                error: {
                  name: failure.name,
                  message: failure.message,
                  ...(failureCode ? { code: failureCode } : {}),
                  ...(failureSyscall ? { syscall: failureSyscall } : {})
                },
                processAtFailure: process!.getDiagnosticSnapshot?.()
              }
            }
            throw error
          })
        }
        if (discardPipeOutput) {
          if (!outputStream) return Promise.reject(Error('O sink de descarte não foi inicializado.'))
          return waitForExport(new Promise<void>((resolve, reject) => {
            outputStream!.write(bitmap, (error) => error ? reject(error) : resolve())
          }), signal, 60000, 'descartar quadro do teto do produtor')
        }
        const writeWithDiagnostics = phase2Diagnostics || capturePipeFailureDiagnostics
        const rawCapture = pipeRawCapture
        const captureRawFrame = rawCapture && frame >= rawCapture.firstFrame && frame < rawCapture.firstFrame + rawCapture.frameCount
        if (captureRawFrame && rawCapture) {
          const lastWriteAt = previousWriteCompletedAt
          const writeStartedAt = performance.now()
          const writableLengthBefore = process!.child.stdin.writableLength
          const writableNeedDrainBefore = process!.child.stdin.writableNeedDrain
          return writeEditorV6FrameWithDiagnostics(rawCapture.stream, bitmap, signal)
            .then(() => {
              rawCapture.framesCaptured++
              rawCapture.bytesCaptured += bitmap.length
              return writeEditorV6FrameWithDiagnostics(process!.child.stdin, bitmap, signal, {
                partIndex: part.index,
                outputFrame: frame,
                exportStartedAt,
                lastWriteAt,
                getProcessSnapshot: process!.getDiagnosticSnapshot,
                onFailure: (context) => { pipeFailureContext = context }
              })
            })
            .then((writeResult) => {
              const writeCompletedAt = performance.now()
              if (pipeWriteSamples) {
                pipeWriteSamples.push({
                  partIndex: part.index,
                  outputFrame: frame,
                  bytes: bitmap.length,
                  writeStartedOffsetMs: writeStartedAt - exportStartedAt,
                  writeCompletedOffsetMs: writeCompletedAt - exportStartedAt,
                  millisecondsSincePreviousSuccessfulWrite: lastWriteAt === undefined ? null : writeCompletedAt - lastWriteAt,
                  writableLengthBefore,
                  writableNeedDrainBefore,
                  writableLengthAfter: process!.child.stdin.writableLength,
                  writableNeedDrainAfter: process!.child.stdin.writableNeedDrain
                })
                if (pipeWriteSamples.length > 64) pipeWriteSamples.shift()
              }
              previousWriteCompletedAt = writeCompletedAt
              return writeResult
            })
        }
        if (writeWithDiagnostics) {
          const lastWriteAt = previousWriteCompletedAt
          const writeStartedAt = performance.now()
          const writableLengthBefore = process!.child.stdin.writableLength
          const writableNeedDrainBefore = process!.child.stdin.writableNeedDrain
          return writeEditorV6FrameWithDiagnostics(process!.child.stdin, bitmap, signal, capturePipeFailureDiagnostics ? {
              partIndex: part.index,
              outputFrame: frame,
              exportStartedAt,
              lastWriteAt,
              getProcessSnapshot: process!.getDiagnosticSnapshot,
              onFailure: (context) => { pipeFailureContext = context }
            } : undefined).then((writeResult) => {
              const writeCompletedAt = performance.now()
              if (pipeWriteSamples) {
                pipeWriteSamples.push({
                  partIndex: part.index,
                  outputFrame: frame,
                  bytes: bitmap.length,
                  writeStartedOffsetMs: writeStartedAt - exportStartedAt,
                  writeCompletedOffsetMs: writeCompletedAt - exportStartedAt,
                  millisecondsSincePreviousSuccessfulWrite: lastWriteAt === undefined ? null : writeCompletedAt - lastWriteAt,
                  writableLengthBefore,
                  writableNeedDrainBefore,
                  writableLengthAfter: process!.child.stdin.writableLength,
                  writableNeedDrainAfter: process!.child.stdin.writableNeedDrain
                })
                if (pipeWriteSamples.length > 64) pipeWriteSamples.shift()
              }
              previousWriteCompletedAt = writeCompletedAt
              return writeResult
            })
        }
        return waitForExport(
          new Promise<void>((resolve, reject) =>
            process!.child.stdin.write(bitmap, (error) => {
              if (!error) {
                resolve()
                return
              }
              void process!.done.then(() => reject(error), reject)
            })
          ),
          signal,
          60000,
          'enviar quadro ao FFmpeg'
        )
      },
      onFrameWritten
    })

    result.stage = 'encoderDrain'
    const finalizeStarted = performance.now()
    await finishEditorV6PipeRawCapture(pipeRawCapture)
    pipeRawCaptureFinished = true
    if (discardPipeOutput) {
      if (!outputStream) throw Error('O sink de descarte não foi inicializado.')
      await new Promise<void>((resolve, reject) => outputStream!.end((error?: Error | null) => error ? reject(error) : resolve()))
    } else if (nutUniqueInput) {
      await nutUniqueInput.finish(outputFrames)
      result.nutUniqueInput = { ...nutUniqueInput.stats }
      await waitForExport(process!.done, signal, 120000, 'finalizar parte NUT')
    } else {
      process!.child.stdin.end()
      await waitForExport(process!.done, signal, 120000, 'finalizar parte')
    }
    if (qualityReferencePath)
      await writeFile(
        join(qualityReferenceFolder!, `part-${part.index}.json`),
        JSON.stringify({
          partIndex: part.index,
          startFrame: part.startFrame,
          exportStartFrame: options.startFrame,
          width: options.width,
          height: options.height,
          frames: absoluteQualityFrames,
          dataFile: `part-${part.index}.bgra`
        }),
        { flag: 'wx' }
      )
    if (timingAccumulators) recordEditorV6Timing(timingAccumulators, 'ffmpegFinalizeMs', performance.now() - finalizeStarted)
    if (!discardPipeOutput) {
      result.stage = 'validation'
      const probeStarted = performance.now()
      try {
        result.probe = await probeExportMedia(ffprobe, path, signal)
      } finally {
        result.probeMs = performance.now() - probeStarted
      }
      if (Number(result.probe.streams.find((stream) => stream.codec_type === 'video')?.nb_frames) !== outputFrames)
        throw Error('Uma parte não contém todos os quadros previstos.')
    }
    result.stage = 'completed'
    result.finishedAtOffsetMs = performance.now() - exportStartedAt
    if (timingAccumulators) result.frameTiming = summarizeEditorV6Timings(timingAccumulators)
    if (frameWriteTimeline) result.frameWriteTimeline = frameWriteTimeline
    if (frameMetrics && Object.keys(frameMetrics).length) result.frameMetrics = frameMetrics
    return result
  } catch (error) {
    if (result.stage === 'streaming' && result.frames < outputFrames)
      result.failedOutputFrame = firstOutputFrame + result.frames
    result.error = formatEditorV6Error(error)
    if (timingAccumulators) result.frameTiming = summarizeEditorV6Timings(timingAccumulators)
    if (frameWriteTimeline) result.frameWriteTimeline = frameWriteTimeline
    if (frameMetrics && Object.keys(frameMetrics).length) result.frameMetrics = frameMetrics
    if (pipeFailureContext) result.pipeFailureContext = pipeFailureContext
    abort(error)
    throw error
  } finally {
    result.milliseconds = performance.now() - beganPart
    result.finishedAtOffsetMs ??= performance.now() - exportStartedAt
    if (pipeRawCapture && !pipeRawCaptureFinished) {
      try {
        await finishEditorV6PipeRawCapture(pipeRawCapture)
        pipeRawCaptureFinished = true
      } catch { /* preserve the original export failure */ }
    }
    worker?.close()
    if (process?.child.exitCode === null) process.child.kill()
    await process?.done.catch(() => {})
    const processSnapshot = capturePipeFailureDiagnostics ? process?.getDiagnosticSnapshot?.() : undefined
    if (pipeFailureContext) {
      pipeFailureContext.processAfterStop = processSnapshot
      result.pipeFailureContext = pipeFailureContext
    }
    if (pipeWriteSamples && processSnapshot)
      result.pipeWriteDiagnostics = { process: processSnapshot, recentWrites: pipeWriteSamples }
  }
}

type FrameWriteFailureCapture = {
  partIndex: number
  outputFrame: number
  exportStartedAt: number
  lastWriteAt?: number
  getProcessSnapshot?: () => EditorV6ExportProcessDiagnosticSnapshot
  onFailure: (context: EditorV6PipeWriteFailureContext) => void
}

async function writeEditorV6FrameWithDiagnostics(
  stream: Writable,
  bitmap: Buffer,
  signal: AbortSignal,
  failureCapture?: FrameWriteFailureCapture
): Promise<{ backpressureMs: number; backpressureStartAt?: number; backpressureEndAt?: number }> {
  const writeStartedAt = performance.now()
  const writableLengthBefore = stream.writableLength
  const writableNeedDrainBefore = stream.writableNeedDrain
  let callbackComplete = false
  let drainComplete = true
  let backpressureStartedAt: number | undefined
  let backpressureEndedAt: number | undefined
  let drainAt: number | undefined
  let backpressureMs = 0

  const operation = new Promise<{ backpressureMs: number; backpressureStartAt?: number; backpressureEndAt?: number }>(
    (resolve, reject) => {
      const finish = () => {
        if (callbackComplete && drainComplete)
          resolve({
            backpressureMs,
            ...(backpressureStartedAt !== undefined ? { backpressureStartAt: backpressureStartedAt } : {}),
            ...(backpressureEndedAt !== undefined ? { backpressureEndAt: backpressureEndedAt } : {})
          })
      }
      const onDrain = () => {
        drainAt = performance.now()
        drainComplete = true
        if (backpressureStartedAt !== undefined) {
          backpressureEndedAt = drainAt
          backpressureMs = Math.max(0, drainAt - backpressureStartedAt)
        }
        finish()
      }
      const onWrite = (error?: Error | null) => {
        if (error) {
          stream.off('drain', onDrain)
          if (failureCapture) {
            const failedAt = performance.now()
            const errnoError = error as NodeJS.ErrnoException
            failureCapture.onFailure({
              partIndex: failureCapture.partIndex,
              outputFrame: failureCapture.outputFrame,
              bytes: bitmap.length,
              writeStartedOffsetMs: writeStartedAt - failureCapture.exportStartedAt,
              failureOffsetMs: failedAt - failureCapture.exportStartedAt,
              millisecondsSincePreviousSuccessfulWrite: failureCapture.lastWriteAt === undefined
                ? null
                : failedAt - failureCapture.lastWriteAt,
              writableLengthBefore,
              writableNeedDrainBefore,
              writableLengthAtFailure: stream.writableLength,
              writableNeedDrainAtFailure: stream.writableNeedDrain,
              error: {
                name: error.name,
                message: error.message,
                ...(typeof errnoError.code === 'string' ? { code: errnoError.code } : {}),
                ...(typeof errnoError.syscall === 'string' ? { syscall: errnoError.syscall } : {})
              },
              processAtFailure: failureCapture.getProcessSnapshot?.()
            })
          }
          reject(error)
          return
        }
        callbackComplete = true
        finish()
      }

      stream.once('drain', onDrain)
      const canContinue = stream.write(bitmap, onWrite)
      if (!canContinue) {
        drainComplete = false
        backpressureStartedAt = performance.now()
        if (drainAt !== undefined) {
          drainComplete = true
          backpressureEndedAt = drainAt
          backpressureMs = Math.max(0, drainAt - backpressureStartedAt)
        }
      } else {
        stream.off('drain', onDrain)
      }
    }
  )
  return waitForExport(operation, signal, 60000, 'enviar quadro ao FFmpeg')
}
