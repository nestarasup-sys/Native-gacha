import type { EditorV6ExportPartReport } from './exportPartRenderer'

const round = (value: number) => Math.round(value * 100) / 100

/** Timings summed across workers may overlap one another and the attempt wall time. */
export function summarizeEditorV6ExportAttempt(parts: readonly EditorV6ExportPartReport[], plannedParts: number, wallMilliseconds: number) {
  const sum = (read: (part: EditorV6ExportPartReport) => number) =>
    parts.reduce((total, part) => total + read(part), 0)
  const timing = (name: keyof NonNullable<EditorV6ExportPartReport['frameTiming']>) =>
    round(sum(part => part.frameTiming?.[name]?.totalMs ?? 0))
  const framesWritten = sum(part => part.frames)
  return {
    wallMilliseconds: round(wallMilliseconds),
    effectiveFramesPerSecond: wallMilliseconds > 0 ? round(framesWritten * 1000 / wallMilliseconds) : null,
    plannedParts,
    startedParts: parts.length,
    completedParts: parts.filter(part => part.stage === 'completed').length,
    framesWritten,
    framesRendered: sum(part => part.rendered),
    framesReused: sum(part => part.reused),
    framesWithSingleLayer: sum(part => part.frameLayerCapture === 'single' ? part.frames : 0),
    framesWithTwoLayers: sum(part => part.frameLayerCapture === 'stacked' || part.frameLayerCapture === 'serial' ? part.frames : 0),
    rawBytesWritten: sum(part => part.frames * (part.rawBytesPerFrame ?? 0)),
    captureReadbacks: sum(part => part.frameMetrics?.captureReadbacks ?? 0),
    captureStaleReadbacks: sum(part => part.frameMetrics?.captureStaleReadbacks ?? 0),
    summedWorkerMilliseconds: {
      mouthPreparation: round(sum(part => part.mouthPreparationMs ?? 0)),
      faceComposition: timing('faceCompositionMs'),
      hairComposition: timing('hairCompositionMs'),
      assetPreparation: timing('assetPreparationMs'),
      workerStartup: timing('workerStartupMs'),
      mediaPlanning: round(sum(part => part.mediaPlanningMs ?? 0)),
      capture: timing('captureMs'),
      capturePageWithinCapture: timing('capturePageMs'),
      bitmapWithinCapture: timing('captureBitmapMs'),
      ffmpegWrite: timing('ffmpegWriteMs'),
      ffmpegDrain: timing('ffmpegFinalizeMs'),
      ffprobe: round(sum(part => part.probeMs ?? 0)),
      nativeRaster: timing('nativeRasterMs')
    }
  }
}
