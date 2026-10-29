/** Validação de formato persistido do Customizador, sem Electron nem acesso a disco.
 * Contratos legados permanecem aceitos para não invalidar bibliotecas existentes.
 */
import type { CustomizerCharacter, CustomizerWardrobePaletteKey, HairColorOverrides } from '../../../src/shared/customizer.ts'
import { FABRICATOR_MODEL_SLOT_COUNT, FABRICATOR_POSE_SLOT_COUNT } from '../../../src/shared/fabricator.ts'
import { isValidCustomizerFaceAppearance } from '../../../src/shared/customizerValidation.ts'
export { isValidCustomizerFaceAppearance } from '../../../src/shared/customizerValidation.ts'
import { characterBodyDimensionLimits, characterProportionLimits } from '../../../src/shared/customizer.ts'
import { validWardrobeAdjustmentReference } from '../../../src/shared/wardrobeAdjustment.ts'
const isValidModelSlot = (slot: number) => Number.isInteger(slot) && slot >= 1 && slot <= FABRICATOR_MODEL_SLOT_COUNT
const isValidWardrobeId = (id: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(id)

const hairColorRoles = ['base', 'fade', 'outline', 'highlight', 'accent'] as const
const hairPartIds = ['backHair', 'rearHair', 'ponytail', 'frontHair', 'ahoge'] as const
const wardrobePaletteKeys: CustomizerWardrobePaletteKey[] = ['shirt', 'jacket', 'upper-left', 'upper-right', 'lower-left', 'lower-right', 'gloves-left', 'gloves-right', 'cape', 'belt', 'glasses', 'head-accessory', 'skirt', 'pants-left', 'shorts-right', 'sock-left', 'sock-right', 'shoe-left', 'shoe-right', 'lower-skirt']
function isHairColorMap(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([role, color]) => hairColorRoles.includes(role as typeof hairColorRoles[number]) && typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color))
}

export function isCustomizerCharacter(value: unknown): value is CustomizerCharacter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const character = value as Partial<CustomizerCharacter>
  return typeof character.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(character.id)
    && typeof character.name === 'string' && character.name.trim().length > 0 && character.name.length <= 80
    && typeof character.hair === 'string' && /^#[0-9a-fA-F]{6}$/.test(character.hair)
    && typeof character.outfit === 'string' && /^#[0-9a-fA-F]{6}$/.test(character.outfit)
    && typeof character.skin === 'string' && /^#[0-9a-fA-F]{6}$/.test(character.skin)
    && !!character.customization && typeof character.customization === 'object'
    && (character.customization.modelSlot === null || isValidModelSlot(character.customization.modelSlot))
    && (character.customization.poseSlot === null || (Number.isInteger(character.customization.poseSlot) && character.customization.poseSlot >= 1 && character.customization.poseSlot <= FABRICATOR_POSE_SLOT_COUNT))
    && (character.customization.proportions === undefined || (
      !!character.customization.proportions && typeof character.customization.proportions === 'object'
      && (Object.keys(characterProportionLimits) as Array<keyof typeof characterProportionLimits>).every((key) => {
        const value = character.customization!.proportions?.[key]
        const { min, max } = characterProportionLimits[key]
        return (value === undefined && (key === 'headWidth' || key === 'headHeight'))
          || (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max)
      })
    ))
    && (character.customization.bodyDimensions === undefined || (
      !!character.customization.bodyDimensions && typeof character.customization.bodyDimensions === 'object'
      && (Object.keys(characterBodyDimensionLimits) as Array<keyof typeof characterBodyDimensionLimits>).every((key) => {
        const value = character.customization!.bodyDimensions?.[key]
        const { min, max } = characterBodyDimensionLimits[key]
        return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max)
      })
    ))
    && !!character.customization.partOverrides && typeof character.customization.partOverrides === 'object'
    && Object.keys(character.customization.partOverrides).length <= 1000
    && Array.isArray(character.customization.layerOrder)
    && character.customization.layerOrder.length <= 1000
    && character.customization.layerOrder.every((id) => typeof id === 'string' && id.length <= 120)
    && ((character.customization as CustomizerCharacter['customization'] & { wardrobeColors?: HairColorOverrides }).wardrobeColors === undefined || isHairColorMap((character.customization as CustomizerCharacter['customization'] & { wardrobeColors?: HairColorOverrides }).wardrobeColors))
    && (character.customization.wardrobePalettes === undefined || (
      !!character.customization.wardrobePalettes && typeof character.customization.wardrobePalettes === 'object' && !Array.isArray(character.customization.wardrobePalettes)
      && Object.entries(character.customization.wardrobePalettes).every(([key, colors]) => wardrobePaletteKeys.includes(key as CustomizerWardrobePaletteKey) && isHairColorMap(colors))
    ))
    && (character.customization.wardrobeGroups === undefined || (
      Array.isArray(character.customization.wardrobeGroups) && character.customization.wardrobeGroups.length <= 100
      && character.customization.wardrobeGroups.every((group) => group && isValidModelSlot(group.modelSlot)
        && isValidWardrobeId(group.setId)
        && ['camisa', 'jaqueta', 'manga-superior', 'manga-inferior', 'luvas', 'capa', 'cinto', 'oculos', 'acessorio-cabeca', 'saia', 'saia-superior', 'saia-inferior', 'cinto-saia-1', 'cinto-saia-2', 'calca', 'shorts', 'meia', 'sapato'].includes(group.category)
        && [group.offsetX, group.offsetY, group.scaleX, group.scaleY, group.rotation].every(Number.isFinite)
        && group.scaleX > 0 && group.scaleY > 0
        && (group.adjustmentReference === undefined || typeof group.componentId === 'string'
          && validWardrobeAdjustmentReference(group.adjustmentReference)))
    ))
    && (character.customization.faceAppearance === undefined || isValidCustomizerFaceAppearance(character.customization.faceAppearance))
    && (character.customization.hairAppearance === undefined || (
      !!character.customization.hairAppearance
      && isValidModelSlot(character.customization.hairAppearance.modelSlot)
      && (character.customization.hairAppearance.styleId === undefined || isValidWardrobeId(character.customization.hairAppearance.styleId))
      && (character.customization.hairAppearance.frontStyleId === undefined || character.customization.hairAppearance.frontStyleId === null || isValidWardrobeId(character.customization.hairAppearance.frontStyleId))
      && (character.customization.hairAppearance.backStyleId === undefined || character.customization.hairAppearance.backStyleId === null || isValidWardrobeId(character.customization.hairAppearance.backStyleId))
      && (character.customization.hairAppearance.colors === undefined || isHairColorMap(character.customization.hairAppearance.colors))
      && (character.customization.hairAppearance.parts === undefined || (
        !!character.customization.hairAppearance.parts && typeof character.customization.hairAppearance.parts === 'object'
        && Object.entries(character.customization.hairAppearance.parts).every(([part, id]) => hairPartIds.includes(part as typeof hairPartIds[number]) && (id === null || typeof id === 'string' && isValidWardrobeId(id)))
      ))
      && (character.customization.hairAppearance.partColors === undefined || (
        !!character.customization.hairAppearance.partColors && typeof character.customization.hairAppearance.partColors === 'object'
        && Object.entries(character.customization.hairAppearance.partColors).every(([part, colors]) => hairPartIds.includes(part as typeof hairPartIds[number]) && isHairColorMap(colors))
      ))
    ))
    && typeof character.createdAt === 'string' && typeof character.updatedAt === 'string'
}
