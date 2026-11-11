import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'

const MAX_CACHED_PROVIDER_READS = 32
const SESSION_READ_METHODS = new Set([
  'loadFabricatorSlot', 'loadFabricatorPose', 'loadHairStyle', 'loadWardrobeSet', 'loadFaceSet',
  'listFaceCatalog', 'loadFaceCatalogItem', 'listFaceComponentAssets', 'loadFaceComponentAsset',
  'listFaceExpressionPresets', 'loadFaceExpressionPreset'
])

/** Adds a bounded promise cache for immutable character reads during motion baking. */
export function cacheEditorV6MotionAssetProvider(provider: CharacterRenderAssetProvider, sharedOnly = false): CharacterRenderAssetProvider {
  const cache = new Map<string, Promise<unknown>>()
  return new Proxy({} as CharacterRenderAssetProvider, { get: (_target, property) => (...args: unknown[]) => {
    // Expressions still repaint per frame, but their immutable source PNGs and transforms are reusable.
    if (sharedOnly && !SESSION_READ_METHODS.has(String(property))) {
      return (provider[property as keyof CharacterRenderAssetProvider] as (...args: unknown[]) => Promise<unknown>)(...args)
    }
    const key = JSON.stringify([property, args])
    let result = cache.get(key)
    if (!result) {
      result = (provider[property as keyof CharacterRenderAssetProvider] as (...args: unknown[]) => Promise<unknown>)(...args)
      cache.set(key, result)
      void result.catch(() => { if (cache.get(key) === result) cache.delete(key) })
      while (cache.size > MAX_CACHED_PROVIDER_READS) cache.delete(cache.keys().next().value!)
    }
    return result
  } })
}
