import type { ModelPart } from '../../../../../shared/fabricator.ts'
import { createConcurrencyLimiter } from '../../../ui/concurrencyLimiter.ts'
import { mapConcurrentItems } from '../../../ui/mapConcurrentItems.ts'

const MODEL_APPEARANCE_PREVIEW_CONCURRENCY = 2
const scheduleAppearancePreview = createConcurrencyLimiter(MODEL_APPEARANCE_PREVIEW_CONCURRENCY)

export type ModelAppearancePreviewLoader = (
  slot: number,
  part: ModelPart,
  tone?: string,
  outlineColor?: string
) => Promise<string | null>

/** Loads body previews in parallel while sharing one renderer-wide canvas-work ceiling. */
export async function loadModelAppearancePreviews(
  slot: number,
  parts: readonly ModelPart[],
  tone: string | undefined,
  outlineColor: string | undefined,
  loadPreview: ModelAppearancePreviewLoader,
  isCancelled: () => boolean
): Promise<Record<string, string>> {
  let failed = false
  const previews = await mapConcurrentItems(parts, async (part) => {
    try {
      const preview = await scheduleAppearancePreview(
        () => loadPreview(slot, part, tone, outlineColor),
        () => isCancelled() || failed
      )
      return preview ? { key: `${slot}:${part.id}`, preview } : null
    } catch (reason) {
      failed = true
      throw reason
    }
  }, isCancelled, MODEL_APPEARANCE_PREVIEW_CONCURRENCY)

  if (isCancelled()) return {}

  const urls: Record<string, string> = {}
  for (const item of previews) {
    if (item) urls[item.key] = item.preview
  }
  return urls
}
