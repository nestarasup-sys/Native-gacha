import type { CustomizerCharacter, HairPartId } from '../../../../shared/customizer'
import { hairAppearanceStyleId } from '../../characters/characterRenderer'

export const adjustableHairPartIds = new Set<string>(['backHair', 'rearHair', 'ponytail', 'frontHair', 'ahoge'])

export function hairAppearancePartStyleId(appearance: NonNullable<CustomizerCharacter['customization']['hairAppearance']> | undefined, part: HairPartId): string | null {
  if (appearance?.parts && Object.prototype.hasOwnProperty.call(appearance.parts, part)) return appearance.parts[part] ?? null
  if (part === 'backHair') return hairAppearanceStyleId(appearance, 'back')
  if (part === 'rearHair') return appearance?.parts?.frontHair ?? hairAppearanceStyleId(appearance, 'front')
  return null
}
