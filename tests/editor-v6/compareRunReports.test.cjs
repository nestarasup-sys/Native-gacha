'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { compare, summarize } = require('../../scripts/editor-v6/compare-run-reports.cjs')
const { analyzeEditorV6ExportReport } = require('../../scripts/editor-v6/analyze-export-performance.cjs')

function report(workers = 2) {
  return {
    projectId: 'project-fixture', state: 'completed', totalFrames: 6000, fps: 30, audioClips: 2,
    runtime: { buildSha: 'fixture-sha', workingTreeDirty: false },
    options: { startFrame: 0, endFrame: 6000, width: 1920, height: 1080, turbo: true, forceTurbo1080: true, singleWorker: false, encoder: 'cpu', mouthLoop: true, mouthLoopCycleFrames: 30, includeSpeechMouth: true, hairPoseReactionOnly: true, hairPosteriorOnly: true, hairAnimationPresetSlot: 2, hairAnimationPresetFingerprint: 'preset-fixture', nativeRenderer: false },
    milliseconds: workers === 2 ? 200000 : 120000,
    hairPreparation: { totalMilliseconds: 10000 },
    phaseMilliseconds: { rendering: workers === 2 ? 150000 : 70000 },
    attempts: [{ encoder: 'libopenh264', parallelism: workers, summary: {
      framesWritten: 6000, framesRendered: 1700, framesReused: 4300, rawBytesWritten: 89579520000,
      captureReadbacks: 2000, captureStaleReadbacks: 200, summedWorkerMilliseconds: { ffmpegWriteUncovered: 10000, faceComposition: 50, workerStartup: 30000 }
    }, parts: [{ frames: 3000, rendered: 850, reused: 2150, rawBytesPerFrame: 14929920, frameTiming: {} }, { frames: 3000, rendered: 850, reused: 2150, rawBytesPerFrame: 14929920, frameTiming: {} }] }],
    validation: { streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1', nb_read_packets: '6000', has_b_frames: 0 },
      { codec_type: 'audio', codec_name: 'aac', duration: '200' }
    ], format: { duration: '200' }, seams: [3000], decodedFramesNearEachSeam: 3 }, cleanup: { errors: [] }
  }
}

test('summarizes render, startup, capture, pipe, mouth and validation metrics from one report', () => {
  const value = summarize(report())
  assert.equal(value.knownTotalSeconds, 210)
  assert.equal(value.attempt.captureStaleReadbacks, 200)
  assert.equal(value.attempt.staleReadbackPercent, 10)
  assert.equal(value.attempt.framesDrawn, 1700)
  assert.equal(value.attempt.uncoveredPipeSeconds, 10)
  assert.equal(value.validation.reportedVideoFrames, null)
  assert.equal(value.validation.videoPacketCount, '6000')
  assert.equal(value.projectIdPresent, true)
  assert.equal(value.sourceRevision, 'fixture-sha')
  assert.equal(value.workingTreeDirty, false)
})

test('only allows a worker-count change when explicitly requested; still requires identical visual profile', () => {
  const base = report(2), faster = report(4)
  assert.equal(compare(base, faster).comparable, false)
  const result = compare(base, faster, { allowWorkerChange: true })
  assert.equal(result.comparable, true)
  assert.equal(result.timeDeltaSeconds, -80)
  assert.equal(result.validation.passed, true, JSON.stringify(result.validation))
  assert.deepEqual(result.sourceRevision, { reference: 'fixture-sha', candidate: 'fixture-sha' })
  assert.equal(JSON.stringify(result).includes('project-fixture'), false)
  faster.options.height = 720
  assert.equal(compare(base, faster, { allowWorkerChange: true }).comparable, false)
})

