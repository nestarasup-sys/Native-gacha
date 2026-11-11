import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'
import type { prepareSavedCharacterRenderer, GachaReusableMaterialCache } from '../../../characters/editorV6CharacterRenderer'
import { cacheEditorV6MotionAssetProvider } from './motionAssetProviderCache'

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>

/** Reuses immutable renderer rigs within a single hidden Electron bake lane. */
export type EditorV6BakeSession = {
  provider: CharacterRenderAssetProvider
  materials: GachaReusableMaterialCache
  endpointRenderers: Map<string, Renderer>
  /** Bounded history distinguishes a genuinely new rig from a rig evicted earlier. */
  hasSeenPose(key: string): boolean
  rememberPose(key: string): void
  trim(): void
  dispose(): void
}

export function createEditorV6BakeSession(provider: CharacterRenderAssetProvider): EditorV6BakeSession {
  const endpointRenderers = new Map<string, Renderer>()
  const poseHistory = new Set<string>()
  const materials: GachaReusableMaterialCache = new Map()
  return {
    provider: cacheEditorV6MotionAssetProvider(provider, true),
    materials,
    endpointRenderers,
    hasSeenPose(key) { return poseHistory.has(key) },
    rememberPose(key) {
      if (poseHistory.has(key)) poseHistory.delete(key)
      poseHistory.add(key)
      while (poseHistory.size > 48) poseHistory.delete(poseHistory.values().next().value!)
    },
    trim() {
      // Seven Canvas RGBA surfaces per rig is a conservative worker-local estimate.
      const estimatedBytes = () => [...endpointRenderers.values()].reduce(
        (total, renderer) => total + renderer.width * renderer.height * 4 * 7, 0
      )
      while (endpointRenderers.size > 12 || (endpointRenderers.size > 1 && estimatedBytes() > 96 * 1024 * 1024)) {
        const oldest = endpointRenderers.keys().next().value!
        const renderer = endpointRenderers.get(oldest)!
        endpointRenderers.delete(oldest)
        renderer.dispose()
      }
    },
    dispose() {
      for (const renderer of endpointRenderers.values()) renderer.dispose()
      endpointRenderers.clear()
      poseHistory.clear()
      materials.clear()
    }
  }
}
