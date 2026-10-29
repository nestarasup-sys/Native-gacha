/** Converts elapsed monotonic time into the 30 fps frame used by Editor V6 playback. */
export function editorV6PlaybackFrameAtTime(startFrame: number, startedAt: number, now: number, durationFrames: number): number {
  return Math.min(durationFrames, startFrame + Math.floor((now - startedAt) * 30 / 1000))
}
