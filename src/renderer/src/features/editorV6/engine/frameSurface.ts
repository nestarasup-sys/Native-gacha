import type { EditorV6Asset } from '../../../../../shared/editorV6'
import type { EditorV6ResolvedScene } from '../../../../../shared/editorV6TimelineScene'

export type EditorV6FrameSurfaceRequest = Readonly<{
  scene: EditorV6ResolvedScene
  assets: readonly EditorV6Asset[]
  width: number
  height: number
  renderLayer: 'all' | 'background' | 'foreground'
  rasterCanvases: ReadonlyMap<string, HTMLCanvasElement>
  paintToken: number
}>

export type EditorV6FrameSurfaceTimings = Readonly<{
  commitMs: number
  imageWaitMs: number
  presentationWaitMs: number
}>

/** Rendering adapter boundary: it presents one already-resolved frame but does not own timeline or export policy. */
export interface EditorV6FrameSurface {
  present(request: EditorV6FrameSurfaceRequest): Promise<EditorV6FrameSurfaceTimings>
  dispose(): void
}
