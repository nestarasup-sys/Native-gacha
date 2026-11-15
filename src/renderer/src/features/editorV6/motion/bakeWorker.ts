import type { EditorV6MotionBridge } from '../../../../../shared/editorV6Motion'
import { bakeEditorV6Motion, createEditorV6BakeSession } from './bakeMotion'
export async function runEditorV6MotionWorker() {
  const bridge = (window as unknown as { editorV6MotionWorker: EditorV6MotionBridge }).editorV6MotionWorker
  let session: ReturnType<typeof createEditorV6BakeSession> | undefined
  let revision = '', uses = 0, cacheScope: string | undefined
  while (true) {
    let request
    try { request = await bridge.payload() } catch { return }
    if (!request) return
    try {
      const nextRevision = JSON.stringify([request.character, request.plan.from.characterSourceUpdatedAt, request.plan.to.characterSourceUpdatedAt, [request.plan.from.modelSourceRevision, request.plan.to.modelSourceRevision].sort(), [request.plan.from.poseSourceRevision, request.plan.to.poseSourceRevision].sort(), [request.plan.from.wardrobeSourceRevision, request.plan.to.wardrobeSourceRevision].sort(), [request.plan.from.hairSourceRevision, request.plan.to.hairSourceRevision].sort(), [request.plan.from.headExtraSourceRevision, request.plan.to.headExtraSourceRevision].sort(), [request.plan.from.eyeSourceRevision, request.plan.to.eyeSourceRevision].sort(), request.plan.from.faceRendererVersion, request.plan.to.faceRendererVersion])
      // The session already caps rig canvases, material entries and provider reads.
      // Avoid discarding hot sources after only eight requests from one character.
      if (!session || nextRevision !== revision || uses >= 32 || request.cacheScope !== cacheScope) {
        session?.dispose()
        session = createEditorV6BakeSession(bridge.provider, {
          // Diagnostic-only baseline recreates the previous 32-key worker
          // cache without retaining the face processing caches under test.
          providerCacheEntries: request.diagnosticDisableScopedPreparationReuse ? 32 : 192,
          providerCacheRefreshOnHit: !request.diagnosticDisableScopedPreparationReuse
        })
        revision = nextRevision; cacheScope = request.cacheScope; uses = 0
      }
      uses++
      const result = await bakeEditorV6Motion(request, bridge.provider, session)
      await bridge.complete(result)
    } catch (error) {
      session?.dispose(); session = undefined
      try { await bridge.complete(undefined, error instanceof Error ? error.message : String(error)) } catch { return }
    }
  }
}
