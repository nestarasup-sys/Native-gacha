import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6FaceRenderMode, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import type { FaceExpressionEffects } from '../../../../shared/fabricator'
import type { bakeFaceModeAssets, PreparedEditorV6FaceRenderer } from './faceModeAssets'

type RenderedSize = { width: number; height: number }
type Bake = Awaited<ReturnType<typeof bakeFaceModeAssets>>
type Prepared = { rendered: RenderedSize; baked: Bake }
// Two four-mode, high-resolution portraits must fit when alternating presets.
// Count encoded characters to bound memory independently of PNG dimensions.
const MAX_CHARACTERS = 12_000_000
const MAX_ENTRIES = 8

function freshAssets(baked: Bake): Bake {
  const renewed = new Map<string, string>()
  const extraAssets = baked.extraAssets.map(asset => {
    const id = crypto.randomUUID()
    renewed.set(asset.id, id)
    return { ...asset, id }
  })
  const assetIds = Object.fromEntries(Object.entries(baked.assetIds).map(([mode, id]) => [mode, renewed.get(id)]))
  return { ...baked, assetIds, extraAssets }
}

/** Reuses exact appearance pixels and bounds for the lifetime of a prepared editor rig. */
export function createEditorV6InteractiveFaceBakes() {
  const byRenderer = new WeakMap<PreparedEditorV6FaceRenderer, Map<string, { prepared: Prepared; size: number }>>()
  const key = (name: string, appearance: CustomizerFaceAppearance | undefined, transforms: EditorV6FaceTransforms | undefined, effects: FaceExpressionEffects | undefined, mode: EditorV6FaceRenderMode) =>
    JSON.stringify([name, appearance, transforms, effects, mode])

  return {
    previousCrop(renderer: PreparedEditorV6FaceRenderer, name: string, appearance: CustomizerFaceAppearance | undefined, transforms: EditorV6FaceTransforms | undefined, effects: FaceExpressionEffects | undefined, mode: EditorV6FaceRenderMode) {
      return byRenderer.get(renderer)?.get(key(name, appearance, transforms, effects, mode))?.prepared.baked.crop
    },
    async bake(renderer: PreparedEditorV6FaceRenderer, name: string, appearance: CustomizerFaceAppearance | undefined, transforms: EditorV6FaceTransforms | undefined, effects: FaceExpressionEffects | undefined, mode: EditorV6FaceRenderMode, bakeAssets: typeof bakeFaceModeAssets): Promise<Prepared> {
      let entries = byRenderer.get(renderer)
      if (!entries) { entries = new Map(); byRenderer.set(renderer, entries) }
      const signature = key(name, appearance, transforms, effects, mode)
      const cached = entries.get(signature)
      if (cached) {
        entries.delete(signature)
        entries.set(signature, cached)
        return { rendered: cached.prepared.rendered, baked: freshAssets(cached.prepared.baked) }
      }
      const frame = await renderer.renderToCanvas(appearance, transforms, effects, mode)
      const baked = await bakeAssets(name, renderer, appearance, transforms, effects, mode, frame)
      const prepared = { rendered: { width: frame.width, height: frame.height }, baked }
      const size = baked.extraAssets.reduce((total, asset) => total + asset.dataUrl.length, baked.dataUrl.length)
      if (size <= MAX_CHARACTERS) {
        entries.set(signature, { prepared, size })
        let total = [...entries.values()].reduce((sum, entry) => sum + entry.size, 0)
        while (entries.size > MAX_ENTRIES || total > MAX_CHARACTERS) {
          const oldest = entries.keys().next().value!
          total -= entries.get(oldest)!.size
          entries.delete(oldest)
        }
      }
      return prepared
    }
  }
}
