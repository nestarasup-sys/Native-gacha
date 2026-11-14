import type { SceneSurfaceProps } from './SceneSurface'
import { SceneSurface } from './SceneSurface'

/**
 * Both halves occupy a single, origin-clean offscreen Chromium frame.
 * The first half is the opaque background; the second has transparency and
 * only foreground elements. Their contiguous BGRA rows match FFmpeg's
 * existing crop=iw:ih/2 filters, without an intermediate layer copy.
 */
export function EditorV6StackedExportSurface(props: Omit<SceneSurfaceProps, 'renderLayer'>) {
  const width = props.outputWidth ?? 1920
  const height = props.outputHeight ?? 1080
  const slot = { width: `${width}px`, height: `${height}px`, overflow: 'hidden' as const }
  return <div style={{ width: `${width}px`, height: `${height * 2}px`, overflow: 'hidden' }}>
    <div style={slot}><SceneSurface {...props} renderLayer="background" /></div>
    <div style={slot}><SceneSurface {...props} renderLayer="foreground" /></div>
  </div>
}
