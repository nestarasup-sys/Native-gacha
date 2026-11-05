import { createEditorV6PartRasterRenderer, type EditorV6PartOverlayCommand } from '../../src/shared/editorV6PartRasterRenderer'

/**
 * Isolated 30-frame visual comparison against an independent Canvas reference.
 * Covers transparent precomposed body/wardrobe/face/hair assets only. This is
 * deliberately NOT proof of source-rig skin, joints or real character parity.
 */
export async function runR37LayeredParity() {
  const makeCanvas = (width = 96, height = 96) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  const sources = ['body', 'rear', 'shirt', 'face', 'fringe'] as const
  const colors = ['#f4bc80', '#9a72d0', '#208fc4', '#f04b71', '#f6d446']
  const urls = new Map<string, string>()
  for (let i = 0; i < sources.length; i++) {
    const canvas = makeCanvas(20, 20), ctx = canvas.getContext('2d')!
    ctx.fillStyle = colors[i]
    ctx.fillRect(0, 0, 20, 20)
    ctx.clearRect(3, 5, 7, 6)
    ctx.globalAlpha = 0.5
    ctx.fillRect(6, 6, 11, 10)
    urls.set(sources[i], canvas.toDataURL('image/png'))
  }
  let decodes = 0
  const decode = async (url: string) => {
    decodes++
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  }
  const decoded = new Map<string, HTMLImageElement>()
  for (const [key, url] of urls) decoded.set(key, await decode(url))
  // Ignore independently decoded reference textures when counting backend reuse.
  decodes = 0
  const renderer = createEditorV6PartRasterRenderer(decode)
  const output = makeCanvas(), reference = makeCanvas()
  const actualContext = output.getContext('2d')!, referenceContext = reference.getContext('2d')!
  const equalPixels = () => {
    const a = actualContext.getImageData(0, 0, 96, 96).data
    const b = referenceContext.getImageData(0, 0, 96, 96).data
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false
    return true
  }
  const layer = (id: string, stage: EditorV6PartOverlayCommand['stage'], x: number, y: number,
    t: number, visible = true): EditorV6PartOverlayCommand => ({
    id, sourceDataUrl: urls.get(id)!, stage, x, y,
    visible, width: 20, height: 20, rotation: 24 * t,
    opacity: Math.round((0.3 + 0.7 * t) * 100) / 100,
    flipX: t >= 0.5, flipY: id === 'face' && t >= 0.5
  })
  const drawReference = (item: { sourceDataUrl: string; x: number; y: number; width: number; height: number;
    rotation: number; opacity?: number; flipX?: boolean; flipY?: boolean }) => {
    referenceContext.save()
    referenceContext.translate(item.x + item.width / 2, item.y + item.height / 2)
    referenceContext.rotate(item.rotation * Math.PI / 180)
    if (item.opacity !== undefined) referenceContext.globalAlpha = item.opacity
    if (item.flipX || item.flipY) referenceContext.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1)
    const source = [...urls].find(([, url]) => url === item.sourceDataUrl)?.[0]
    if (!source) throw Error('R37 layered reference image missing')
    referenceContext.drawImage(decoded.get(source)!, -item.width / 2, -item.height / 2, item.width, item.height)
    referenceContext.restore()
  }
  let samples = 0
  for (let i = 0; i < 30; i++) {
    const t = i / 29
    const body = {
      id: 'body', sourceDataUrl: urls.get('body')!, visible: true, order: 0,
      x: 18 + 20 * t, y: 24, width: 20, height: 20, rotation: 15 * t
    }
    const overlays = [
      layer('fringe', 'front-hair', 12 + t * 20, 12, t),
      layer('face', 'face', 22 + t * 20, 18, t),
      layer('shirt', 'over-body', 18 + t * 20, 32, t),
      layer('rear', 'behind-body', 17 + t * 20, 12, t, i % 7 !== 0)
    ]
    const frame = { progress: t, width: 96, height: 96, parts: [body], overlays }
    const result = await renderer.render(frame, {
      width: 96, height: 96, getContext: () => actualContext
    })
    if (result.drawnParts !== 1 || result.drawnOverlays !== overlays.filter(item => item.visible).length) {
      throw Error('R37: layered draw metrics mismatch at frame ' + i)
    }
    referenceContext.clearRect(0, 0, 96, 96)
    for (const item of overlays) if (item.visible && item.stage === 'behind-body') drawReference(item)
    drawReference(body)
    for (const stage of ['over-body', 'face', 'front-hair'] as const) {
      for (const item of overlays) if (item.visible && item.stage === stage) drawReference(item)
    }
    if (!equalPixels()) throw Error('R37: layered pixel mismatch at frame ' + i)
    samples++
  }
  if (decodes !== 5 || renderer.cachedSources() !== 5) throw Error('R37: layered texture reuse failed')
  return { passed: true, frames: samples, decodedSources: decodes, scope: 'precomposed-layers-only', exportReady: false }
}
