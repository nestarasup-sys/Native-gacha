/**
 * Canonical 60 fps Video Studio project clock. Deterministic for seek/play;
 * export uses integer frame indexes and never chases wall-clock playback.
 */
export const VIDEO_STUDIO_PROJECT_FPS = 60 as const

export function frameFromElapsed(
  anchorFrame: number, elapsedMs: number, durationFrames: number
): number {
  if (!Number.isSafeInteger(anchorFrame) || anchorFrame < 0
    || !Number.isSafeInteger(durationFrames) || durationFrames < 1
    || !Number.isFinite(elapsedMs)) throw new RangeError('Invalid Video Studio clock input')
  // Clamp elapsed first; avoid negative time or NaN producing a backwards seek.
  const elapsedFrames = Math.floor(Math.max(0, elapsedMs) * VIDEO_STUDIO_PROJECT_FPS / 1000)
  return Math.min(durationFrames, Math.max(0, anchorFrame + elapsedFrames))
}

export function framePresentationTime(frame: number): Readonly<{ numerator: number; denominator: 60 }> {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError('Invalid project frame')
  return { numerator: frame, denominator: VIDEO_STUDIO_PROJECT_FPS }
}
