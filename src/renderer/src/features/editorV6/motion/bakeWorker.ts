import type { EditorV6MotionBridge } from '../../../../../shared/editorV6Motion'
import { bakeEditorV6Motion, createEditorV6BakeSession } from './bakeMotion'
export async function runEditorV6MotionWorker() {
  const bridge = (window as unknown as { editorV6MotionWorker: EditorV6MotionBridge }).editorV6MotionWorker
  let session: ReturnType<typeof createEditorV6BakeSession> | undefined
  let revision = '', uses = 0
  while (true) {
    let request
    try { request = await bridge.payload() } catch { return }
    if (!request) return
    try {
      const nextRevision = JSON.stringify([request.character, request.plan.from.characterSourceUpdatedAt, request.plan.to.characterSourceUpdatedAt, [request.plan.from.modelSourceRevision, request.plan.to.modelSourceRevision].sort(), [request.plan.from.poseSourceRevision, request.plan.to.poseSourceRevision].sort(), request.plan.from.faceRendererVersion, request.plan.to.faceRendererVersion])
      if (!session || nextRevision !== revision || uses >= 8) {
        session?.materials.clear()
        session = createEditorV6BakeSession(bridge.provider)
        revision = nextRevision; uses = 0
      }
      uses++
      const result = await bakeEditorV6Motion(request, bridge.provider, session)
      await bridge.complete(result)
    } catch (error) {
      session?.materials.clear(); session = undefined
      try { await bridge.complete(undefined, error instanceof Error ? error.message : String(error)) } catch { return }
    }
  }
}
