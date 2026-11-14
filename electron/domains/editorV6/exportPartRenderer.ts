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
import { encodingArgs } from './exportEncoding'
import { probeExportMedia } from './exportMediaProbe'
import type { EditorV6FrameWorker } from './exportWorkers'
import { buildEditorV6VideoComposition, EDITOR_V6_EXPORT_QUALITY_SAMPLE_FRAMES } from './exportVideoComposition'
import { createEditorV6TimingAccumulators, recordEditorV6Timing, summarizeEditorV6Timings, type EditorV6FrameTimingReport } from './exportMetrics'
import { renderAndWriteEditorV6Frames } from './exportFramePipeline'
import type { EditorV6ExportFinalizationPart } from './exportFinalization'

export type EditorV6ExportPartReport = EditorV6ExportPart & EditorV6ExportFinalizationPart & {
  rendered: number
  reused: number
  frames: number
  milliseconds: number
  startedAtOffsetMs: number
  finishedAtOffsetMs?: number
  frameTiming?: EditorV6FrameTimingReport
  frameMetrics?: EditorV6FrameMetrics
  /** Whether one ordinary offscreen frame may render during FFmpeg backpressure. */
  framePipelineOverlap?: boolean
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
  onFrameWritten: () => void
}

/** Owns preparation, FFmpeg/worker lifetime, streaming, probing, and cleanup for one render part. */
export async function renderEditorV6ExportPart(dependencies: Dependencies): Promise<EditorV6ExportPartReport> {
  const {
    project, part, attemptNumber, attemptPartCount, exportStartedAt, encoder, parallelism,
    options, layeredVideo, speechInRange, characters, testSettings, folder, ffmpeg, ffprobe,
    motionCacheScope, qualityReferenceFolder, signal, abort, completedFrames, createWorker, bakeMotion, mediaPath,
    onFfmpegProcessStarted, progress, onMouthPrepared, onPartCreated, onFrameWritten
  } = dependencies

  signal.throwIfAborted()
  let renderProject = project
  let mouthLoops: EditorV6ExportMouthLoops | undefined
  try {
    if (speechInRange && options.mouthLoop !== false) {
      const mouth = await prepareExportMouthLoops(project, part.startFrame, part.endFrame, options.mouthLoopCycleFrames ?? 30, {
        signal,
        characters,
        bake: (request, bakeSignal) => bakeMotion({ ...request, cacheScope: motionCacheScope }, bakeSignal),
        progress: (completed, total, name) => progress({ state: 'preparing', frames: completedFrames(), motionProgress: undefined, message: `Preparando boca · trecho ${part.index + 1}/${attemptPartCount} · estado ${Math.min(completed + 1, total)}/${total} · ${name}…` })
      }, options.startFrame, Math.min(2, parallelism) as 1 | 2, testSettings.mouthConcurrency)
      renderProject = mouth.project
      mouthLoops = mouth.mouthLoops
      onMouthPrepared(mouth)
    }
  } catch (error) {
    abort(error)
    throw error
  }

  const beganPart = performance.now()
  const path = join(folder, `attempt-${attemptNumber}-part-${part.index}.mp4`)
  const framePipelineOverlap = !layeredVideo && nodeEnv.GACHA_EDITOR_V6_FRAME_OVERLAP !== '0'
  // All part jobs use this process's monotonic clock, so offsets expose actual overlap.
  const result: EditorV6ExportPartReport = { ...part, path, encoder, rendered: 0, reused: 0, frames: 0, milliseconds: 0, startedAtOffsetMs: beganPart - exportStartedAt, framePipelineOverlap }
  const timingAccumulators = createEditorV6TimingAccumulators()
  const frameMetrics: EditorV6FrameMetrics = {}
  let worker: EditorV6FrameWorker | undefined
  let process: ReturnType<typeof spawnExportProcess> | undefined
  onPartCreated(result)

  try {
    const videoClips = planEditorV6VideoOverlays(project, part.startFrame, part.endFrame)
    const videoPaths = await Promise.all(videoClips.map((clip) => mediaPath(project.id, clip.fileName, clip.libraryVideoId)))
    const qualityFrames = qualityReferenceFolder
      ? EDITOR_V6_EXPORT_QUALITY_SAMPLE_FRAMES.filter(frame => frame >= part.startFrame && frame < part.endFrame).map(frame => frame - part.startFrame)
      : []
    const absoluteQualityFrames = qualityFrames.map(frame => frame + part.startFrame)
    const qualityReferencePath = qualityFrames.length ? join(qualityReferenceFolder!, `part-${part.index}.bgra`) : undefined
    if (qualityReferencePath) await mkdir(qualityReferenceFolder!, { recursive: true })
    const videoComposition = buildEditorV6VideoComposition({
      clips: videoClips, mediaPaths: videoPaths, partStartFrame: part.startFrame, width: options.width, height: options.height, layeredVideo,
      ...(qualityReferencePath ? { qualityReference: { frames: qualityFrames, outputPath: qualityReferencePath } } : {})
    })
    process = spawnExportProcess(ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'bgra', '-video_size', `${options.width}x${videoComposition.rawHeight}`, '-framerate', '30', '-i', 'pipe:0', ...videoComposition.videoInputs, ...videoComposition.filterArgs, '-an', ...encodingArgs(encoder, Math.max(1, Math.min(8, Math.floor(availableParallelism() / parallelism)))), '-frames:v', String(part.endFrame - part.startFrame), path, ...(videoComposition.qualityOutputArgs ?? [])], signal)
    if (process.child.pid) onFfmpegProcessStarted?.(process.child.pid)
    const workerStarted = performance.now()
    worker = await createWorker(renderProject, part, signal, layeredVideo, mouthLoops)
    recordEditorV6Timing(timingAccumulators, 'workerStartupMs', performance.now() - workerStarted)

    await renderAndWriteEditorV6Frames({
      worker,
      part,
      signal,
      counters: result,
      timingAccumulators,
      frameMetrics,
      // CapturePage/toBitmap owns its BGRA buffer; layered exports reuse one.
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

    const finalizeStarted = performance.now()
    process.child.stdin.end()
    await waitForExport(process.done, signal, 120000, 'finalizar parte')
    if (qualityReferencePath) await writeFile(join(qualityReferenceFolder!, `part-${part.index}.json`), JSON.stringify({
      partIndex: part.index, startFrame: part.startFrame, exportStartFrame: options.startFrame, width: options.width, height: options.height,
      frames: absoluteQualityFrames, dataFile: `part-${part.index}.bgra`
    }), { flag: 'wx' })
    recordEditorV6Timing(timingAccumulators, 'ffmpegFinalizeMs', performance.now() - finalizeStarted)
    result.probe = await probeExportMedia(ffprobe, path, signal)
    if (Number(result.probe.streams.find((stream) => stream.codec_type === 'video')?.nb_frames) !== part.endFrame - part.startFrame) throw Error('Uma parte não contém todos os quadros previstos.')
    result.milliseconds = performance.now() - beganPart
    result.finishedAtOffsetMs = performance.now() - exportStartedAt
    result.frameTiming = summarizeEditorV6Timings(timingAccumulators)
    if (Object.keys(frameMetrics).length) result.frameMetrics = frameMetrics
    return result
  } catch (error) {
    result.frameTiming = summarizeEditorV6Timings(timingAccumulators)
    if (Object.keys(frameMetrics).length) result.frameMetrics = frameMetrics
    abort(error)
    throw error
  } finally {
    result.finishedAtOffsetMs ??= performance.now() - exportStartedAt
    worker?.close()
    if (process?.child.exitCode === null) process.child.kill()
    await process?.done.catch(() => {})
  }
}
