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

/** Mantém os assets decodificados apenas para o slot de modelo selecionado no Customizador. */
export function retainCustomizerHairDetailsForModel(
  details: Record<string, HairStyle>,
  modelSlot: number | null
): Record<string, HairStyle> {
  const entries = Object.entries(details)
  if (modelSlot === null) return entries.length ? {} : details

  const prefix = `${modelSlot}:`
  const retained = entries.filter(([key]) => key.startsWith(prefix))
  return retained.length === entries.length ? details : Object.fromEntries(retained)
}
