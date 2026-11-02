/** Legacy wardrobe palette and skirt aliases used by old saved characters.
 * Pure normalization: only called after validating the original object.
 * Never writes back to the Fabricador catalog or mutates a saved character.
 */
import type { CharacterColorOverrides, CustomizerCharacter, CustomizerWardrobeGroup } from '../../../src/shared/customizer.ts'

export function normalizeCustomizerCharacter(character: CustomizerCharacter): CustomizerCharacter {
  const storedCustomization = character.customization as CustomizerCharacter['customization'] & { wardrobeColors?: CharacterColorOverrides }
  const { wardrobeColors: legacyWardrobeColors, ...customization } = storedCustomization
  const storedGroups = customization.wardrobeGroups as Array<CustomizerWardrobeGroup & {
    renderAboveShinClothing?: boolean
    renderBehindShinClothing?: boolean
  }> | undefined
  const migratedShoePreference = customization.shoesBehindShinClothing
    ?? (storedGroups?.some((group) => group.renderBehindShinClothing === true) ? true : undefined)
  return {
    ...character,
    customization: {
      ...customization,
      ...(migratedShoePreference === undefined ? {} : { shoesBehindShinClothing: migratedShoePreference }),
      wardrobeGroups: storedGroups?.map((storedGroup) => {
        const group = { ...storedGroup }
        // Migrate the previous per-shoe preference to the character-wide setting.
        delete group.renderAboveShinClothing
        delete group.renderBehindShinClothing
        return {
          ...group,
          category: group.category === ('cinto-saia-1' as typeof group.category) ? 'cinto'
            : group.category === ('cinto-saia-2' as typeof group.category) ? 'saia-superior'
            : group.category === 'saia' ? 'saia-superior' : group.category,
          ...(legacyWardrobeColors && !group.colors ? { colors: legacyWardrobeColors } : {})
        }
      })
    }
  }
}
