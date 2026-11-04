import type { EditorV6ExperimentalPartFrame } from './editorV6PartMotionPrototype'

/**
 * R37 isolated body-piece raster backend. The caller owns Canvas creation,
 * decoding, source revision and tint. This is NOT a complete character renderer.
 * Never wire this to export until joint/skin/wardrobe/face/hair parity is proven.
 */
export type EditorV6PartImage = CanvasImageSource
export type EditorV6PartDecode = (sourceDataUrl: string, signal?: AbortSignal) => Promise<EditorV6PartImage>
export type EditorV6PartCanvasContext = Pick<CanvasRenderingContext2D,
  'save' | 'restore' | 'translate' | 'rotate' | 'drawImage' | 'clearRect'>
export type EditorV6PartCanvas = {
  width: number
  height: number
  getContext: () => EditorV6PartCanvasContext | null
}
export type EditorV6PartRenderMetrics = Readonly<{
  decodedImages: number
  reusedImages: number
  drawnParts: number
  skippedHiddenParts: number
}>
export type EditorV6PartRenderer = Readonly<{
  render: (frame: EditorV6ExperimentalPartFrame, canvas: EditorV6PartCanvas, signal?: AbortSignal) => Promise<EditorV6PartRenderMetrics>
  clear: () => void
  cachedSources: () => number
}>
const assertActive = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('R37: composition cancelled')
}
const validFrame = (frame: EditorV6ExperimentalPartFrame) =>
  Number.isSafeInteger(frame.width) && Number.isSafeInteger(frame.height) && frame.width > 0 && frame.height > 0
const validPart = (part: EditorV6ExperimentalPartFrame['parts'][number]) =>
  !!part.id && !!part.sourceDataUrl && [part.x, part.y, part.width, part.height, part.rotation].every(Number.isFinite)
  && part.width > 0 && part.height > 0

/**
 * Predecodes unique visible sources before touching the target. Failed decodes
 * leave the canvas unchanged. Draws the complete frame on success, including
 * clearing old pixels. Cache is per renderer instance and bounded by source
 * count, not global or persistent. Never caches frames or atlases.
 */
export function createEditorV6PartRasterRenderer(
  decode: EditorV6PartDecode,
  maxCachedSources = 32
): EditorV6PartRenderer {
  if (!Number.isSafeInteger(maxCachedSources) || maxCachedSources < 1 || maxCachedSources > 256) {
    throw new Error('R37: invalid image cache capacity')
  }
  const images = new Map<string, EditorV6PartImage>()
  const pending = new Map<string, Promise<EditorV6PartImage>>()
  let generation = 0
  const clear = () => { generation++; images.clear(); pending.clear() }
  const getImage = async (source: string, signal?: AbortSignal) => {
    const cached = images.get(source)
    if (cached) {
      images.delete(source)
      images.set(source, cached)
      return { image: cached, reused: true }
    }
    let task = pending.get(source)
    if (!task) {
      task = decode(source, signal)
      pending.set(source, task)
    }
    const version = generation
    try {
      const image = await task
      assertActive(signal)
      if (version === generation) {
        images.delete(source)
        images.set(source, image)
        while (images.size > maxCachedSources) images.delete(images.keys().next().value!)
      }
      return { image, reused: false }
    } finally {
      if (pending.get(source) === task) pending.delete(source)
    }
  }
  return {
    clear,
    cachedSources: () => images.size,
    async render(frame, canvas, signal) {
      assertActive(signal)
      if (!validFrame(frame) || !Array.isArray(frame.parts) || !frame.parts.every(validPart)) {
        throw new Error('R37: invalid frame geometry')
      }
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        throw new Error('R37: target size differs from source artwork')
      }
      const context = canvas.getContext()
      if (!context) throw new Error('R37: canvas 2D context unavailable')
      const visible = frame.parts.filter(part => part.visible)
      const resolved = new Map<string, EditorV6PartImage>()
      let decodedImages = 0, reusedImages = 0
      for (const part of visible) {
        assertActive(signal)
        if (resolved.has(part.sourceDataUrl)) { reusedImages++; continue }
        const wasCached = images.has(part.sourceDataUrl)
        const result = await getImage(part.sourceDataUrl, signal)
        resolved.set(part.sourceDataUrl, result.image)
        if (wasCached || result.reused) reusedImages++
        else decodedImages++
      }
      assertActive(signal)
      context.clearRect(0, 0, canvas.width, canvas.height)
      for (const part of visible) {
        context.save()
        try {
          context.translate(part.x + part.width / 2, part.y + part.height / 2)
          context.rotate(part.rotation * Math.PI / 180)
          context.drawImage(resolved.get(part.sourceDataUrl)!, -part.width / 2, -part.height / 2, part.width, part.height)
        } finally {
          context.restore()
        }
      }
      return { decodedImages, reusedImages, drawnParts: visible.length, skippedHiddenParts: frame.parts.length - visible.length }
    }
  }
}
