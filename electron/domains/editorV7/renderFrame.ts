import sharp from 'sharp'
import { resolveEditorV7Scene, type EditorV7Document, type EditorV7ResolvedLayer } from '../../../src/shared/editorV7'
import { renderEditorV7SceneSvg, renderEditorV7TextLayerSvg } from '../../../src/shared/editorV7Svg'

/** Rasterizes the canonical V7 SVG scene through libvips, without a DOM, WebContents, IPC-per-frame, or GPU readback. */
export async function renderEditorV7Frame(document: EditorV7Document, tick: number, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted()
  const svg = renderEditorV7SceneSvg(document, tick)
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 })
    .resize(document.width, document.height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  signal?.throwIfAborted()
  if (info.width !== document.width || info.height !== document.height || info.channels !== 4) throw new Error('O renderer V7 produziu um frame com formato ou dimensões inesperados.')
  return data
}

export function createEditorV7FrameRenderer(document: EditorV7Document) {
  const assets = new Map(document.assets.map((asset) => [asset.id, Buffer.from(asset.dataUrl.slice(asset.dataUrl.indexOf(',') + 1), 'base64')]))
  const cache = new Map<string, Promise<{ buffer: Buffer; width: number; height: number }>>()
  const maxCacheBytes = 96 * 1024 * 1024
  let cacheBytes = 0

  const overlayFor = async (layer: EditorV7ResolvedLayer) => {
    if (!layer.assetId && layer.text === undefined) throw new Error(`Camada ${layer.id} não contém imagem nem texto.`)
    const { transform } = layer
    const width = Math.max(1, Math.round(transform.width)), height = Math.max(1, Math.round(transform.height))
    const key = JSON.stringify([layer.assetId, layer.text, layer.textKind, layer.textColor, layer.speakerName, width, height, transform.rotation, transform.flipX, transform.opacity, layer.preserveAspectRatio ?? 'none'])
    let task = cache.get(key)
    let created = false
    if (task) {
      cache.delete(key); cache.set(key, task)
    } else {
      if (layer.text === undefined && !layer.assetId) throw new Error(`A camada ${layer.id} não contém imagem nem texto.`)
      const source = layer.assetId ? assets.get(layer.assetId) : undefined
      if (layer.assetId && !source) throw new Error(`O asset ${layer.assetId} não está disponível no renderer V7.`)
      task = (async () => {
        const fit = layer.preserveAspectRatio === 'xMidYMid meet' ? 'contain' : 'fill'
        const input = layer.text !== undefined ? Buffer.from(renderEditorV7TextLayerSvg({ ...layer, text: layer.text }, width, height)) : source!
        const resized = await sharp(input).resize(width, height, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .rotate(transform.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .flop(transform.flipX)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
        if (transform.opacity < 1) for (let offset = 3; offset < resized.data.length; offset += 4) resized.data[offset] = Math.round(resized.data[offset] * transform.opacity)
        const buffer = await sharp(resized.data, { raw: { width: resized.info.width, height: resized.info.height, channels: 4 } }).png().toBuffer()
        return { buffer, width: resized.info.width, height: resized.info.height }
      })()
      cache.set(key, task)
      created = true
    }
    try {
      const result = await task
      if (created) cacheBytes += result.buffer.length
      while (created && cacheBytes > maxCacheBytes && cache.size > 1) {
        const oldest = cache.keys().next().value as string
        if (oldest === key && cache.size === 1) break
        const removed = await cache.get(oldest)?.catch(() => undefined)
        cache.delete(oldest)
        if (removed) cacheBytes -= removed.buffer.length
      }
      return result
    } catch (error) { cache.delete(key); throw error }
  }

  return async (tick: number, signal?: AbortSignal): Promise<Buffer> => {
    signal?.throwIfAborted()
    const scene = resolveEditorV7Scene(document, tick)
    const composites = await Promise.all(scene.layers.map(async (layer) => {
      const overlay = await overlayFor(layer)
      const rawLeft = Math.round(layer.transform.x + (layer.transform.width - overlay.width) / 2)
      const rawTop = Math.round(layer.transform.y + (layer.transform.height - overlay.height) / 2)
      const left = Math.max(0, rawLeft), top = Math.max(0, rawTop)
      const cropLeft = left - rawLeft, cropTop = top - rawTop
      const width = Math.min(overlay.width - cropLeft, document.width - left)
      const height = Math.min(overlay.height - cropTop, document.height - top)
      if (width <= 0 || height <= 0) return null
      const input = cropLeft || cropTop || width !== overlay.width || height !== overlay.height
        ? await sharp(overlay.buffer).extract({ left: cropLeft, top: cropTop, width, height }).png().toBuffer()
        : overlay.buffer
      return { input, left, top }
    })).then((items) => items.filter((item): item is NonNullable<typeof item> => item !== null))
    signal?.throwIfAborted()
    const canvas = sharp({ create: { width: document.width, height: document.height, channels: 4, background: scene.background } })
    if (composites.length) canvas.composite(composites)
    const { data, info } = await canvas.raw().toBuffer({ resolveWithObject: true })
    signal?.throwIfAborted()
    if (info.width !== document.width || info.height !== document.height || info.channels !== 4) throw new Error('O renderer V7 produziu um frame com formato ou dimensões inesperados.')
    return data
  }
}
