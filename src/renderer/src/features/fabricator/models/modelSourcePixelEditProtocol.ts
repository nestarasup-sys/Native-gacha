import type { ModelSourcePixelPoint } from './modelSourcePixelOperations'

type PartInput = { width: number; height: number; displayDataUrl: string; baseDataUrl: string }
type SharedRequest = { id: number; part: PartInput }

export type ModelSourcePixelEditRequest = SharedRequest & (
  | { operation: 'brush'; points: ModelSourcePixelPoint[]; size: number; outlineOnly: boolean }
  | { operation: 'remove-color'; color: string; tolerance: number }
)

export type ModelSourcePixelEditMessage =
  | { type: 'complete'; id: number; displayPng: ArrayBuffer; basePng: ArrayBuffer; removedPixels: number }
  | { type: 'error'; id: number; message: string }
