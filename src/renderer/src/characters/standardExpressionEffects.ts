import type { FaceExpressionEffects } from '../../../shared/fabricator'
import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'
import { legacyStandardExpressionEffects } from '../../../shared/legacyExpressionEffects'

export type StandardExpressionEffects = Record<number, FaceExpressionEffects>

export async function loadStandardExpressionEffects(modelSlot: number, assetProvider: CharacterRenderAssetProvider = window.desktop.fabricator): Promise<StandardExpressionEffects> {
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
