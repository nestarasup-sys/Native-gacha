import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'

const DEFAULT_CACHED_PROVIDER_READS = 192
const DEFAULT_CACHED_PROVIDER_BYTES = 48 * 1024 * 1024
const SESSION_READ_METHODS = new Set([
  'loadFabricatorSlot', 'loadFabricatorPose', 'loadHairStyle', 'loadWardrobeSet', 'loadFaceSet',
  'listFaceCatalog', 'loadFaceCatalogItem', 'listFaceComponentAssets', 'loadFaceComponentAsset',
  'listFaceExpressionPresets', 'loadFaceExpressionPreset'
])
export type EditorV6MotionProviderReadStats = { calls: number; hits: number; misses: number; evictions: number; milliseconds: number }

/** Adds a bounded promise cache for immutable character reads during motion baking. */
export function cacheEditorV6MotionAssetProvider(
  provider: CharacterRenderAssetProvider,
  sharedOnly = false,
  stats?: EditorV6MotionProviderReadStats,
  limits: { maxEntries?: number; maxBytes?: number; refreshOnHit?: boolean } = {}
): CharacterRenderAssetProvider {
  const maxEntries = limits.maxEntries ?? DEFAULT_CACHED_PROVIDER_READS
  const maxBytes = limits.maxBytes ?? DEFAULT_CACHED_PROVIDER_BYTES
  const cache = new Map<string, { promise: Promise<unknown>; bytes: number }>()
  let cachedBytes = 0
  const estimateBytes = (value: unknown) => {
    const pending: unknown[] = [value], visited = new WeakSet<object>()
    let bytes = 0
    while (pending.length && bytes <= maxBytes) {
      const item = pending.pop()
      if (typeof item === 'string') bytes += item.length * 2
      else if (item && typeof item === 'object') {
        if (visited.has(item)) continue
        visited.add(item)
        if (ArrayBuffer.isView(item)) bytes += item.byteLength
        else if (item instanceof ArrayBuffer) bytes += item.byteLength
        else for (const [key, child] of Object.entries(item)) { bytes += key.length * 2; pending.push(child) }
      } else bytes += 8
    }
    return bytes
  }
  const trim = () => {
    while (cache.size > maxEntries || cachedBytes > maxBytes) {
      const oldest = cache.entries().next().value as [string, { promise: Promise<unknown>; bytes: number }] | undefined
      if (!oldest) break
      const [key, entry] = oldest
      cache.delete(key)
      cachedBytes -= entry.bytes
      if (stats) stats.evictions++
    }
  }
  return new Proxy({} as CharacterRenderAssetProvider, { get: (_target, property) => (...args: unknown[]) => {
    // Expressions still repaint per frame, but their immutable source PNGs and transforms are reusable.
    if (sharedOnly && !SESSION_READ_METHODS.has(String(property))) {
      return (provider[property as keyof CharacterRenderAssetProvider] as (...args: unknown[]) => Promise<unknown>)(...args)
    }
    if (stats) stats.calls++
    const key = JSON.stringify([property, args])
    let entry = cache.get(key)
    if (entry) {
      if (stats) stats.hits++
      if (limits.refreshOnHit !== false) { cache.delete(key); cache.set(key, entry) }
    }
    else {
      if (stats) stats.misses++
      const started = performance.now()
      const pending = (provider[property as keyof CharacterRenderAssetProvider] as (...args: unknown[]) => Promise<unknown>)(...args)
      entry = { bytes: 0, promise: Promise.resolve(pending).then(value => {
        if (stats) stats.milliseconds += performance.now() - started
        const current = cache.get(key)
        const bytes = estimateBytes(value)
        if (current === entry && bytes <= maxBytes) {
          entry!.bytes = bytes
          cachedBytes += bytes
          trim()
        } else if (cache.get(key) === entry) cache.delete(key)
        return value
      }, error => {
        if (stats) stats.milliseconds += performance.now() - started
        if (cache.get(key) === entry) cache.delete(key)
        throw error
      }) }
      cache.set(key, entry)
      trim()
    }
    return entry.promise
  } })
}
