import type { HairStyle, HairStyleSummary } from '../../../../shared/fabricator'
import type { HairPartId } from '../../../../shared/customizer'
import { hairStyleSupportsCategory } from '../../../../shared/hairCategories.ts'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems.ts'

export const CUSTOMIZER_HAIR_LIBRARY_PAGE_SIZE = 20

export function getCustomizerHairLibraryPage(
  summaries: readonly HairStyleSummary[],
  partId: HairPartId | null,
  requestedPage: number
) {
  const options = partId ? summaries.filter((summary) => hairStyleSupportsCategory(summary, partId)) : []
  const slots: Array<HairStyleSummary | null> = [null, ...options]
  const pageCount = Math.max(1, Math.ceil(slots.length / CUSTOMIZER_HAIR_LIBRARY_PAGE_SIZE))
  const page = Math.max(0, Math.min(pageCount - 1, Math.trunc(requestedPage) || 0))
  const visible = slots.slice(page * CUSTOMIZER_HAIR_LIBRARY_PAGE_SIZE, (page + 1) * CUSTOMIZER_HAIR_LIBRARY_PAGE_SIZE)
  return { options, visible, visibleStyles: visible.filter((style): style is HairStyleSummary => style !== null), pageCount, page }
}

/** Limita as leituras dos cabelos para a abertura de catálogos grandes não gerar picos. */
export async function loadCustomizerHairDetails(
  summaries: readonly HairStyleSummary[],
  isCancelled: () => boolean,
  loadStyle: (id: string) => Promise<HairStyle | null>,
  concurrency = 3
): Promise<HairStyle[]> {
  const details = await mapConcurrentItems(summaries, (summary) => loadStyle(summary.id), isCancelled, concurrency)
  return details.filter((style): style is HairStyle => style !== null)
}

/** Carrega apenas os estilos representados na página visível da biblioteca. */
export function loadCustomizerHairLibraryPageDetails(
  visibleStyles: readonly HairStyleSummary[],
  isCancelled: () => boolean,
  hasCurrentDetail: (summary: HairStyleSummary) => boolean,
  loadStyle: (id: string) => Promise<HairStyle | null>,
  concurrency = 3
): Promise<HairStyle[]> {
  const missing = visibleStyles.filter((summary) => !hasCurrentDetail(summary))
  return loadCustomizerHairDetails(missing, isCancelled, loadStyle, concurrency)
}

/** Mantém os assets decodificados apenas para o slot de modelo selecionado no Customizador. */
export function retainCustomizerHairDetailsForModel(
  details: Record<string, HairStyle>,
  modelSlot: number | null,
  retainedStyleIds?: ReadonlySet<string>
): Record<string, HairStyle> {
  const entries = Object.entries(details)
  if (modelSlot === null) return entries.length ? {} : details

  const prefix = `${modelSlot}:`
  const retained = entries.filter(([key]) => key.startsWith(prefix)
    && (!retainedStyleIds || retainedStyleIds.has(key.slice(prefix.length))))
  return retained.length === entries.length ? details : Object.fromEntries(retained)
}
