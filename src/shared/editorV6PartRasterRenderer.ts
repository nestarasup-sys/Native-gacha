import type { EditorV6ExperimentalPartFrame } from './editorV6PartMotionPrototype'

/**
 * R37 isolated body-piece raster backend. The caller owns Canvas creation,
 * decoding, source revision and tint. This is NOT a complete character renderer.
 * Never wire this to export until joint/skin/wardrobe/face/hair parity is proven.
 */
/**
 * Precomposed visual layers are an experimental bridge toward the real Gacha
 * compositor. The assets are supplied by the caller; this backend does NOT
 * synthesize tint, deform clothes, draw joints, or animate hair physics.
 * Drawing them in explicit stages avoids flattening transparent overlays into
 * the body sprites while those operators are built and checked independently.
 */
export type EditorV6PartOverlayStage = 'behind-body' | 'over-body' | 'face' | 'front-hair'
export type EditorV6PartOverlayCommand = Readonly<{
  id: string
  sourceDataUrl: string
  stage: EditorV6PartOverlayStage
  visible: boolean
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity?: number
  flipX?: boolean
  flipY?: boolean
}>
export type EditorV6LayeredPartFrame = EditorV6ExperimentalPartFrame & Readonly<{
  overlays?: readonly EditorV6PartOverlayCommand[]
}>
export type EditorV6PartImage = CanvasImageSource
export type EditorV6PartDecode = (sourceDataUrl: string, signal?: AbortSignal) => Promise<EditorV6PartImage>
export type EditorV6PartCanvasContext = Pick<CanvasRenderingContext2D,
  'save' | 'restore' | 'translate' | 'rotate' | 'scale' | 'drawImage' | 'clearRect' | 'globalAlpha'>
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
  drawnOverlays?: number
  skippedHiddenOverlays?: number
}>
export type EditorV6PartRenderer = Readonly<{
  render: (frame: EditorV6LayeredPartFrame, canvas: EditorV6PartCanvas, signal?: AbortSignal) => Promise<EditorV6PartRenderMetrics>
  clear: () => void
  cachedSources: () => number
}>
const assertActive = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('R37: composition cancelled')
}
const validFrame = (frame: EditorV6ExperimentalPartFrame) =>
  Number.isFinite(frame.progress) && frame.progress >= 0 && frame.progress <= 1 &&
  Number.isSafeInteger(frame.width) && Number.isSafeInteger(frame.height) && frame.width > 0 && frame.height > 0
const validPart = (part: EditorV6ExperimentalPartFrame['parts'][number]) =>
  part !== null && typeof part === 'object' &&
  typeof part.id === 'string' && part.id.length > 0 &&
  typeof part.sourceDataUrl === 'string' && part.sourceDataUrl.length > 0 &&
  typeof part.visible === 'boolean' && Number.isSafeInteger(part.order) && part.order >= 0 &&
  [part.x, part.y, part.width, part.height, part.rotation].every(Number.isFinite) &&
  part.width > 0 && part.height > 0
