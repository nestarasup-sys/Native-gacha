import type { EditorV6Element } from '../../../../shared/editorV6'

type Crop = { left: number; top: number; width: number; height: number }

/** Expand a displayed crop into full artwork without changing either displayed scale. */
export function expandEditorV6HairCrop(element: Pick<EditorV6Element, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX' | 'characterScale' | 'characterWidthScale' | 'characterHeightScale'>, full: { width: number; height: number }, crop: Crop) {
  const overall = (element.characterScale ?? 100) / 100
  const dx = (full.width / 2 - crop.left - crop.width / 2) * element.width / crop.width * overall * (element.characterWidthScale ?? 100) / 100 * 19.2 * (element.flipX ? -1 : 1)
  const dy = (full.height / 2 - crop.top - crop.height / 2) * element.height / crop.height * overall * (element.characterHeightScale ?? 100) / 100 * 10.8
  const radians = element.rotation * Math.PI / 180
  return {
    x: element.x + (dx * Math.cos(radians) - dy * Math.sin(radians)) / 19.2,
    y: element.y + (dx * Math.sin(radians) + dy * Math.cos(radians)) / 10.8,
    width: element.width * full.width / crop.width,
    height: element.height * full.height / crop.height
  }
}
