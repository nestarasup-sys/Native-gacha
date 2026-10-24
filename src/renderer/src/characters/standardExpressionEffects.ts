import type { FaceExpressionEffects } from '../../../shared/fabricator'
import { legacyStandardExpressionEffects } from '../../../shared/legacyExpressionEffects'
import type { VideoCharacterRenderAssetProvider } from '../../../shared/videoCharacterRenderAssets'

export type StandardExpressionEffects = Record<number, FaceExpressionEffects>

export async function loadStandardExpressionEffects(modelSlot: number, assetProvider: VideoCharacterRenderAssetProvider = window.desktop): Promise<StandardExpressionEffects> {
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
    // Customizer's checkbox controls the mouth blush. Keep the other authored
    // expression effects exclusive to Studio presets.
    effectsByIndex[preset.expressionIndex!] = {
      ...structuredClone(effects),
      shadow: { ...effects.shadow, enabled: false },
      blush: { ...effects.blush, enabled: false },
      mouthBlush: { ...effects.mouthBlush }
    }
  }
  return effectsByIndex
}