const overlayStages: readonly EditorV6PartOverlayStage[] = ['behind-body', 'over-body', 'face', 'front-hair']
const validOverlay = (layer: EditorV6PartOverlayCommand) =>
  layer !== null && typeof layer === 'object' &&
  typeof layer.id === 'string' && layer.id.length > 0 &&
  typeof layer.sourceDataUrl === 'string' && layer.sourceDataUrl.length > 0 &&
  overlayStages.includes(layer.stage) && typeof layer.visible === 'boolean' &&
  [layer.x, layer.y, layer.width, layer.height, layer.rotation].every(Number.isFinite) &&
  layer.width > 0 && layer.height > 0 &&
  (layer.opacity === undefined || (Number.isFinite(layer.opacity) && layer.opacity >= 0 && layer.opacity <= 1)) &&
  (layer.flipX === undefined || typeof layer.flipX === 'boolean') &&
  (layer.flipY === undefined || typeof layer.flipY === 'boolean')

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
    assertActive(signal)
    const cached = images.get(source)
    if (cached) {
      images.delete(source)
      images.set(source, cached)
      return { image: cached, reused: true }
    }
    const version = generation
    let task = pending.get(source)
    const createdTask = !task
    if (!task) {
      // A shared decode must not be owned by any one caller's AbortSignal.
      // Cancellation is checked per consumer after awaiting the shared task.
      task = Promise.resolve().then(() => decode(source))
      pending.set(source, task)
    }
    try {
      const image = await task
      assertActive(signal)
      if (version !== generation) throw new Error('R37: source cache invalidated during decode')
      images.delete(source)
      images.set(source, image)
      while (images.size > maxCachedSources) images.delete(images.keys().next().value!)
      return { image, reused: !createdTask }
    } finally {
      if (pending.get(source) === task) pending.delete(source)
    }
  }
  return {
    clear,
    cachedSources: () => images.size,
    async render(frame, canvas, signal) {
      assertActive(signal)
      const overlays = frame.overlays ?? []
      if (!validFrame(frame) || !Array.isArray(frame.parts) || !frame.parts.every(validPart) ||
        new Set(frame.parts.map(part => part.id)).size !== frame.parts.length ||
        !Array.isArray(overlays) || !overlays.every(validOverlay) ||
        new Set([...frame.parts.map(part => part.id), ...overlays.map(layer => layer.id)]).size !== frame.parts.length + overlays.length) {
        throw new Error('R37: invalid frame geometry')
      }
      if (canvas.width !== frame.width || canvas.height !== frame.height) {
        throw new Error('R37: target size differs from source artwork')
      }
      const context = canvas.getContext()
      if (!context) throw new Error('R37: canvas 2D context unavailable')
      const visible = frame.parts.filter(part => part.visible)
      const visibleOverlays = overlays.filter(layer => layer.visible)
      const sources = [...new Set([...visible, ...visibleOverlays].map(item => item.sourceDataUrl))]
      const resolved = new Map<string, EditorV6PartImage>()
      let decodedImages = 0, reusedImages = 0
      // Decode several independent images together without creating an
      // unbounded decode storm on characters with many accessories.
      // Completion is required before the first pixel of the target changes.
      let next = 0
      const decodeNext = async () => {
        while (next < sources.length) {
          assertActive(signal)
          const source = sources[next++]
          const { image, reused } = await getImage(source, signal)
          resolved.set(source, image)
          if (reused) reusedImages++
          else decodedImages++
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, sources.length) }, () => decodeNext()))
      reusedImages += visible.length + visibleOverlays.length - sources.length
      // Cancellation is checked immediately before the first canvas mutation.
      // Once drawing starts it must finish synchronously: aborting between
      // clearRect and the last part would leave a partially composed frame.
      assertActive(signal)
      const paint = (item: EditorV6PartOverlayCommand | EditorV6ExperimentalPartFrame['parts'][number]) => {
        context.save()
        try {
          context.translate(item.x + item.width / 2, item.y + item.height / 2)
          context.rotate(item.rotation * Math.PI / 180)
          if ('stage' in item) {
            context.globalAlpha = item.opacity ?? 1
            if (item.flipX || item.flipY) context.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1)
          }
          context.drawImage(resolved.get(item.sourceDataUrl)!, -item.width / 2, -item.height / 2, item.width, item.height)
        } finally {
          context.restore()
        }
      }
      context.clearRect(0, 0, canvas.width, canvas.height)
      for (const layer of visibleOverlays) if (layer.stage === 'behind-body') paint(layer)
      for (const part of visible) paint(part)
      for (const stage of ['over-body', 'face', 'front-hair'] as const) {
        for (const layer of visibleOverlays) if (layer.stage === stage) paint(layer)
      }
      return {
        decodedImages, reusedImages, drawnParts: visible.length,
        skippedHiddenParts: frame.parts.length - visible.length,
        ...(overlays.length ? {
          drawnOverlays: visibleOverlays.length,
          skippedHiddenOverlays: overlays.length - visibleOverlays.length
        } : {})
      }
    }
  }
}
