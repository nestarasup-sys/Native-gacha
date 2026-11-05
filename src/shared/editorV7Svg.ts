import type { EditorV7Document } from './editorV7'
import { resolveEditorV7Scene } from './editorV7'

const number = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(5)))

/** Canonical scene drawing description used by both the V7 preview and native raster backend. */
export function renderEditorV7SceneSvg(document: EditorV7Document, tick: number): string {
  const scene = resolveEditorV7Scene(document, tick)
  const layers = scene.layers.map((layer) => {
    const { asset, transform } = layer
    const centerX = transform.x + transform.width / 2
    const centerY = transform.y + transform.height / 2
    const rotation = transform.rotation ? ` rotate(${number(transform.rotation)} ${number(centerX)} ${number(centerY)})` : ''
    const flip = transform.flipX ? ` translate(${number(centerX * 2)} 0) scale(-1 1)` : ''
    return `<image href="${asset.dataUrl}" x="${number(transform.x)}" y="${number(transform.y)}" width="${number(transform.width)}" height="${number(transform.height)}" opacity="${number(transform.opacity)}" preserveAspectRatio="${layer.preserveAspectRatio ?? 'none'}" transform="${(rotation + flip).trim()}"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${document.width}" height="${document.height}" viewBox="0 0 ${document.width} ${document.height}"><rect width="100%" height="100%" fill="${scene.background}"/>${layers}</svg>`
}
