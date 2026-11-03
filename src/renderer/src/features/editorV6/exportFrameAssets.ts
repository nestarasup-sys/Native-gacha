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
