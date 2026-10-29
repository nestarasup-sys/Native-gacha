import { FABRICATOR_MODEL_SLOT_COUNT, type FaceElementKind } from './fabricator.ts'
import type { CustomizerFaceAppearance } from './customizer'
import type { HairColorOverrides } from './customizer'

const validWardrobeId = (id: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(id)
const validModelSlot = (slot: number) => Number.isInteger(slot) && slot >= 1 && slot <= FABRICATOR_MODEL_SLOT_COUNT
const validFaceCatalogId = (id: string) => /^[a-zA-Z0-9_-]{1,120}$/.test(id)
const faceElementKinds: FaceElementKind[] = ['eye-left', 'eye-right', 'brow-left', 'brow-right', 'nose', 'mouth']
const faceComponentPartIds = ['eye-left', 'eye-right', 'pupil-left', 'pupil-right', 'brow-left', 'brow-right'] as const
const hairColorRoles = ['base', 'fade', 'outline', 'highlight', 'accent'] as const

function isHairColorMap(value: unknown): value is HairColorOverrides {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([role, color]) => hairColorRoles.includes(role as typeof hairColorRoles[number]) && typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color))
}

export function isValidCustomizerFaceAppearance(value: unknown): value is CustomizerFaceAppearance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const appearance = value as CustomizerFaceAppearance
  const componentEntries = Object.entries(appearance.components ?? {})
  const faceDetailEntries = Object.entries(appearance.faceDetails ?? {})
  const headExtraEntries = Object.entries(appearance.headExtras ?? {})
  const headExtrasValid = appearance.headExtras === undefined || (
    !!appearance.headExtras && typeof appearance.headExtras === 'object'
    && !Array.isArray(appearance.headExtras) && headExtraEntries.length <= 2
    && headExtraEntries.every(([category, id]) => ['glasses', 'head-accessory'].includes(category)
      && (id === null || typeof id === 'string' && validWardrobeId(id)))
  )
  const componentParts = new Set<string>(faceComponentPartIds)
  const catalogIds = [appearance.eyeCatalogId, appearance.eyeLeftCatalogId, appearance.eyeRightCatalogId, appearance.eyebrowCatalogId, appearance.eyebrowLeftCatalogId, appearance.eyebrowRightCatalogId, appearance.noseCatalogId, appearance.mouthClosedCatalogId, appearance.mouthOpenCatalogId]
  const componentsValid = appearance.components === undefined || (!!appearance.components && typeof appearance.components === 'object' && !Array.isArray(appearance.components)
    && componentEntries.length <= faceComponentPartIds.length
    && componentEntries.every(([part, component]) => componentParts.has(part) && !!component && typeof component === 'object'
      && (component.assetId === null || validWardrobeId(component.assetId))
      && (component.transform === undefined || [component.transform.x, component.transform.y, component.transform.scaleX, component.transform.scaleY, component.transform.rotation].every(Number.isFinite)
        && component.transform.scaleX > 0 && component.transform.scaleX <= 20 && component.transform.scaleY > 0 && component.transform.scaleY <= 20
        && (component.transform.flipX === undefined || typeof component.transform.flipX === 'boolean'))
      && (component.colors === undefined || isHairColorMap(component.colors))))
  const transformsValid = appearance.transforms === undefined || (!!appearance.transforms && typeof appearance.transforms === 'object' && !Array.isArray(appearance.transforms)
    && Object.entries(appearance.transforms).every(([key, transform]) => faceElementKinds.includes(key as FaceElementKind) && !!transform
      && [transform.x, transform.y, transform.scaleX, transform.scaleY, transform.rotation].every(Number.isFinite) && transform.scaleX > 0 && transform.scaleY > 0
      && (transform.flipX === undefined || typeof transform.flipX === 'boolean')))
  const faceDetailsValid = appearance.faceDetails === undefined || (!!appearance.faceDetails && typeof appearance.faceDetails === 'object' && !Array.isArray(appearance.faceDetails)
    && faceDetailEntries.length <= 4
    && faceDetailEntries.every(([kind, id]) => ['eye-highlight-left', 'eye-highlight-right', 'blush', 'facial-shadow'].includes(kind)
      && (id === null || typeof id === 'string' && validWardrobeId(id))))
  const linksValid = appearance.linkedSides === undefined || (!!appearance.linkedSides && typeof appearance.linkedSides === 'object' && !Array.isArray(appearance.linkedSides)
    && Object.entries(appearance.linkedSides).every(([kind, linked]) => ['eye', 'pupil', 'eyebrow'].includes(kind) && typeof linked === 'boolean'))
  const partColorsValid = appearance.partColors === undefined || (!!appearance.partColors && typeof appearance.partColors === 'object' && !Array.isArray(appearance.partColors)
    && Object.entries(appearance.partColors).every(([part, colors]) => ['eye-left', 'eye-right', 'brow-left', 'brow-right'].includes(part) && isHairColorMap(colors)))
  const hasSelection = Boolean(appearance.setId || catalogIds.some(Boolean)
    || componentEntries.some(([, component]) => component?.assetId)
    || faceDetailEntries.some(([, id]) => id)
    || headExtraEntries.some(([, id]) => Boolean(id))
    || appearance.mouthBlushEnabled !== undefined)

  return validModelSlot(appearance.modelSlot)
    && (appearance.setId === undefined || validWardrobeId(appearance.setId))
    && catalogIds.every((id) => id === undefined || id === null || validFaceCatalogId(id))
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
