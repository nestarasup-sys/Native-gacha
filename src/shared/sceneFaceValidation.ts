import type { CustomizerFaceAppearance } from './customizer'
import type { FaceExpressionEffects, FaceTransform } from './fabricator'

export type SceneFaceTransform = { x: number; y: number; width: number; height: number; rotation: number; sourceTransformOverride?: FaceTransform }
export type SceneFaceTransformCategory = 'eyes' | 'eyebrows' | 'nose' | 'mouth'
export type SceneFaceTransforms = Record<string, SceneFaceTransform>
export type SceneExpressionBase = { appearance: CustomizerFaceAppearance; transforms: SceneFaceTransforms }
export type SceneFaceMode = 'idle' | 'blink' | 'talk'

export function isSceneFaceExpressionEffects(value: unknown): value is FaceExpressionEffects {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const effects = value as FaceExpressionEffects
  return (['shadow', 'blush', 'mouthBlush'] as const).every((key) => {
    const effect = effects[key]
    return Boolean(effect && typeof effect.enabled === 'boolean' && /^#[0-9a-f]{6}$/i.test(effect.color)
      && Number.isFinite(effect.opacity) && effect.opacity >= 0 && effect.opacity <= 1
      && Number.isFinite(effect.softness) && effect.softness >= 0 && effect.softness <= 1
      && Number.isFinite(effect.size) && effect.size >= 0.05 && effect.size <= 2
      && Number.isFinite(effect.offsetY) && effect.offsetY >= -0.5 && effect.offsetY <= 0.5
      && (effect.offsetX === undefined || Number.isFinite(effect.offsetX) && effect.offsetX >= -0.5 && effect.offsetX <= 0.5)
      && (effect.aspectRatio === undefined || Number.isFinite(effect.aspectRatio) && effect.aspectRatio >= 0.05 && effect.aspectRatio <= 2)
      && (effect.width === undefined || Number.isFinite(effect.width) && effect.width >= 0.01 && effect.width <= 2)
      && (effect.height === undefined || Number.isFinite(effect.height) && effect.height >= 0.01 && effect.height <= 2)
      && (effect.rotation === undefined || Number.isFinite(effect.rotation) && effect.rotation >= -180 && effect.rotation <= 180)
      && (effect.style === undefined || ['oval', 'cheeks', 'bands', 'diagonal', 'spot'].includes(effect.style)))
  })
}

export function isSceneFaceTransforms(value: unknown): value is SceneFaceTransforms {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([key, entry]) => {
    const manual = /^(eyes|eyebrows|nose|mouth|mouth-closed|mouth-open)(:[^:]+)?$/i.test(key)
    const expression = /^expression-component:(eye|pupil|brow)-(left|right)$/.test(key)
      || /^expression:(eyes|eyebrows|eye-left|eye-right|brow-left|brow-right|nose|mouth-closed|mouth-open):[^:]+$/.test(key)
    if (!manual && !expression || !entry || typeof entry !== 'object') return false
    const transform = entry as Partial<SceneFaceTransform>
    if (![transform.x, transform.y, transform.width, transform.height, transform.rotation].every((number) => typeof number === 'number' && Number.isFinite(number))) return false
    const source = transform.sourceTransformOverride
    if (source === undefined) return true
    return Boolean(source) && typeof source === 'object' && [source.x, source.y, source.scaleX, source.scaleY, source.rotation].every(Number.isFinite)
      && source.scaleX > 0 && source.scaleY > 0 && (source.flipX === undefined || typeof source.flipX === 'boolean')
  })
}
