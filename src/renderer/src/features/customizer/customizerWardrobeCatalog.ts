import type { WardrobeCategory, WardrobeSet, WardrobeSetSummary } from '../../../../shared/fabricator'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems.ts'

export type CustomizerWardrobeThumbnailCategory = { id: string; source: WardrobeCategory[] }

export type CustomizerWardrobeCatalogDependencies = {
  summaries: WardrobeSetSummary[]
  categories: CustomizerWardrobeThumbnailCategory[]
  loadSet: (summary: WardrobeSetSummary) => Promise<WardrobeSet | null>
  hasThumbnail: (key: string) => boolean
  renderThumbnail: (set: WardrobeSet, categories: WardrobeCategory[]) => Promise<string | null>
  isCancelled: () => boolean
  onSetLoaded: (summary: WardrobeSetSummary, set: WardrobeSet) => void
  onThumbnailLoaded: (key: string, thumbnail: string) => void
  onError: (reason: unknown) => void
  concurrency?: number
}

/** Loads details and small previews progressively without flooding image decoding. */
export async function loadCustomizerWardrobeCatalog({
  summaries,
  categories,
  loadSet,
  hasThumbnail,
  renderThumbnail,
  isCancelled,
  onSetLoaded,
  onThumbnailLoaded,
  onError,
  concurrency = 3
}: CustomizerWardrobeCatalogDependencies): Promise<void> {
  await mapConcurrentItems(summaries, async (summary) => {
    try {
      const set = await loadSet(summary)
      if (!set || isCancelled()) return
      onSetLoaded(summary, set)
      for (const category of categories) {
        if (isCancelled()) break
        if (!set.components.some((component) => category.source.includes(component.category))) continue
        const key = `${summary.modelSlot}:${summary.id}:${category.id}`
        if (hasThumbnail(key)) continue
        const thumbnail = await renderThumbnail(set, category.source)
        if (isCancelled()) break
        if (thumbnail) onThumbnailLoaded(key, thumbnail)
      }
    } catch (reason) {
      if (!isCancelled()) onError(reason)
    }
  }, isCancelled, concurrency)
}
