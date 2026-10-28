export type ChromaAdjustRequest = {
  id: number
  sourceDataUrl: string
  tolerance: number
  parts: Array<{ id: string; dataUrl: string }>
}

export type AdjustedChromaPart = { id: string; png: ArrayBuffer }

export type ChromaAdjustMessage =
  | { type: 'complete'; id: number; parts: AdjustedChromaPart[] }
  | { type: 'error'; id: number; message: string }
