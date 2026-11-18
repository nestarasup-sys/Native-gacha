'use strict'

// Compare complete Editor V6 export reports without printing local paths or project metadata.
const fs = require('node:fs/promises')
const path = require('node:path')

const SAME_PROFILE_OPTIONS = [
  'startFrame', 'endFrame', 'width', 'height', 'turbo', 'encoder', 'mouthLoop',
  'forceTurbo1080', 'singleWorker', 'mouthLoopCycleFrames', 'includeSpeechMouth',
  'hairPoseReactionOnly', 'hairPosteriorOnly', 'hairAnimationPresetSlot',
  'hairAnimationLoopFrames', 'fps', 'nativeRenderer', 'testMode'
]
const sum = (items, select) => items.reduce((total, item) => total + (Number(select(item)) || 0), 0)
const round = value => Number.isFinite(value) ? Number(value.toFixed(3)) : null
const percentile = (values, fraction) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  return sorted.length ? round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]) : null
}

function normalizeReport(report) {
  if (!Array.isArray(report.runs)) return report
  const run = report.runs.at(-1)
  if (!run) return report
  return {
    projectId: report.projectId,
    state: report.passed ? 'completed' : 'failed',
    totalFrames: run.totalFrames ?? report.durationFrames,
    fps: Number.parseInt(String(run.fps ?? report.fps), 10),
    options: {
      startFrame: report.startFrame, endFrame: report.endFrame,
      width: run.width ?? report.width, height: run.height ?? report.height,
      turbo: report.turbo, encoder: run.selectedEncoder,
      mouthLoop: run.mouthLoopDisabled === false,
      hairPoseReactionOnly: run.hairPoseReactionOnly ?? report.hairPoseReactionOnly,
      hairPosteriorOnly: run.hairPosteriorOnly ?? report.hairPosteriorOnly,
      nativeRenderer: report.nativeRenderer,
      testMode: `capture-retry-${run.captureRetryMilliseconds ?? report.captureRetryMilliseconds}`
    },
    milliseconds: run.exportMilliseconds,
    clickToValidatedMilliseconds: run.clickToValidatedWallMs,
    hairPreparation: { totalMilliseconds: run.hairPreparationWallMs },
    audioClips: run.audioClips ?? report.audioClips ?? 0,
    mouthAnimation: run.mouthAnimation,
    attempts: (run.attemptDiagnostics ?? []).map(attempt => ({
      encoder: attempt.encoder, parallelism: attempt.parallelism,
      milliseconds: attempt.milliseconds, summary: attempt.summary, parts: attempt.parts
    })),
    validation: { ...run.ffprobeValidation, cleanupErrors: run.cleanupErrors }
  }
}

