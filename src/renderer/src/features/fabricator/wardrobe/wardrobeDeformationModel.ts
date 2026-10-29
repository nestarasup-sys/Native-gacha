import type { WardrobeComponent } from '../../../../../shared/fabricator'

export type WardrobeDeformationPoint = { x: number; y: number }

export type WardrobeDeformationBounds = WardrobeDeformationPoint & {
  width: number
  height: number
  rotation: number
}

export type WardrobeDeformationImage = {
  width: number
  height: number
}

export type WardrobeDeformationSessionGeometry = {
  sourceUrl: string
  image: WardrobeDeformationImage
  committedPadding: number
}

export type WardrobeDeformationLayout = {
  bounds: WardrobeDeformationBounds
  padding: number
  scaleX: number
  scaleY: number
}

export function wardrobeWarpBaseBounds(
  component: WardrobeComponent,
  image: WardrobeDeformationImage,
  committedPadding: number,
  displayOffset: WardrobeDeformationPoint = { x: 0, y: 0 }
): WardrobeDeformationBounds {
  const outputWidth = image.width + committedPadding * 2
  const outputHeight = image.height + committedPadding * 2
  const scaleX = component.width / outputWidth
  const scaleY = component.height / outputHeight
  return {
    x: component.x + displayOffset.x + committedPadding * scaleX,
    y: component.y + displayOffset.y + committedPadding * scaleY,
    width: image.width * scaleX,
    height: image.height * scaleY,
    rotation: component.rotation
  }
}

/** Converts the temporary warp canvas geometry back into the persisted piece frame. */
export function createWardrobeDeformationPatch(
  component: WardrobeComponent,
  session: WardrobeDeformationSessionGeometry,
  layout: WardrobeDeformationLayout,
  displayOffset: WardrobeDeformationPoint,
  imageUrl: string
): Partial<WardrobeComponent> {
  const { width: imageWidth, height: imageHeight } = session.image
  const oldPadding = session.committedPadding
  const { padding, scaleX, scaleY } = layout
  const originWidth = component.originWidth ?? component.width
  const originHeight = component.originHeight ?? component.height
  const originScaleX = originWidth / (imageWidth + oldPadding * 2)
  const originScaleY = originHeight / (imageHeight + oldPadding * 2)
  const originBaseX = (component.originX ?? component.x) + oldPadding * originScaleX
  const originBaseY = (component.originY ?? component.y) + oldPadding * originScaleY
  const originalFrame = component.hasDeformationOriginal && component.deformationOriginalFrame
    ? component.deformationOriginalFrame
    : {
      x: component.x,
      y: component.y,
      width: component.width,
      height: component.height,
      originX: component.originX,
      originY: component.originY,
      originWidth: component.originWidth,
      originHeight: component.originHeight
    }

  return {
    dataUrl: imageUrl,
    hasDeformationOriginal: true,
    deformationOriginalDataUrl: component.deformationOriginalDataUrl ?? session.sourceUrl,
    deformationOriginalFrame: originalFrame,
    isDeformed: true,
    x: layout.bounds.x - padding * scaleX - displayOffset.x,
    y: layout.bounds.y - padding * scaleY - displayOffset.y,
    width: (imageWidth + padding * 2) * scaleX,
    height: (imageHeight + padding * 2) * scaleY,
    originX: originBaseX - padding * originScaleX,
    originY: originBaseY - padding * originScaleY,
    originWidth: (imageWidth + padding * 2) * originScaleX,
    originHeight: (imageHeight + padding * 2) * originScaleY
  }
}

export function createWardrobeRestorationPatch(component: WardrobeComponent): Partial<WardrobeComponent> | null {
  if (!component.isDeformed || !component.deformationOriginalDataUrl) return null
  const frame = component.deformationOriginalFrame
  return {
    dataUrl: component.deformationOriginalDataUrl,
    isDeformed: false,
    ...(frame ? {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      originX: frame.originX,
      originY: frame.originY,
      originWidth: frame.originWidth,
      originHeight: frame.originHeight
    } : {})
  }
}
