import type { EditorV7Document } from './editorV7'
import { resolveEditorV7Scene } from './editorV7'

const number = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(5)))
const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

function editorV7TextContents(layer: { text: string; textKind?: 'plain' | 'speech' | 'thought'; textColor?: string; speakerName?: string }, width: number, height: number): string {
  const kind = layer.textKind ?? 'plain'
  const shape = kind === 'thought'
    ? `<ellipse cx="${number(width / 2)}" cy="${number(height / 2)}" rx="${number(width / 2)}" ry="${number(height / 2)}" fill="#fffafd" stroke="#624d5b" stroke-width="2"/><circle cx="${number(width * .82)}" cy="${number(height * .88)}" r="7" fill="#fffafd" stroke="#624d5b" stroke-width="2"/>`
    : kind === 'speech' ? `<rect x="1" y="1" width="${number(width - 2)}" height="${number(height - 2)}" rx="12" fill="#ffffff" fill-opacity=".96" stroke="#624d5b" stroke-width="2"/>` : ''
  const fontSize = Math.max(8, Math.min(32, height * .3, width / 2)), lineHeight = fontSize * 1.22
  const speaker = layer.speakerName?.trim()
  const speakerSize = speaker ? Math.max(7, fontSize * .58) : 0
  const maxLines = Math.max(1, Math.floor((height - (speaker ? speakerSize + 28 : 18)) / lineHeight))
  const maxTextWidth = Math.max(1, width - 32), measure = (value: string) => Array.from(value).length * fontSize * .55
  const lines: string[] = []; let overflow = false
  const push = (value: string) => { if (lines.length < maxLines) lines.push(value); else overflow = true }
  for (const paragraph of layer.text.replace(/\r/g, '').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`) <= maxTextWidth) { line += ` ${word}`; continue }
      if (line) { push(line); line = '' }
      for (const char of Array.from(word)) { if (line && measure(line + char) > maxTextWidth) { push(line); line = '' } line += char }
    }
    push(line)
  }
  if (overflow && lines.length) {
    let last = lines[lines.length - 1]
    while (last && measure(`${last}…`) > maxTextWidth) last = Array.from(last).slice(0, -1).join('')
    lines[lines.length - 1] = `${last}…`
  }
  const bodyStart = speaker ? -height / 2 + 12 + speakerSize + lineHeight * .5 : height / 2 - (lines.length - 1) * lineHeight / 2
  const speakerLabel = speaker ? `<text x="${number(width / 2)}" y="${number(-height / 2 + 8 + speakerSize / 2)}" font-family="Arial, sans-serif" font-size="${number(speakerSize)}" font-weight="750" text-anchor="middle" dominant-baseline="middle" fill="#624d5b">${escapeXml(speaker)}</text>` : ''
  const text = lines.map((line, index) => `<text x="${number(width / 2)}" y="${number(bodyStart + index * lineHeight)}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${number(fontSize)}" font-weight="600" fill="${layer.textColor ?? '#352d35'}">${escapeXml(line)}</text>`).join('')
  return `${shape}${speakerLabel}${text}`
}

export function renderEditorV7TextLayerSvg(layer: { text: string; textKind?: 'plain' | 'speech' | 'thought'; textColor?: string; speakerName?: string }, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}" height="${number(height)}" viewBox="0 0 ${number(width)} ${number(height)}">${editorV7TextContents(layer, width, height)}</svg>`
}

/** Canonical scene drawing description used by both the V7 preview and native raster backend. */
export function renderEditorV7SceneSvg(document: EditorV7Document, tick: number): string {
  const scene = resolveEditorV7Scene(document, tick)
  const layers = scene.layers.map((layer) => {
    const { asset, transform } = layer
    const centerX = transform.x + transform.width / 2
    const centerY = transform.y + transform.height / 2
    const rotation = transform.rotation ? ` rotate(${number(transform.rotation)} ${number(centerX)} ${number(centerY)})` : ''
    const flip = transform.flipX ? ` translate(${number(centerX * 2)} 0) scale(-1 1)` : ''
    if (layer.text !== undefined) {
      const x = transform.x, y = transform.y, width = transform.width, height = transform.height
      const localRotation = transform.rotation ? `rotate(${number(transform.rotation)} ${number(width / 2)} ${number(height / 2)})` : ''
      const localFlip = transform.flipX ? `translate(${number(width)} 0) scale(-1 1)` : ''
      return `<g opacity="${number(transform.opacity)}" transform="translate(${number(x)} ${number(y)}) ${localRotation} ${localFlip}">${editorV7TextContents({ ...layer, text: layer.text }, width, height)}</g>`
    }
    if (!asset) throw new Error(`Camada de imagem ${layer.id} sem asset.`)
    return `<image href="${asset.dataUrl}" x="${number(transform.x)}" y="${number(transform.y)}" width="${number(transform.width)}" height="${number(transform.height)}" opacity="${number(transform.opacity)}" preserveAspectRatio="${layer.preserveAspectRatio ?? 'none'}" transform="${(rotation + flip).trim()}"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${document.width}" height="${document.height}" viewBox="0 0 ${document.width} ${document.height}"><rect width="100%" height="100%" fill="${scene.background}"/>${layers}</svg>`
}
