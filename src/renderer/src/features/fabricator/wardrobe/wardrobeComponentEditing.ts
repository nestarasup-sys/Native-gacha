import type { FabricatorProject, WardrobeCategory, WardrobeComponent } from '../../../../../shared/fabricator'
import { editWardrobeGlue } from '../../../../../shared/wardrobeGlue'
import { suggestWardrobeBone } from './boneSelection'
import { guessWardrobeCategoryForBone, guessWardrobeNameForBone } from './wardrobeAutoDetection'

/** Applies catalog inference and attachment invariants without mutating the draft. */
export function applyWardrobeComponentEdit(
  component: WardrobeComponent,
  values: Partial<WardrobeComponent>,
  referenceModel: FabricatorProject | null,
  sheetWidth: number
): WardrobeComponent {
  const updated = { ...component, ...values }
  if (values.category && values.category !== 'oculos' && values.category !== 'acessorio-cabeca') {
    updated.renderAboveHair = false
  }

  if (values.attachedPartId !== undefined
    && values.attachedPartId !== component.attachedPartId
    && referenceModel) {
    const bone = referenceModel.parts.find((part) => part.id === values.attachedPartId)
    if (bone) {
      const category = guessWardrobeCategoryForBone(bone, component.category)
      if (category) {
        updated.category = category
        updated.name = guessWardrobeNameForBone(category, bone, referenceModel)
        if (category !== 'oculos' && category !== 'acessorio-cabeca') updated.renderAboveHair = false
      }
    }
  }

  if ((values.category === 'sapato' || values.category === 'luvas')
    && values.attachedPartId === undefined
    && referenceModel) {
    const target = suggestWardrobeBone(
      values.category as WardrobeCategory,
      updated.x + updated.width / 2,
      sheetWidth,
      referenceModel
    ).bone
    updated.attachedPartId = target?.id ?? ''
    if (!target) updated.binding = undefined
  }

  const sourceBone = referenceModel?.parts.find((part) => part.id === updated.attachedPartId)
  return editWardrobeGlue(component, updated, sourceBone)
}

export function nudgeWardrobeComponent(
  component: WardrobeComponent,
  dx: number,
  dy: number
): Pick<WardrobeComponent, 'x' | 'y'> {
  return { x: component.x + dx, y: component.y + dy }
}

export function resizeWardrobeComponent(
  component: WardrobeComponent,
  factor: number
): Pick<WardrobeComponent, 'originX' | 'originY' | 'originWidth' | 'originHeight' | 'x' | 'y' | 'width' | 'height'> {
  const width = component.width * factor
  const height = component.height * factor
  return {
    originX: component.originX ?? component.x,
    originY: component.originY ?? component.y,
    originWidth: component.originWidth ?? component.width,
    originHeight: component.originHeight ?? component.height,
    x: component.x + (component.width - width) / 2,
    y: component.y + (component.height - height) / 2,
    width,
    height
  }
}

export function scaleWardrobeComponentAxis(
  component: WardrobeComponent,
  axis: 'width' | 'height',
  value: number,
  lockAspectRatio: boolean
): Pick<WardrobeComponent, 'originX' | 'originY' | 'originWidth' | 'originHeight' | 'x' | 'y' | 'width' | 'height'> | null {
  if (!Number.isFinite(value)) return null
  const originWidth = component.originWidth ?? component.width
  const originHeight = component.originHeight ?? component.height
  const centerX = component.x + component.width / 2
  const centerY = component.y + component.height / 2
  const ratio = value / (axis === 'width' ? originWidth : originHeight)
  const width = axis === 'width' ? value : lockAspectRatio ? originWidth * ratio : component.width
  const height = axis === 'height' ? value : lockAspectRatio ? originHeight * ratio : component.height
  return {
    originX: component.originX ?? component.x,
    originY: component.originY ?? component.y,
    originWidth,
    originHeight,
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  }
}

export function restoreWardrobeComponentOrigin(
  component: WardrobeComponent
): Pick<WardrobeComponent, 'x' | 'y' | 'width' | 'height' | 'rotation'> {
  return {
    x: component.originX ?? component.x,
    y: component.originY ?? component.y,
    width: component.originWidth ?? component.width,
    height: component.originHeight ?? component.height,
    rotation: 0
  }
}
