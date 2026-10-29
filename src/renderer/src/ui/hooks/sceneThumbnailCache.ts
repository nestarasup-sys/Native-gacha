/** Reuses a rendered scene thumbnail while its visual inputs stay unchanged. */
export class SceneThumbnailCache {
  private readonly referenceIds = new WeakMap<object, symbol>()
  private cached: { key: readonly unknown[]; dataUrl: string } | null = null

  private normalizeKey(key: readonly unknown[]): readonly unknown[] {
    return key.map((value) => {
      if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return value
      const reference = value as object
      let id = this.referenceIds.get(reference)
      if (!id) {
        id = Symbol('scene-thumbnail-input')
        this.referenceIds.set(reference, id)
      }
      return id
    })
  }

  async get(key: readonly unknown[], render: () => Promise<string>): Promise<string> {
    const normalizedKey = this.normalizeKey(key)
    const cached = this.cached
    if (cached && normalizedKey.length === cached.key.length
      && normalizedKey.every((value, index) => Object.is(value, cached.key[index]))) {
      return cached.dataUrl
    }

    const dataUrl = await render()
    this.cached = { key: normalizedKey, dataUrl }
    return dataUrl
  }
}
