/**
 * Only the current hair-preparation call owns these bounded promises.
 * Reusing the same Fabricator style and colorized PNG across different
 * poses of ONE export avoids repeated IPC and PNG encoding. No persistent
 * cache, renderer-global state or snapshot mutation.
 */
export function createEditorV6HairPreparationReuse(maxEntries = 64) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw Error('Limite de preparação inválido.')
  const styles = new Map<string, Promise<unknown>>()
  const textures = new Map<string, Promise<string>>()
  let styleLoads = 0, styleReuses = 0, textureBuilds = 0, textureReuses = 0
  const remember = <T>(map: Map<string, Promise<T>>, key: string, promise: Promise<T>) => {
    map.set(key, promise)
    // LRU-ish bounded retention: older resolved promises can be recomputed.
    if (map.size > maxEntries) map.delete(map.keys().next().value!)
    void promise.catch(() => {
      if (map.get(key) === promise) map.delete(key)
    })
    return promise
  }
  return {
    loadStyle<T>(slot: number, id: string, load: () => Promise<T>): Promise<T> {
      const key = JSON.stringify([slot, id])
      const existing = styles.get(key)
      if (existing) { styleReuses++; return existing as Promise<T> }
      styleLoads++
      return remember(styles, key, Promise.resolve().then(load)) as Promise<T>
    },
    prepareTexture(
      slot: number, id: string, side: string, part: string, colors: unknown,
      render: () => Promise<string>
    ): Promise<string> {
      const key = JSON.stringify([slot, id, side, part, colors])
      const existing = textures.get(key)
      if (existing) { textureReuses++; return existing }
      textureBuilds++
      return remember(textures, key, Promise.resolve().then(render))
    },
    stats() {
      return { styleLoads, styleReuses, textureBuilds, textureReuses }
    },
    clear() { styles.clear(); textures.clear() }
  }
}

/** Face identity scoped to a single prepared character/pose; includes mouth isolation. */
export function editorV6HairFaceSurfaceKey(appearanceKey: string, mode: 'idle' | 'blink' | 'talk' | 'talk-blink', withoutMouth: boolean): string {
  return JSON.stringify([appearanceKey, mode, withoutMouth])
}
