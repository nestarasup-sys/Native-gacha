import type { EditorV6Element } from '../../../../../shared/editorV6'
import { editorV6ElementSize } from '../../../../../shared/editorV6SceneModel'

/** Map an endpoint's actual displayed rectangle onto its full face-mode crop. */
export function motionEndpointScale(element: EditorV6Element, crop: { width: number; height: number }): { x: number; y: number } {
  const size = editorV6ElementSize(element)
  return { x: size.width * 19.2 / Math.max(1, crop.width), y: size.height * 10.8 / Math.max(1, crop.height) }
}
