import type { VideoCharacterState } from '../../../../shared/studio'

/**
 * Export-surface-only raster. Never serialize it into StudioDocument v1:
 * an independent canvas snapshot replaces the per-expression PNG round-trip.
 */
export type VideoGachaCanvasState = VideoCharacterState & Readonly<{
  canvasImage?: HTMLCanvasElement | ImageBitmap
}>

export type VideoGachaCanvasRaster = Readonly<{
  canvas: HTMLCanvasElement | ImageBitmap
  width: number
  height: number
  crop: Readonly<{ width: number; height: number }> | null
}>

/**
 * Same alpha threshold and bounding-box semantics as trimTransparentImage,
 * but reads from the rendered Canvas directly, without encoding PNG/loading
 * Image to compute the bounds. Failure to read pixels leaves full canvas.
 */
export function snapshotTrimmedGachaCanvas(source: HTMLCanvasElement): VideoGachaCanvasRaster {
  if (!source.width || !source.height) throw new Error('Canvas de personagem vazio.')
  let left = 0, top = 0, width = source.width, height = source.height
  let crop: VideoGachaCanvasRaster['crop'] = null
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (sourceContext) {
    try {
      const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data
      let minX = source.width, minY = source.height, maxX = -1, maxY = -1
      for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
          if (pixels[(y * source.width + x) * 4 + 3] <= 8) continue
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
      if (maxX >= minX && maxY >= minY) {
        const croppedWidth = maxX - minX + 1
        const croppedHeight = maxY - minY + 1
        if (minX || minY || croppedWidth !== source.width || croppedHeight !== source.height) {
          left = minX; top = minY; width = croppedWidth; height = croppedHeight
          crop = { width, height }
        }
      }
    } catch {
      // Browser may disallow readback from a tainted canvas: use full source
      // rather than manufacturing invalid geometry or silently dropping it.
    }
  }
  // This snapshot must not share the mutable source canvas of a prepared rig.
  // Later mouth/blink renders repaint that source before the cached state expires.
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas de snapshot Gacha indisponível.')
  context.drawImage(source, left, top, width, height, 0, 0, width, height)
  return { canvas, width: source.width, height: source.height, crop }
}

/**
 * During interactive playback the expensive RGBA scan/crop runs inside a
 * dedicated Web Worker, not React's renderer thread. Falls back to the
 * production synchronous path if workers/OffscreenCanvas are unavailable.
 * Export remains deterministic and uses snapshotTrimmedGachaCanvas.
 */
export async function snapshotTrimmedPreviewGachaCanvas(
  source: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<VideoGachaCanvasRaster> {
  signal?.throwIfAborted()
  try {
    const { cropGachaCanvasInWorker } = await import('./previewCanvasWorkerClient')
    const cropped = await cropGachaCanvasInWorker(source, signal)
    signal?.throwIfAborted()
    return cropped
  } catch (error) {
    if (signal?.aborted) throw error
    return snapshotTrimmedGachaCanvas(source)
  }
}
