import type { ModelPart } from '../../../../../shared/fabricator'

export type ModelSourceDimensions = Record<string, { width: number; height: number; x?: number; y?: number }>

export function sourceRect(part: ModelPart, dimensions?: ModelSourceDimensions[string]) {
  return {
    x: dimensions?.x ?? part.sourceTransform?.x ?? part.x,
    y: dimensions?.y ?? part.sourceTransform?.y ?? part.y,
    width: dimensions?.width ?? part.sourceTransform?.width ?? part.width,
    height: dimensions?.height ?? part.sourceTransform?.height ?? part.height
  }
}
