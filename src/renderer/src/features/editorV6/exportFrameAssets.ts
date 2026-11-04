/** A worker must not retain assets generated for individual frames.
 *
 * Durable project assets (and explicitly reusable transition atlases) belong
 * to the caller's map; facial replacements and animated-hair PNGs live only in
 * the returned frame map. In particular, do not populate `persistent` from
 * `frameAssets`: face composition already has its own bounded LRU cache.
 */
export function createEditorV6FrameAssetRegistry<T extends { id: string }>(
  persistent: ReadonlyMap<string, T>,
  frameAssets: readonly T[]
): { current: Map<string, T>; resolve: (id: string) => T | undefined } {
  const current = new Map(frameAssets.map((asset) => [asset.id, asset]))
  return { current, resolve: (id) => current.get(id) ?? persistent.get(id) }
}

/** Select only assets reachable from the rendered layer, preserving the original
 * background-then-element order, first use for duplicate IDs, and frame-local
 * replacements from the supplied resolver. Never mutate either asset registry.
 */
export function selectEditorV6RenderableAssets<T extends { id: string }>(
  scene: {
    background: { backgroundAssetId?: string | null }
    elements: readonly { assetId?: string | null; mouthPatch?: { assetId: string } }[]
  },
  layer: 'all' | 'background' | 'foreground',
  resolve: (id: string) => T | undefined
): T[] {
  const visible: T[] = []
  const selected = new Set<string>()
  const include = (id?: string | null) => {
    if (!id || selected.has(id)) return
    selected.add(id)
    const asset = resolve(id)
    if (asset) visible.push(asset)
  }
  if (layer !== 'foreground') include(scene.background.backgroundAssetId)
  if (layer !== 'background') for (const element of scene.elements) {
    include(element.assetId)
    include(element.mouthPatch?.assetId)
  }
  return visible
}