test('reports missing audio, frame count, seam and cleanup evidence as failed validation', () => {
  const bad = report(4)
  bad.validation.streams = [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1', nb_read_packets: '5999', has_b_frames: 0 }]
  bad.validation.seams = null
  bad.cleanup.errors = ['temporary file']
  const result = compare(report(), bad, { allowWorkerChange: true })
  assert.equal(result.validation.passed, false)
  assert.ok(result.validation.missingEvidence.includes('audio stream'))
  assert.ok(result.validation.missingEvidence.includes('verified frame count'))
  assert.ok(result.validation.missingEvidence.includes('seam checks'))
})

test('compares the isolated benchmark report directly and requires cleanup evidence', () => {
  const stressReport = (milliseconds) => ({
    passed: true, projectId: 'project-fixture', startFrame: 0, endFrame: 6000,
    width: 1920, height: 1080, fps: '30/1', turbo: true, nativeRenderer: false,
    audioClips: 1, requestedEncoder: 'cpu', hairPoseReactionOnly: true, hairPosteriorOnly: true,
    hairPresetSlot: 2, hairPresetFingerprint: 'preset-fixture', mouthLoopBatchFrames: 600, forceTurbo1080: true,
    singleWorker: false, mouthLoopCycleFrames: 30, includeSpeechMouth: true,
    runs: [{ totalFrames: 6000, fps: '30/1', width: 1920, height: 1080,
      selectedEncoder: 'libopenh264', mouthLoopDisabled: false, audioClips: 1,
      exportMilliseconds: milliseconds, hairPreparationWallMs: 1000,
      phaseMilliseconds: { motionPreparation: 12_000, rendering: milliseconds - 20_000 },
      captureRetryMilliseconds: 16, cleanupErrors: [],
      ffprobeValidation: { streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1', nb_frames: '6000', has_b_frames: 0 },
        { codec_type: 'audio', codec_name: 'aac', duration: '200' }
      ], format: { duration: '200' }, seams: Array.from({ length: 19 }, (_, i) => (i + 1) * 300), decodedFramesNearEachSeam: 3 },
      attemptDiagnostics: [{ encoder: 'libopenh264', parallelism: 2, milliseconds,
        summary: { plannedParts: 20, startedParts: 20, completedParts: 20, framesWritten: 6000,
          framesRendered: 1710, framesReused: 4290, captureReadbacks: 2100, captureStaleReadbacks: 400,
          summedWorkerMilliseconds: { ffmpegWriteUncovered: 2000, workerStartup: 3000 } },
        parts: Array.from({ length: 20 }, (_, i) => ({ index: i, milliseconds: 10000, rendered: 85, reused: 215, expectedFrames: 300,
          frameTiming: { captureMs: { totalMs: 6000 } }, frameMetrics: { captureStaleReadbacks: 20, captureReadbacks: 105 } }))
      }]
    }]
  })
  const result = compare(stressReport(200_000), stressReport(190_000))
  assert.equal(result.comparable, true)
  assert.equal(result.validation.passed, true, JSON.stringify(result.validation))
  assert.equal(result.timeDeltaSeconds, -10)
  assert.equal(result.candidate.attempt.framesDrawn, 1710)
  assert.deepEqual(result.reference.phasesSeconds, { motionPreparation: 12, rendering: 180 })
})

test('compares the 600-frame harness against the standard report only when chunk size is explicitly allowed', () => {
  const base = report()
  const stress = {
    passed: true, projectId: base.projectId, startFrame: 0, endFrame: 6000,
    width: 1920, height: 1080, fps: '30/1', turbo: true, nativeRenderer: false,
    requestedEncoder: 'cpu', audioClips: 2, hairPoseReactionOnly: true,
    hairPosteriorOnly: true, hairPresetSlot: 2, hairPresetFingerprint: 'preset-fixture', mouthLoopBatchFrames: 600,
    forceTurbo1080: true, singleWorker: false, mouthLoopCycleFrames: 30,
    includeSpeechMouth: true,
    runs: [{ totalFrames: 6000, fps: '30/1', width: 1920, height: 1080,
      options: { startFrame: 0, endFrame: 6000, width: 1920, height: 1080, turbo: true, forceTurbo1080: true,
        singleWorker: false, encoder: 'cpu', mouthLoop: true, mouthLoopCycleFrames: 30, includeSpeechMouth: true,
        hairPoseReactionOnly: true, hairPosteriorOnly: true, hairAnimationPresetSlot: 2 },
      selectedEncoder: 'libopenh264', mouthLoopDisabled: false, audioClips: 2,
      exportMilliseconds: 190_000, clickToValidatedWallMs: 200_000, hairPreparationWallMs: 10_000,
      captureRetryMilliseconds: 16, cleanupErrors: [],
      ffprobeValidation: { streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1', nb_frames: '6000', has_b_frames: 0 },
        { codec_type: 'audio', codec_name: 'aac', duration: '200' }
      ], format: { duration: '200' }, seams: Array.from({ length: 9 }, (_, i) => (i + 1) * 600), decodedFramesNearEachSeam: 3 },
      attemptDiagnostics: [{ encoder: 'libopenh264', parallelism: 2, milliseconds: 190_000,
        summary: { plannedParts: 10, startedParts: 10, completedParts: 10, framesWritten: 6000, framesRendered: 1710,
          framesReused: 4290, captureReadbacks: 2000, captureStaleReadbacks: 200 },
        parts: Array.from({ length: 10 }, (_, i) => ({ index: i, milliseconds: 10000, rendered: 171, reused: 429,
          expectedFrames: 600, frameTiming: {}, frameMetrics: {} }))
      }]
    }]
  }
  assert.equal(compare(base, stress).comparable, false)
  const sameTimerControl = structuredClone(stress)
  sameTimerControl.mouthLoopBatchFrames = 300
  sameTimerControl.runs[0].exportMilliseconds = 200_000
  sameTimerControl.runs[0].clickToValidatedWallMs = 210_000
  assert.equal(compare(sameTimerControl, stress).comparable, false)
  const result = compare(sameTimerControl, stress, { allowMouthBatchChange: true })
  assert.equal(result.comparable, true)
  assert.equal(result.validation.passed, true)
  assert.equal(result.timeDeltaSeconds, -10)
})

