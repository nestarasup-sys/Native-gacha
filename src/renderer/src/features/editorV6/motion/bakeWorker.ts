import type { EditorV6MotionBridge } from '../../../../../shared/editorV6Motion'
import { bakeEditorV6Motion } from './bakeMotion'
export async function runEditorV6MotionWorker() {
  const bridge = (window as unknown as { editorV6MotionWorker: EditorV6MotionBridge }).editorV6MotionWorker
  try { const request = await bridge.payload(); const result = await bakeEditorV6Motion(request, bridge.provider); void bridge.complete(result).catch(() => {}) }
  catch (error) { void bridge.complete(undefined, error instanceof Error ? error.message : String(error)).catch(() => {}) }
}
