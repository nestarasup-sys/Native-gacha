import { editorV6OutputFrame } from '../../../src/shared/editorV6Export'
import { availableParallelism } from 'node:os'
import { env as nodeEnv } from 'node:process'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import type { EditorV6Document } from '../../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../../src/shared/customizer'
import type { EditorV6ExportMouthLoops, EditorV6ExportOptions, EditorV6ExportPart, EditorV6ExportStatus, EditorV6FrameMetrics } from '../../../src/shared/editorV6Export'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult } from '../../../src/shared/editorV6Motion'
import { planEditorV6VideoOverlays } from '../../../src/shared/editorV6VideoComposition'
import type { EditorV6ExportTestSettings } from '../../../src/shared/editorV6ExportTestModes'
import { prepareExportMouthLoops } from './prepareMouthLoops'
import { spawnExportProcess, waitForExport } from './exportProcess'
import { editorV6EncodingThreadCount, encodingArgs } from './exportEncoding'
import { probeExportMedia } from './exportMediaProbe'
import type { EditorV6FrameWorker } from './exportWorkers'
import { buildEditorV6VideoComposition, EDITOR_V6_EXPORT_QUALITY_SAMPLE_FRAMES } from './exportVideoComposition'
import { createEditorV6TimingAccumulators, recordEditorV6Timing, summarizeEditorV6Timings, type EditorV6FrameTimingReport } from './exportMetrics'
import { renderAndWriteEditorV6Frames } from './exportFramePipeline'
import type { EditorV6ExportFinalizationPart } from './exportFinalization'
import { formatEditorV6Error } from '../../../src/shared/editorV6Error'

