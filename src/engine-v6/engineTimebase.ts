/**
 * Engine V6 — versioned output sampling for authored 30 fps timelines.
 * A frame is addressed by its absolute output index, not by a previous frame.
 * Pure arithmetic avoids drift, callback timing and worker-partition dependence.
 *
 * Invariant: output boundaries use the same ceil convention as
 * editorV6OutputFrame(...) from the legacy V6 export.
 */
export const ENGINE_V6_AUTHORED_FPS = 30 as const
export type EngineV6OutputFps = 24 | 30

export type EngineV6OutputRange = Readonly<{
  startFrame: number
  endFrame: number
  fps: EngineV6OutputFps
}>

export type EngineV6OutputSample = Readonly<{
  outputFrame: number
  timelineFrame: number
  authoredTime: Readonly<{ numerator: number; denominator: EngineV6OutputFps }>
  presentationTime: Readonly<{ numerator: number; denominator: EngineV6OutputFps }>
}>

function assertRange(range: EngineV6OutputRange): void {
  if (!range || (range.fps !== 24 && range.fps !== 30)
    || !Number.isSafeInteger(range.startFrame) || !Number.isSafeInteger(range.endFrame)
    || range.startFrame < 0 || range.endFrame <= range.startFrame || range.endFrame > 1_000_000) {
    throw Error('Intervalo de tempo inválido na Engine V6.')
  }
}

/** [startFrame, endFrame) -> [0, frameCount), with exact integer output cadence. */
export function engineV6OutputFrameCount(range: EngineV6OutputRange): number {
  assertRange(range)
  return Math.ceil((range.endFrame - range.startFrame) * range.fps / ENGINE_V6_AUTHORED_FPS)
}

/** Boundary in the output stream for a source-timeline boundary. */
export function engineV6OutputBoundary(range: EngineV6OutputRange, sourceFrame: number): number {
  assertRange(range)
  if (!Number.isSafeInteger(sourceFrame) || sourceFrame < range.startFrame || sourceFrame > range.endFrame) {
    throw Error('Limite de partição fora da timeline da Engine V6.')
  }
  return Math.ceil((sourceFrame - range.startFrame) * range.fps / ENGINE_V6_AUTHORED_FPS)
}

/** Deterministic seek with a rational timestamp; no accumulated deltaTime. */
export function engineV6OutputSampleAt(range: EngineV6OutputRange, outputFrame: number): EngineV6OutputSample {
  const count = engineV6OutputFrameCount(range)
  if (!Number.isSafeInteger(outputFrame) || outputFrame < 0 || outputFrame >= count) {
    throw Error('Quadro de saída fora dos limites da Engine V6.')
  }
  const numerator = range.startFrame * range.fps + outputFrame * ENGINE_V6_AUTHORED_FPS
  const timelineFrame = Math.floor(numerator / range.fps)
  if (timelineFrame >= range.endFrame) throw Error('Amostragem de saída excedeu a timeline de origem.')
  return {
    outputFrame,
    timelineFrame,
    authoredTime: { numerator, denominator: range.fps },
    presentationTime: { numerator: outputFrame, denominator: range.fps }
  }
}
