import type { StudioElement } from '../../../shared/studio'
import type { TrimmedImage } from './transparentImageTrim'

export function faceRenderGeometry(
  element: StudioElement,
  rendered: { width: number; height: number },
  crop: Pick<TrimmedImage, 'width' | 'height' | 'left' | 'top'> | null,
  stageWidth: number,
  stageHeight: number,
  previousCrop?: Pick<TrimmedImage, 'width' | 'height' | 'left' | 'top'> | null
) {
  const cropWidth = crop?.width ?? rendered.width
  const cropHeight = crop?.height ?? rendered.height
  const characterCanvasWidth = element.characterCanvasWidth ?? element.width * rendered.width / Math.max(1, cropWidth)
  const geometry = {
    characterCanvasWidth,
    width: characterCanvasWidth * cropWidth / rendered.width,
    height: characterCanvasWidth * stageWidth / Math.max(1, stageHeight) * cropHeight / rendered.width
  }
  if (previousCrop === undefined) return geometry

  const overall = (element.characterScale ?? 100) / 100
  const scaleX = characterCanvasWidth * overall * (element.characterWidthScale ?? 100) / 100 / Math.max(1, rendered.width)
  const scaleY = characterCanvasWidth * Math.max(1, stageWidth) / Math.max(1, stageHeight) * overall * (element.characterHeightScale ?? 100) / 100 / Math.max(1, rendered.width)
  const cropCenterX = (crop?.left ?? 0) + cropWidth / 2
  const cropCenterY = (crop?.top ?? 0) + cropHeight / 2
  const previousCenterX = (previousCrop?.left ?? 0) + (previousCrop?.width ?? rendered.width) / 2
  const previousCenterY = (previousCrop?.top ?? 0) + (previousCrop?.height ?? rendered.height) / 2
  const radians = element.rotation * Math.PI / 180
  const deltaX = (cropCenterX - previousCenterX) * scaleX * (element.flipX ? -1 : 1) * 19.2
  const deltaY = (cropCenterY - previousCenterY) * scaleY * 10.8
  return {
    ...geometry,
    x: element.x + (deltaX * Math.cos(radians) - deltaY * Math.sin(radians)) / 19.2,
    y: element.y + (deltaX * Math.sin(radians) + deltaY * Math.cos(radians)) / 10.8
  }
}


export function fitElementToTrim(element: StudioElement, crop: TrimmedImage): StudioElement {
  const offsetX = ((crop.left + crop.width / 2) / crop.sourceWidth - 0.5) * element.width * (element.flipX ? -1 : 1)
  const offsetY = ((crop.top + crop.height / 2) / crop.sourceHeight - 0.5) * element.height
  const radians = element.rotation * Math.PI / 180
  const x = offsetX * Math.cos(radians) - offsetY * (9 / 16) * Math.sin(radians)
  const y = offsetX * (16 / 9) * Math.sin(radians) + offsetY * Math.cos(radians)
  return {
    ...element,
    x: element.x + x,
    y: element.y + y,
    width: element.width * crop.width / crop.sourceWidth,
    height: element.height * crop.height / crop.sourceHeight
  }
}