function summarize(report) {
  report = normalizeReport(report)
  const attempt = report.attempts?.[0]
  const attemptSummary = attempt?.summary ?? {}
  const parts = attempt?.parts ?? []
  const streams = report.validation?.streams ?? []
  const video = streams.find(stream => stream.codec_type === 'video')
  const audio = streams.find(stream => stream.codec_type === 'audio')
  const phases = report.phaseMilliseconds ?? {}
  const stale = attemptSummary.captureStaleReadbacks ?? sum(parts, part => part.frameMetrics?.captureStaleReadbacks)
  const readbacks = attemptSummary.captureReadbacks ?? sum(parts, part => part.frameMetrics?.captureReadbacks)
  const mainSeconds = Number.isFinite(report.milliseconds) ? report.milliseconds / 1000 : null
  const preparationSeconds = Number.isFinite(report.hairPreparation?.totalMilliseconds)
    ? report.hairPreparation.totalMilliseconds / 1000 : null
  return {
    state: report.state ?? 'missing', projectIdPresent: typeof report.projectId === 'string' && report.projectId.length > 0,
    frames: report.totalFrames ?? null, fps: report.fps ?? null,
    options: report.options ?? {}, mainSeconds: round(mainSeconds),
    preparationSeconds: round(preparationSeconds),
    knownTotalSeconds: Number.isFinite(report.clickToValidatedMilliseconds)
      ? round(report.clickToValidatedMilliseconds / 1000)
      : mainSeconds !== null && preparationSeconds !== null ? round(mainSeconds + preparationSeconds) : null,
    phasesSeconds: Object.fromEntries(Object.entries(phases).map(([key, value]) => [key, round(value / 1000)])),
    attempt: attempt ? {
      encoder: attempt.encoder ?? null, workers: attempt.parallelism ?? null,
      partCount: parts.length,
      framesDrawn: attemptSummary.framesRendered ?? sum(parts, part => part.rendered),
      framesReused: attemptSummary.framesReused ?? sum(parts, part => part.reused),
      rawBytesWritten: attemptSummary.rawBytesWritten ?? sum(parts, part => part.frames * (part.rawBytesPerFrame ?? 0)),
      captureReadbacks: readbacks, captureStaleReadbacks: stale,
      staleReadbackPercent: readbacks ? round(stale / readbacks * 100) : null,
      uncoveredPipeSeconds: round((attemptSummary.summedWorkerMilliseconds?.ffmpegWriteUncovered ?? sum(parts, part => part.frameTiming?.ffmpegWriteUncoveredMs?.totalMs)) / 1000),
      mouthPreparationSeconds: round((report.mouthAnimation?.preparationMilliseconds ?? 0) / 1000),
      faceCompositionSeconds: round((attemptSummary.summedWorkerMilliseconds?.faceComposition ?? sum(parts, part => part.frameTiming?.faceCompositionMs?.totalMs)) / 1000),
      workerStartupSeconds: round((attemptSummary.summedWorkerMilliseconds?.workerStartup ?? sum(parts, part => part.frameTiming?.workerStartupMs?.totalMs)) / 1000),
      partWallSeconds: {
        p50: percentile(parts.map(part => part.milliseconds / 1000), .5),
        p95: percentile(parts.map(part => part.milliseconds / 1000), .95),
        max: percentile(parts.map(part => part.milliseconds / 1000), 1)
      },
      seamChecks: report.validation?.decodedFramesNearEachSeam ?? null
    } : null,
    validation: {
      videoPresent: Boolean(video), codec: video?.codec_name ?? null,
      width: video?.width ?? null, height: video?.height ?? null,
      frameRate: video?.r_frame_rate ?? null,
      durationSeconds: round(Number(report.validation?.format?.duration)),
      reportedVideoFrames: video?.nb_read_frames ?? video?.nb_frames ?? null,
      videoPacketCount: video?.nb_read_packets ?? null,
      videoHasNoBFrames: Number(video?.has_b_frames) === 0,
      audioPresent: Boolean(audio), audioCodec: audio?.codec_name ?? null,
      audioDurationSeconds: round(Number(audio?.duration)),
      seams: report.validation?.seams ?? null,
      seamNeighborhoodFrames: report.validation?.decodedFramesNearEachSeam ?? null,
      cleanupErrors: report.validation?.cleanupErrors ?? report.cleanup?.errors ?? null
    }
  }
}