test('does not subtract a click-to-validation timer from an estimated pre-export total', () => {
  const reference = report()
  const candidate = report()
  candidate.clickToValidatedMilliseconds = 195_000
  const result = compare(reference, candidate)
  assert.equal(result.comparable, true)
  assert.equal(result.timingComparable, false)
  assert.equal(result.timeDeltaSeconds, null)
  assert.match(result.timeComparisonNote, /bases de tempo diferentes/i)
})

test('requires explicit permission in the comparison when motion bake concurrency differs', () => {
  const reference = report()
  const candidate = report()
  reference.exportTestSettings = { motionConcurrency: 2 }
  candidate.exportTestSettings = { motionConcurrency: 3 }
  assert.equal(compare(reference, candidate).comparable, false)
  assert.equal(compare(reference, candidate, { allowMotionConcurrencyChange: true }).comparable, true)
})

test('requires explicit permission when capture strategy differs', () => {
  const reference = report()
  const candidate = report()
  reference.exportTestSettings = { captureMode: 'capturePage' }
  candidate.exportTestSettings = { captureMode: 'paint-event' }
  assert.equal(compare(reference, candidate).comparable, false)
  assert.equal(compare(reference, candidate, { allowCaptureStrategyChange: true }).comparable, true)
})

test('analyzes the benchmark aggregate and keeps click wall time separate from worker sums', () => {
  const analyzed = analyzeEditorV6ExportReport({
    passed: true, projectId: 'project-fixture', sourceRevision: 'sha-fixture', workingTreeDirty: true, captureMode: 'capturePage',
    durationFrames: 600, fps: '30/1',
    runs: [{ totalFrames: 600, fps: '30/1', options: { encoder: 'cpu' },
      mainExportWallMs: 42_000, clickToValidatedWallMs: 50_000, hairPreparationWallMs: 8_000,
      phaseMilliseconds: { rendering: 30_000 }, motionPreparation: { milliseconds: 12_000 },
      processPeaks: [{ role: 'ffmpeg', peakWorkingSetBytes: 1024, peakCpuPercent: 450 }],
      attemptDiagnostics: [{ encoder: 'libopenh264', parts: [{ index: 0, frames: 600, milliseconds: 30_000,
        frameTiming: { frameRoundTripMs: { totalMs: 24_000 }, capturePageMs: { totalMs: 12_000 }, ffmpegWriteUncoveredMs: { totalMs: 3_000 } },
        frameMetrics: { captureReadbacks: 100, captureStaleReadbacks: 5 } }] }]
    }]
  })
  assert.equal(analyzed.totalWithHairMilliseconds, 50_000)
  assert.equal(analyzed.totalTimeBasis, 'click-to-validated')
  assert.equal(analyzed.mainProcessMilliseconds, 42_000)
  assert.equal(analyzed.workerTimingTotalsMilliseconds.frameRoundTripMs, 24_000)
  assert.equal(analyzed.metrics.captureReadbacks, 100)
  assert.equal(analyzed.sourceRevision, 'sha-fixture')
  assert.equal(analyzed.workingTreeDirty, true)
  assert.equal(analyzed.processPeaks[0].peakCpuPercent, 450)
  assert.equal(analyzed.captureMode, 'capturePage')
})
