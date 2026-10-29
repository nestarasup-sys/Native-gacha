import type { HairStyle, HairStyleSummary } from '../../../../shared/fabricator'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems.ts'

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
