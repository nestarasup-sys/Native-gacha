/**
 * Creates the same 2D canvas surface for the normal renderer and its isolated
 * Worker prototype. Main-thread callers keep using HTMLCanvasElement; a
 * DedicatedWorkerGlobalScope has no document and receives OffscreenCanvas.
 */
export function createCharacterCanvas(): HTMLCanvasElement {
  if (typeof document !== 'undefined') return document.createElement('canvas')
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(1, 1) as unknown as HTMLCanvasElement
  }
  throw new Error('Canvas 2D indisponível neste ambiente.')
}

export function isCharacterCanvasWorker(): boolean {
  return typeof document === 'undefined' && typeof OffscreenCanvas !== 'undefined'
}
