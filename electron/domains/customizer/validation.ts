/** Validação de formato persistido do Customizador, sem Electron nem acesso a disco.
 * Contratos legados permanecem aceitos para não invalidar bibliotecas existentes.
 */
import type { FaceElementKind } from '../../../src/shared/fabricator.ts'
import type { CustomizerCharacter, CustomizerFaceAppearance, CustomizerWardrobePaletteKey, HairColorOverrides } from '../../../src/shared/customizer.ts'
import { characterBodyDimensionLimits, characterProportionLimits } from '../../../src/shared/customizer.ts'
import { validWardrobeAdjustmentReference } from '../../../src/shared/wardrobeAdjustment.ts'
const slotCount = 10
const poseSlotCount = 12
const isValidModelSlot = (slot: number) => Number.isInteger(slot) && slot >= 1 && slot <= slotCount
const isValidWardrobeId = (id: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(id)
const isValidFaceCatalogId = (id: string) => /^[a-zA-Z0-9_-]{1,120}$/.test(id)
const faceElementKinds: FaceElementKind[] = ['eye-left', 'eye-right', 'brow-left', 'brow-right', 'nose', 'mouth']
const faceComponentPartIds = ['eye-left', 'eye-right', 'pupil-left', 'pupil-right', 'brow-left', 'brow-right'] as const

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
    && (character.customization.poseSlot === null || (Number.isInteger(character.customization.poseSlot) && character.customization.poseSlot >= 1 && character.customization.poseSlot <= poseSlotCount))
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


export function isValidCustomizerFaceAppearance(appearance: CustomizerFaceAppearance): boolean {
  if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance)) return false
  const componentEntries = Object.entries(appearance.components ?? {})
  const faceDetailEntries = Object.entries(appearance.faceDetails ?? {})
  const headExtraEntries = Object.entries(appearance.headExtras ?? {})
  const headExtrasValid = appearance.headExtras === undefined || (
    !!appearance.headExtras && typeof appearance.headExtras === 'object'
    && !Array.isArray(appearance.headExtras) && headExtraEntries.length <= 2
    && headExtraEntries.every(([category, id]) => ['glasses', 'head-accessory'].includes(category)
      && (id === null || typeof id === 'string' && isValidWardrobeId(id)))
  )
  const componentParts = new Set<string>(faceComponentPartIds)
  const catalogIds = [appearance.eyeCatalogId, appearance.eyeLeftCatalogId, appearance.eyeRightCatalogId, appearance.eyebrowCatalogId, appearance.eyebrowLeftCatalogId, appearance.eyebrowRightCatalogId, appearance.noseCatalogId, appearance.mouthClosedCatalogId, appearance.mouthOpenCatalogId]
  const componentsValid = appearance.components === undefined || (!!appearance.components && typeof appearance.components === 'object' && !Array.isArray(appearance.components)
    && componentEntries.length <= faceComponentPartIds.length
    && componentEntries.every(([part, component]) => componentParts.has(part) && !!component && typeof component === 'object'
      && (component.assetId === null || isValidWardrobeId(component.assetId))
      && (component.transform === undefined || [component.transform.x, component.transform.y, component.transform.scaleX, component.transform.scaleY, component.transform.rotation].every(Number.isFinite)
        && component.transform.scaleX > 0 && component.transform.scaleX <= 20 && component.transform.scaleY > 0 && component.transform.scaleY <= 20
        && (component.transform.flipX === undefined || typeof component.transform.flipX === 'boolean'))
      && (component.colors === undefined || isHairColorMap(component.colors))))
  const transformsValid = appearance.transforms === undefined || (!!appearance.transforms && typeof appearance.transforms === 'object' && !Array.isArray(appearance.transforms)
    && Object.entries(appearance.transforms).every(([key, value]) => faceElementKinds.includes(key as FaceElementKind) && !!value
      && [value.x, value.y, value.scaleX, value.scaleY, value.rotation].every(Number.isFinite) && value.scaleX > 0 && value.scaleY > 0
      && (value.flipX === undefined || typeof value.flipX === 'boolean')))
  const faceDetailsValid = appearance.faceDetails === undefined || (!!appearance.faceDetails && typeof appearance.faceDetails === 'object' && !Array.isArray(appearance.faceDetails)
    && faceDetailEntries.length <= 4
    && faceDetailEntries.every(([kind, id]) => ['eye-highlight-left', 'eye-highlight-right', 'blush', 'facial-shadow'].includes(kind)
      && (id === null || typeof id === 'string' && isValidWardrobeId(id))))
  const linksValid = appearance.linkedSides === undefined || (!!appearance.linkedSides && typeof appearance.linkedSides === 'object' && !Array.isArray(appearance.linkedSides)
    && Object.entries(appearance.linkedSides).every(([kind, linked]) => ['eye', 'pupil', 'eyebrow'].includes(kind) && typeof linked === 'boolean'))
  const partColorsValid = appearance.partColors === undefined || (!!appearance.partColors && typeof appearance.partColors === 'object' && !Array.isArray(appearance.partColors)
    && Object.entries(appearance.partColors).every(([part, colors]) => ['eye-left', 'eye-right', 'brow-left', 'brow-right'].includes(part) && isHairColorMap(colors)))
  // Head-only accessories are valid independent selections. Previously a
  // glasses-only faceAppearance was rejected by character:save, even though
  // Customizer can render and select it. Do not silently lose the pre-fit.
  const hasSelection = Boolean(appearance.setId || catalogIds.some(Boolean)
    || componentEntries.some(([, component]) => component?.assetId)
    || faceDetailEntries.some(([, id]) => id)
    || headExtraEntries.some(([, id]) => Boolean(id))
    || appearance.mouthBlushEnabled !== undefined)

  return isValidModelSlot(appearance.modelSlot)
    && (appearance.setId === undefined || isValidWardrobeId(appearance.setId))
    && catalogIds.every((id) => id === undefined || id === null || isValidFaceCatalogId(id))
    && componentsValid && transformsValid && faceDetailsValid && headExtrasValid && linksValid && partColorsValid && hasSelection
    && [0, 1, 2].includes(appearance.eyeState)
    && typeof appearance.eyebrows === 'boolean'
    && Number.isInteger(appearance.noseIndex) && appearance.noseIndex >= 0 && appearance.noseIndex <= 5
    && Number.isInteger(appearance.expressionIndex) && appearance.expressionIndex >= 0 && appearance.expressionIndex <= 20
    && typeof appearance.mouthOpen === 'boolean'
    && (appearance.mouthBlushEnabled === undefined || typeof appearance.mouthBlushEnabled === 'boolean')
    && (appearance.mouthBlushColor === undefined || /^#[0-9a-f]{6}$/i.test(appearance.mouthBlushColor))
    && (appearance.mouthBlushOpacity === undefined || Number.isFinite(appearance.mouthBlushOpacity) && appearance.mouthBlushOpacity >= 0 && appearance.mouthBlushOpacity <= 1)
}

