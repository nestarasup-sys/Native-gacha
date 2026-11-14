import type { FaceExpressionEffects } from '../../../shared/fabricator'
import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'
import { legacyStandardExpressionEffects } from '../../../shared/legacyExpressionEffects'

export type StandardExpressionEffects = Record<number, FaceExpressionEffects>
export type StandardExpressionEffectsCache = WeakMap<CharacterRenderAssetProvider, Map<number, Promise<StandardExpressionEffects>>>

async function loadStandardExpressionEffectsUncached(modelSlot: number, assetProvider: CharacterRenderAssetProvider): Promise<StandardExpressionEffects> {
  const summaries = await assetProvider.listFaceExpressionPresets(modelSlot)
  const standard = summaries.filter((preset) => (preset.collectionId ?? 'standard') === 'standard'
    && Number.isInteger(preset.expressionIndex) && preset.expressionIndex! >= 0 && preset.expressionIndex! < 21)
  const loaded = await Promise.all(standard.map((summary) => assetProvider.loadFaceExpressionPreset(modelSlot, summary.id)))
  const effectsByIndex: StandardExpressionEffects = {}
  for (const preset of loaded) {
    if (!preset || !Number.isInteger(preset.expressionIndex)) continue
    const fallback = legacyStandardExpressionEffects({ ...preset, collectionId: preset.collectionId ?? 'standard' })
    const effects = preset.effects ?? fallback
    if (!effects) continue
    // Keep authored mouth blush while disabling face-wide shadow and blush.
    effectsByIndex[preset.expressionIndex!] = {
      ...structuredClone(effects),
      shadow: { ...effects.shadow, enabled: false },
      blush: { ...effects.blush, enabled: false },
      mouthBlush: { ...effects.mouthBlush }
    }
  }
  return effectsByIndex
}

export function loadStandardExpressionEffects(
  modelSlot: number,
  assetProvider: CharacterRenderAssetProvider = window.desktop.fabricator,
  cache?: StandardExpressionEffectsCache
): Promise<StandardExpressionEffects> {
  if (!cache) return loadStandardExpressionEffectsUncached(modelSlot, assetProvider)
  let byModelSlot = cache.get(assetProvider)
  if (!byModelSlot) {
    byModelSlot = new Map()
    cache.set(assetProvider, byModelSlot)
  }
  const pending = byModelSlot.get(modelSlot)
  if (pending) return pending

  const request = loadStandardExpressionEffectsUncached(modelSlot, assetProvider)
  byModelSlot.set(modelSlot, request)
  void request.catch(() => {
    if (byModelSlot?.get(modelSlot) === request) byModelSlot.delete(modelSlot)
  })
  return request
}
