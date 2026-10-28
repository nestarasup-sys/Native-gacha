import type { WardrobeComponent } from '../../../../../shared/fabricator'

export type WardrobeProcessorRequest = {
  id: number
  dataUrl: string
  normalizeTo?: { width: number; height: number }
}

export type WardrobeProcessorPiece = Pick<WardrobeComponent, 'id' | 'name' | 'x' | 'y' | 'width' | 'height'> & {
  png: ArrayBuffer
}

export type WardrobeProcessorResponse =
  | { type: 'complete'; id: number; width: number; height: number; pieces: WardrobeProcessorPiece[] }
  | { type: 'error'; id: number; message: string }
