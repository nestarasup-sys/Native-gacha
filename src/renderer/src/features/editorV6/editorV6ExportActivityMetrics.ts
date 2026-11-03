import type { EditorV6ExportStatus } from '../../../../shared/editorV6Export'

export type EditorV6ExportActivitySample = {
  jobId: string
  at: number
  frames: number
  state: EditorV6ExportStatus['state']
}

export type EditorV6ExportSpeedSample = { frames: number; milliseconds: number; framesPerSecond: number }

export type EditorV6ExportActivityMetrics = {
  progress: number
  elapsedMs: number
  framesPerSecond: number | null
  estimatedRemainingMs: number | null
  speedSamples: EditorV6ExportSpeedSample[]
}

const MAX_ACTIVITY_SAMPLES = 80
const SPEED_WINDOW_SAMPLES = 8

export function recordEditorV6ExportActivitySample(
  samples: readonly EditorV6ExportActivitySample[],
  status: EditorV6ExportStatus,
  at: number
): EditorV6ExportActivitySample[] {
  if (!Number.isFinite(at)) throw Error('O horário da amostra de exportação é inválido.')
  const current: EditorV6ExportActivitySample = { jobId: status.id, at, frames: status.frames, state: status.state }
  const sameJob = samples.filter((sample) => sample.jobId === status.id)
  const previous = sameJob.at(-1)
  if (previous && previous.frames === current.frames && previous.state === current.state) return [...sameJob]
  return [...sameJob, current].slice(-MAX_ACTIVITY_SAMPLES)
}

export function measureEditorV6ExportActivity(
  samples: readonly EditorV6ExportActivitySample[],
  status: EditorV6ExportStatus,
  now: number,
  startedAt?: number
): EditorV6ExportActivityMetrics {
  if (!Number.isFinite(now) || (startedAt !== undefined && !Number.isFinite(startedAt))) throw Error('O relógio da exportação é inválido.')
  const jobSamples = samples.filter((sample) => sample.jobId === status.id)
  const elapsedFrom = startedAt ?? jobSamples[0]?.at ?? now
  const elapsedMs = Math.max(0, now - elapsedFrom)
  const progress = status.state === 'completed'
    ? 100
    : Math.min(100, Math.max(0, status.totalFrames > 0 ? status.frames / status.totalFrames * 100 : 0))

  const speedSamples: EditorV6ExportSpeedSample[] = []
  for (let index = 1; index < jobSamples.length; index += 1) {
    const previous = jobSamples[index - 1]
    const current = jobSamples[index]
    const duration = current.at - previous.at
    const frames = current.frames - previous.frames
    if (previous.state !== 'rendering' || current.state !== 'rendering' || duration <= 0 || frames <= 0) continue
    speedSamples.push({ frames, milliseconds: duration, framesPerSecond: frames * 1000 / duration })
  }

  const recent = speedSamples.slice(-SPEED_WINDOW_SAMPLES)
  const measuredFrames = recent.reduce((total, sample) => total + sample.frames, 0)
  const measuredMilliseconds = recent.reduce((total, sample) => total + sample.milliseconds, 0)
  const framesPerSecond = measuredMilliseconds >= 900 ? measuredFrames * 1000 / measuredMilliseconds : null
  const estimatedRemainingMs = status.state === 'rendering' && framesPerSecond !== null
    ? Math.max(0, status.totalFrames - status.frames) / framesPerSecond * 1000
    : null

  return {
    progress,
    elapsedMs,
    framesPerSecond,
    estimatedRemainingMs,
    speedSamples: speedSamples.slice(-24)
  }
}
