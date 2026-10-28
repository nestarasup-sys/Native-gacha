export type ImageProcessorRequest = {
  id: number
  sourceDataUrl: string
  tolerance: number
}

export type ProcessedImagePart = {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  png: ArrayBuffer
  basePng: ArrayBuffer
}

export type ImageProcessorMessage =
  | { type: 'progress'; id: number; value: number }
  | { type: 'complete'; id: number; width: number; height: number; parts: ProcessedImagePart[] }
  | { type: 'error'; id: number; message: string }
