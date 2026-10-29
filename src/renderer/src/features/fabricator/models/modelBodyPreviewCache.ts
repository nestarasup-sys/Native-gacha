import type { ModelPart } from '../../../../../shared/fabricator.ts'

const DEFAULT_MAX_ENTRIES = 80
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024

type AppearancePreview = (part: ModelPart, tone?: string, outlineColor?: string) => Promise<string | null>

type PreviewEntry = {
  source: string
  tone?: string
  outlineColor?: string
  contoursKey: string
  result: Promise<string | null>
  estimatedBytes: number
}

/** Bounds retained Fabricator previews by entry count and conservative string size. */
export function createModelBodyPreviewCache(
  createPreview: AppearancePreview,
  limits: { maxEntries?: number; maxBytes?: number } = {}
) {
  const maxEntries = Math.max(0, limits.maxEntries ?? DEFAULT_MAX_ENTRIES)
  const maxBytes = Math.max(0, limits.maxBytes ?? DEFAULT_MAX_BYTES)
  const entries = new Map<string, PreviewEntry>()
  let retainedBytes = 0

  const estimateBytes = (...values: Array<string | undefined>) => values.reduce((total, value) => total + (value?.length ?? 0) * 2, 0)

  const remove = (key: string, expected?: PreviewEntry) => {
    const entry = entries.get(key)
    if (!entry || (expected && entry !== expected)) return
    entries.delete(key)
    retainedBytes -= entry.estimatedBytes
  }

  const trim = () => {
    while (entries.size > maxEntries || retainedBytes > maxBytes) {
      const oldest = entries.entries().next().value as [string, PreviewEntry] | undefined
      if (!oldest) break
      remove(oldest[0], oldest[1])
    }
  }

  return (slot: number, part: ModelPart, tone?: string, outlineColor?: string): Promise<string | null> => {
    const key = `${slot}:${part.id}`
    const contoursKey = JSON.stringify(part.fakeSkinContours ?? [])
    const cached = entries.get(key)
    if (cached?.source === part.dataUrl && cached.tone === tone && cached.outlineColor === outlineColor && cached.contoursKey === contoursKey) {
      entries.delete(key)
      entries.set(key, cached)
      return cached.result
    }

    remove(key)
    const result = createPreview(part, tone, outlineColor)
    const entry: PreviewEntry = {
      source: part.dataUrl,
      tone,
      outlineColor,
      contoursKey,
      result,
      estimatedBytes: estimateBytes(key, part.dataUrl, tone, outlineColor, contoursKey)
    }
    entries.set(key, entry)
    retainedBytes += entry.estimatedBytes
    trim()

    void result.then((dataUrl) => {
      if (entries.get(key) !== entry) return
      const nextBytes = estimateBytes(key, part.dataUrl, tone, outlineColor, contoursKey, dataUrl ?? undefined)
      retainedBytes += nextBytes - entry.estimatedBytes
      entry.estimatedBytes = nextBytes
      trim()
    }, () => remove(key, entry))

    return result
  }
}
