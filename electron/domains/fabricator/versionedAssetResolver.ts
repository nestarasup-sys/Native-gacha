/** Cache bounded by bytes for immutable assets belonging to a published source revision.
 * Key always includes namespace, identity and version. No cache when versions differ.
 * Values are copied across the cache boundary to avoid mutation.
 */
export type AssetNamespace = 'model' | 'wardrobe' | 'hair' | 'face' | 'expression' | 'pose' | 'animator'

export function assetCacheKey(namespace: AssetNamespace, identity: string, version: string): string {
  if (!identity || !version || /[\0\n\r]/.test(identity + version)) throw new Error('Chave ou versão do asset inválida.')
  return JSON.stringify([namespace, identity, version])
}

export class VersionedAssetResolver {
  private readonly cache = new Map<string, Uint8Array>()
  private readonly pending = new Map<string, Promise<Uint8Array>>()
  private size = 0

  private readonly maxBytes: number

  constructor(maxBytes = 32 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Limite inválido de cache.')
    this.maxBytes = maxBytes
  }

  get byteSize(): number { return this.size }
  get entries(): number { return this.cache.size }
  has(namespace: AssetNamespace, identity: string, version: string): boolean {
    return this.cache.has(assetCacheKey(namespace, identity, version))
  }

  invalidate(namespace: AssetNamespace, identity: string): void {
    const prefix = JSON.stringify([namespace, identity]).slice(0, -1) + ','
    for (const [key, data] of this.cache) if (key.startsWith(prefix)) {
      this.cache.delete(key)
      this.size -= data.byteLength
    }
  }

  clear(): void { this.cache.clear(); this.pending.clear(); this.size = 0 }

  async resolve(namespace: AssetNamespace, identity: string, version: string, read: () => Promise<Uint8Array>): Promise<Uint8Array> {
    const key = assetCacheKey(namespace, identity, version)
    const cached = this.cache.get(key)
    if (cached) {
      this.cache.delete(key)
      this.cache.set(key, cached)
      return Uint8Array.from(cached)
    }
    const existing = this.pending.get(key)
    if (existing) return Uint8Array.from(await existing)
    const task = (async () => {
      const loaded = Uint8Array.from(await read())
      if (loaded.byteLength <= this.maxBytes) {
        while (this.size + loaded.byteLength > this.maxBytes && this.cache.size) {
          const oldest = this.cache.keys().next().value!
          this.size -= this.cache.get(oldest)!.byteLength
          this.cache.delete(oldest)
        }
        this.cache.set(key, loaded)
        this.size += loaded.byteLength
      }
      return loaded
    })()
    this.pending.set(key, task)
    try { return Uint8Array.from(await task) }
    finally { if (this.pending.get(key) === task) this.pending.delete(key) }
  }
}
