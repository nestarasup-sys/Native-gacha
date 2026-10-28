export type LegacySceneCatalogEntry = { id: string; title: string; color: string }

export function isLegacySceneCatalogId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function loadLegacySceneCatalog(storageKey: string): LegacySceneCatalogEntry[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((item): item is LegacySceneCatalogEntry => Boolean(item && typeof item === 'object'
      && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.color === 'string'))
  } catch { return [] }
}
