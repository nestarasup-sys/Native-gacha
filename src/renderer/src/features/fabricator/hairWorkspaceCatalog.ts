import type { HairStyle, HairStyleSummary } from '../../../../shared/fabricator'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems.ts'

export const HAIR_WORKSPACE_CATALOG_PAGE_SIZE = 12

export function getHairWorkspaceCatalogPage(summaries: readonly HairStyleSummary[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(summaries.length / HAIR_WORKSPACE_CATALOG_PAGE_SIZE))
  const page = Math.max(0, Math.min(pageCount - 1, Math.trunc(requestedPage) || 0))
  const visibleStyles = summaries.slice(page * HAIR_WORKSPACE_CATALOG_PAGE_SIZE, (page + 1) * HAIR_WORKSPACE_CATALOG_PAGE_SIZE)
  return { visibleStyles, pageCount, page }
}

/** Carrega os PNGs detalhados dos cartões visíveis sem incluir as folhas originais. */
export function loadHairWorkspaceCatalogPage(
  visibleStyles: readonly HairStyleSummary[],
  isCancelled: () => boolean,
  hasCurrentDetail: (summary: HairStyleSummary) => boolean,
  loadStyle: (id: string) => Promise<HairStyle | null>,
  concurrency = 3
): Promise<HairStyle[]> {
  const missing = visibleStyles.filter((summary) => !hasCurrentDetail(summary))
  return mapConcurrentItems(missing, (summary) => loadStyle(summary.id), isCancelled, concurrency)
    .then((styles) => styles.filter((style): style is HairStyle => style !== null))
}

export function hairStyleDetailMatchesSummary(summary: HairStyleSummary, detail: HairStyle | null | undefined): detail is HairStyle {
  if (!detail || detail.id !== summary.id || detail.modelSlot !== summary.modelSlot || detail.updatedAt !== summary.updatedAt) return false
  return (['front', 'back', 'fringe'] as const).every((side) => {
    const expected = summary[side]
    const loaded = detail[side]
    if (!expected) return !loaded
    if (!loaded?.dataUrl) return false
    return loaded.width === expected.width && loaded.height === expected.height
  })
}

export function retainHairWorkspaceStyleDetails(
  details: Record<string, HairStyle>,
  modelSlot: number | null,
  retainedIds: ReadonlySet<string>
): Record<string, HairStyle> {
  const entries = Object.entries(details)
  if (modelSlot === null) return entries.length ? {} : details
  const prefix = `${modelSlot}:`
  const retained = entries.filter(([key]) => key.startsWith(prefix) && retainedIds.has(key.slice(prefix.length)))
  return retained.length === entries.length ? details : Object.fromEntries(retained)
}

export function hairStyleSummary(style: HairStyle): HairStyleSummary {
  const { front, back, fringe, sourceImageDataUrl: _source, ...metadata } = style
  return {
    ...metadata,
    front: front ? { width: front.width, height: front.height } : null,
    back: back ? { width: back.width, height: back.height } : null,
    fringe: fringe ? { width: fringe.width, height: fringe.height } : null
  }
}
