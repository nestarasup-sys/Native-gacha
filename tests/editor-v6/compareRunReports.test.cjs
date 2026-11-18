'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { compare, summarize } = require('../../scripts/editor-v6/compare-run-reports.cjs')

function report(workers = 2) {
  return {
    projectId: 'project-fixture', state: 'completed', totalFrames: 6000, fps: 30, audioClips: 2,
    options: { startFrame: 0, endFrame: 6000, width: 1920, height: 1080, turbo: true, encoder: 'cpu', mouthLoop: true, mouthLoopCycleFrames: 30, includeSpeechMouth: true, hairPoseReactionOnly: true, hairPosteriorOnly: true, hairAnimationPresetSlot: 2 },
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
})

test('only allows a worker-count change when explicitly requested; still requires identical visual profile', () => {
  const base = report(2), faster = report(4)
  assert.equal(compare(base, faster).comparable, false)
  const result = compare(base, faster, { allowWorkerChange: true })
  assert.equal(result.comparable, true)
  assert.equal(result.timeDeltaSeconds, -80)
  assert.equal(result.validation.passed, true, JSON.stringify(result.validation))
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
    passed: true, projectId: 'authorized-project', startFrame: 0, endFrame: 6000,
    width: 1920, height: 1080, fps: '30/1', turbo: true, nativeRenderer: false,
    audioClips: 1,
    runs: [{ totalFrames: 6000, fps: '30/1', width: 1920, height: 1080,
      selectedEncoder: 'libopenh264', mouthLoopDisabled: false, audioClips: 1,
      exportMilliseconds: milliseconds, hairPreparationWallMs: 1000,
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
})