function compare(reference, candidate, { allowWorkerChange = false } = {}) {
  reference = normalizeReport(reference)
  candidate = normalizeReport(candidate)
  const before = summarize(reference), after = summarize(candidate)
  const mismatches = []
  if (!reference.projectId || !candidate.projectId) mismatches.push('projectIdMissing')
  else if (reference.projectId !== candidate.projectId) mismatches.push('projectId')
  if (before.frames !== after.frames) mismatches.push('totalFrames')
  if (before.fps !== after.fps) mismatches.push('fps')
  for (const key of SAME_PROFILE_OPTIONS) {
    if (before.options[key] !== after.options[key]) mismatches.push(`options.${key}`)
  }
  if (before.attempt?.encoder !== after.attempt?.encoder) mismatches.push('encoderActual')
  if (!allowWorkerChange && before.attempt?.workers !== after.attempt?.workers) mismatches.push('workerCount')
  const videoFrames = Number(validationFrameCount(after.validation, after.frames))
  const validation = after.validation
  const expectedDuration = after.frames !== null && after.fps > 0 ? after.frames / after.fps : null
  const expectedFrameRate = `${after.fps}/1`
  const seamCountMatches = Array.isArray(validation.seams)
    && validation.seams.length === Math.max(0, (after.attempt?.partCount ?? 0) - 1)
    && (validation.seamNeighborhoodFrames === 3 || validation.seamNeighborhoodFrames === 0 && validation.seams.length === 0)
  const durationMatches = expectedDuration !== null && validation.durationSeconds !== null
    && Math.abs(validation.durationSeconds - expectedDuration) <= 1 / after.fps + .001
  const audioDurationMatches = reference.audioClips <= 0 || expectedDuration !== null
    && validation.audioDurationSeconds !== null && Math.abs(validation.audioDurationSeconds - expectedDuration) <= .05
  const verified = after.state === 'completed' && validation.videoPresent
    && videoFrames === after.frames && validation.width === after.options.width
    && validation.height === after.options.height && validation.audioPresent === (reference.audioClips > 0)
    && validation.frameRate === expectedFrameRate && durationMatches && audioDurationMatches
    && seamCountMatches && Array.isArray(validation.cleanupErrors) && validation.cleanupErrors.length === 0
  return {
    comparable: mismatches.length === 0,
    mismatches,
    timeDeltaSeconds: before.knownTotalSeconds !== null && after.knownTotalSeconds !== null
      ? round(after.knownTotalSeconds - before.knownTotalSeconds) : null,
    timeChangePercent: before.knownTotalSeconds > 0 && after.knownTotalSeconds !== null
      ? round((after.knownTotalSeconds / before.knownTotalSeconds - 1) * 100) : null,
    validation: { passed: verified, missingEvidence: [
      ...(!validation.videoPresent ? ['video stream'] : []),
      ...(videoFrames !== after.frames ? ['verified frame count'] : []),
      ...(reference.audioClips > 0 && !validation.audioPresent ? ['audio stream'] : []),
      ...(!seamCountMatches ? ['seam checks'] : []),
      ...(!durationMatches ? ['video duration'] : []),
      ...(!audioDurationMatches ? ['audio duration'] : []),
      ...(!Array.isArray(validation.cleanupErrors) ? ['cleanup report'] : [])
    ] },
    visualParity: 'not measured by the export report; compare decoded MP4 samples separately',
    reference: before, candidate: after
  }
}

function validationFrameCount(validation, expectedFrames) {
  return validation.reportedVideoFrames ?? (validation.videoHasNoBFrames ? validation.videoPacketCount : expectedFrames === null ? null : NaN)
}

async function main(args = process.argv.slice(2)) {
  const referenceArg = args.find(value => value.startsWith('--reference='))?.slice('--reference='.length)
  const candidateArg = args.find(value => value.startsWith('--candidate='))?.slice('--candidate='.length)
  const allowWorkerChange = args.includes('--allow-worker-change')
  if (!referenceArg || !candidateArg || args.some(value => !value.startsWith('--reference=') && !value.startsWith('--candidate=') && value !== '--allow-worker-change')) {
    throw Error('Uso: node scripts/editor-v6/compare-run-reports.cjs --reference=<report.json> --candidate=<report.json> [--allow-worker-change]')
  }
  const [reference, candidate] = await Promise.all([
    fs.readFile(path.resolve(referenceArg), 'utf8').then(JSON.parse),
    fs.readFile(path.resolve(candidateArg), 'utf8').then(JSON.parse)
  ])
  const result = compare(reference, candidate, { allowWorkerChange })
  console.log(JSON.stringify(result, null, 2))
  if (!result.comparable || !result.validation.passed) process.exitCode = 2
  return result
}

if (require.main === module) main().catch(() => {
  console.error('Não foi possível comparar os relatórios. Verifique os arquivos informados.')
  process.exitCode = 1
})

module.exports = { summarize, compare, main }