export type EditorV6ExportPartReport = EditorV6ExportPart & EditorV6ExportFinalizationPart & {
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
  mediaPlanningMs?: number
  probeMs?: number
  workerStartup?: EditorV6FrameWorker['startup']
  failedOutputFrame?: number
  stage?: 'mouthPreparation' | 'mediaPlanning' | 'encoderStart' | 'workerStartup' | 'streaming' | 'encoderDrain' | 'validation' | 'completed'
  error?: string
  frameTiming?: EditorV6FrameTimingReport
  frameMetrics?: EditorV6FrameMetrics
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
  createWorker: (project: EditorV6Document, part: EditorV6ExportPart, signal: AbortSignal, layeredVideo: boolean, mouthLoops?: EditorV6ExportMouthLoops) => Promise<EditorV6FrameWorker>
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
    project, part, attemptNumber, attemptPartCount, exportStartedAt, encoder, parallelism,
    options, layeredVideo: exportHasVideo, speechInRange, characters, testSettings, folder, ffmpeg, ffprobe,
    motionCacheScope, qualityReferenceFolder, signal, abort, completedFrames, createWorker, bakeMotion, mediaPath,
    onFfmpegProcessStarted, progress, onMouthPrepared, onPartCreated, onFrameWritten
  } = dependencies

  signal.throwIfAborted()
  const fps = options.fps ?? 30
  const firstOutputFrame = editorV6OutputFrame(part.startFrame, options.startFrame, fps)
  const outputFrames = editorV6OutputFrame(part.endFrame, options.startFrame, fps) - firstOutputFrame
  const path = join(folder, `attempt-${attemptNumber}-part-${part.index}.mp4`)
  const framePipelineOverlap = nodeEnv.GACHA_EDITOR_V6_FRAME_OVERLAP !== '0'
  const automaticEncoderThreads = Math.max(1, Math.min(8, Math.floor(availableParallelism() / parallelism)))
  const encoderThreads = encoder === 'libx264' || encoder === 'libopenh264'
    ? editorV6EncodingThreadCount(automaticEncoderThreads) : undefined
  const partStarted = performance.now()
  const result: EditorV6ExportPartReport = {
    ...part, path, encoder, rendered: 0, reused: 0, frames: 0, milliseconds: 0,
    startedAtOffsetMs: partStarted - exportStartedAt, expectedFrames: outputFrames, firstOutputFrame,
    framePipelineOverlap, encoderThreads, frameRafGate: nodeEnv.GACHA_EDITOR_V6_RAF_GATE === '1',
    frameRestHairReuse: Boolean(options.hairPoseReactionOnly) && nodeEnv.GACHA_EDITOR_V6_REUSE_REST_HAIR !== '0'
  }
  onPartCreated(result)
  let renderProject = project
  let mouthLoops: EditorV6ExportMouthLoops | undefined
  try {
    if (speechInRange && options.mouthLoop !== false) {
      result.stage = 'mouthPreparation'
      const mouth = await prepareExportMouthLoops(project, part.startFrame, part.endFrame, options.mouthLoopCycleFrames ?? 30, {
        signal,
        characters,
        bake: (request, bakeSignal) => bakeMotion({ ...request, cacheScope: motionCacheScope }, bakeSignal),
        progress: (completed, total, name) => progress({ state: 'preparing', frames: completedFrames(), motionProgress: undefined, message: `Preparando boca · trecho ${part.index + 1}/${attemptPartCount} · estado ${Math.min(completed + 1, total)}/${total} · ${name}…` })
      }, options.startFrame, Math.min(2, parallelism) as 1 | 2, testSettings.mouthConcurrency)
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

  const sampleTimelineFrame = (index: number) => options.startFrame + Math.floor(index * 30 / fps)
  const beganPart = performance.now()
  const timingAccumulators = createEditorV6TimingAccumulators()
  const frameMetrics: EditorV6FrameMetrics = {}
  let worker: EditorV6FrameWorker | undefined
  let process: ReturnType<typeof spawnExportProcess> | undefined
  try {
    result.stage = 'mediaPlanning'
    const videoClips = exportHasVideo ? planEditorV6VideoOverlays(project, part.startFrame, part.endFrame) : []
    const layeredVideo = videoClips.length > 0
    result.videoOverlayClips = videoClips.length
    result.frameLayerCapture = !layeredVideo ? 'single' : nodeEnv.GACHA_EDITOR_V6_LAYER_CAPTURE === 'serial' ? 'serial' : 'stacked'
    const videoPaths = await Promise.all(videoClips.map((clip) => mediaPath(project.id, clip.fileName, clip.libraryVideoId)))
    const qualityFrames = qualityReferenceFolder
      ? EDITOR_V6_EXPORT_QUALITY_SAMPLE_FRAMES.map(frame => editorV6OutputFrame(frame, options.startFrame, fps)).filter(index => index >= firstOutputFrame && index < firstOutputFrame + outputFrames).map(index => index - firstOutputFrame)
      : []
    const absoluteQualityFrames = qualityFrames.map(frame => sampleTimelineFrame(frame + firstOutputFrame))
    const qualityReferencePath = qualityFrames.length ? join(qualityReferenceFolder!, `part-${part.index}.bgra`) : undefined
    if (qualityReferencePath) await mkdir(qualityReferenceFolder!, { recursive: true })
    const videoComposition = buildEditorV6VideoComposition({
      clips: videoClips, mediaPaths: videoPaths, partStartFrame: options.startFrame + firstOutputFrame * 30 / fps, width: options.width, height: options.height, layeredVideo,
      ...(qualityReferencePath ? { qualityReference: { frames: qualityFrames, outputPath: qualityReferencePath } } : {})
    })
    result.mediaPlanningMs = performance.now() - beganPart
    result.stage = 'encoderStart'
    process = spawnExportProcess(ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'bgra', '-video_size', `${options.width}x${videoComposition.rawHeight}`, '-framerate', String(fps), '-i', 'pipe:0', ...videoComposition.videoInputs, ...videoComposition.filterArgs, '-an', ...encodingArgs(encoder, automaticEncoderThreads), '-frames:v', String(outputFrames), path, ...(videoComposition.qualityOutputArgs ?? [])], signal)
    if (process.child.pid) onFfmpegProcessStarted?.(process.child.pid)
    result.rawBytesPerFrame = options.width * videoComposition.rawHeight * 4
    result.stage = 'workerStartup'
    const workerStarted = performance.now()
    const frameWorker = await createWorker(renderProject, part, signal, layeredVideo, mouthLoops)
    worker = frameWorker
    result.workerStartup = frameWorker.startup
    recordEditorV6Timing(timingAccumulators, 'workerStartupMs', performance.now() - workerStarted)

    result.stage = 'streaming'
    await renderAndWriteEditorV6Frames({
      worker: { frame: (index) => frameWorker.frame(sampleTimelineFrame(index)) },
      part: { startFrame: firstOutputFrame, endFrame: firstOutputFrame + outputFrames },
      signal,
      counters: result,
      timingAccumulators,
      frameMetrics,
      // Ordinary captures own BGRA views; layered workers alternate two
      // buffers so FFmpeg never observes pixels from the subsequent frame.
      // Set GACHA_EDITOR_V6_FRAME_OVERLAP=0 for a comparable serial A/B run.
      overlapEncoding: framePipelineOverlap,
      writeFrame: (bitmap) => waitForExport(
        new Promise<void>((resolve, reject) => process!.child.stdin.write(bitmap, (error) => {
          if (!error) { resolve(); return }
          void process!.done.then(() => reject(error), reject)
        })),
        signal,
        60000,
        'enviar quadro ao FFmpeg'
      ),
      onFrameWritten
    })

    result.stage = 'encoderDrain'
    const finalizeStarted = performance.now()
    process.child.stdin.end()
    await waitForExport(process.done, signal, 120000, 'finalizar parte')
    if (qualityReferencePath) await writeFile(join(qualityReferenceFolder!, `part-${part.index}.json`), JSON.stringify({
      partIndex: part.index, startFrame: part.startFrame, exportStartFrame: options.startFrame, width: options.width, height: options.height,
      frames: absoluteQualityFrames, dataFile: `part-${part.index}.bgra`
    }), { flag: 'wx' })
    recordEditorV6Timing(timingAccumulators, 'ffmpegFinalizeMs', performance.now() - finalizeStarted)
    result.stage = 'validation'
    const probeStarted = performance.now()
    try { result.probe = await probeExportMedia(ffprobe, path, signal) }
    finally { result.probeMs = performance.now() - probeStarted }
    if (Number(result.probe.streams.find((stream) => stream.codec_type === 'video')?.nb_frames) !== outputFrames) throw Error('Uma parte não contém todos os quadros previstos.')
    result.stage = 'completed'
    result.finishedAtOffsetMs = performance.now() - exportStartedAt
    result.frameTiming = summarizeEditorV6Timings(timingAccumulators)
    if (Object.keys(frameMetrics).length) result.frameMetrics = frameMetrics
    return result
  } catch (error) {
    if (result.stage === 'streaming' && result.frames < outputFrames) result.failedOutputFrame = firstOutputFrame + result.frames
    result.error = formatEditorV6Error(error)
    result.frameTiming = summarizeEditorV6Timings(timingAccumulators)
    if (Object.keys(frameMetrics).length) result.frameMetrics = frameMetrics
    abort(error)
    throw error
  } finally {
    result.milliseconds = performance.now() - beganPart
    result.finishedAtOffsetMs ??= performance.now() - exportStartedAt
    worker?.close()
    if (process?.child.exitCode === null) process.child.kill()
    await process?.done.catch(() => {})
  }
}
