/**
 * The export compositor verifies the exact paint-token pixels in capturePage
 * before the frame is sent to FFmpeg. Waiting an additional requestAnimationFrame
 * after synchronous React commit is therefore not needed on the normal path.
 * The legacy handoff remains selectable for A/B testing and driver diagnosis.
 */
export function createEditorV6ExportPaintHandoff(
  legacyRaf = false,
  requestFrame: (callback: FrameRequestCallback) => number = callback => requestAnimationFrame(callback)
): () => Promise<void> {
  if (!legacyRaf) return () => Promise.resolve()
  return () => new Promise<void>(resolve => {
    requestFrame(() => resolve())
  })
}
