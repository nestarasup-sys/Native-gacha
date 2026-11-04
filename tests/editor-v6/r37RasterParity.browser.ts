import { createEditorV6PartRasterRenderer } from '../../src/shared/editorV6PartRasterRenderer'
import { compileEditorV6PartMotionPrototype } from '../../src/shared/editorV6PartMotionPrototype'
import type { FabricatorProject, ModelPart } from '../../src/shared/fabricator'

const part = (id: string, x: number, rotation = 0): ModelPart => ({
  id, name: id, x, y: 12, width: 18, height: 24, rotation,
  dataUrl: '', jointAnchor: { x: x + 9, y: 24 }
})
const makeArtwork = (x: number, source: string) => ({
  width: 96, height: 96,
  parts: [{ ...part('body', x), dataUrl: source }, { ...part('arm', x + 20, 15), dataUrl: source }],
  layerOrder: ['body', 'arm'], hiddenPartIds: [], joints: []
}) satisfies Pick<FabricatorProject, 'width' | 'height' | 'parts' | 'layerOrder' | 'hiddenPartIds' | 'joints'>

function equalPixels(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
function canvas() {
  const result = document.createElement('canvas')
  result.width = 96
  result.height = 96
  return result
}
function pixels(c: HTMLCanvasElement) {
  return c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data
}
export async function runR37RasterParity() {
  const source = document.createElement('canvas')
  source.width = 12
  source.height = 12
  const ctx = source.getContext('2d')!
  ctx.fillStyle = '#ff4080'
  ctx.fillRect(0, 0, 12, 12)
  ctx.clearRect(3, 3, 6, 6)
  const dataUrl = source.toDataURL('image/png')
  const from = makeArtwork(8, dataUrl)
  const to = makeArtwork(35, dataUrl)
  const compiler = compileEditorV6PartMotionPrototype(from, to)
  let decodes = 0
  const renderer = createEditorV6PartRasterRenderer(async url => {
    decodes++
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  })
  const actual = canvas(), expected = canvas()
  const context = expected.getContext('2d')!
  let samples = 0
  const captures: { first?: string; last?: string } = {}
  for (let i = 0; i < 30; i++) {
    const frame = compiler.frame(i / 29)
    await renderer.render(frame, {
      width: actual.width, height: actual.height,
      getContext: () => actual.getContext('2d')!
    })
    context.clearRect(0, 0, expected.width, expected.height)
    // Independent reference drawing, matching the existing characterLayerRenderer
    // transform sequence for the plain-piece subset only.
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    for (const p of frame.parts) {
      if (!p.visible) continue
      context.save()
      context.translate(p.x + p.width / 2, p.y + p.height / 2)
      context.rotate(p.rotation * Math.PI / 180)
      context.drawImage(img, -p.width / 2, -p.height / 2, p.width, p.height)
      context.restore()
    }
    if (!equalPixels(pixels(actual), pixels(expected))) throw Error('R37: pixel mismatch at frame ' + i)
    if (i === 0) captures.first = actual.toDataURL('image/png')
    if (i === 29) captures.last = actual.toDataURL('image/png')
    samples++
  }
  if (decodes !== 1 || compiler.exportReady !== false) throw Error('R37: unexpected decode reuse or export activation')
  return { passed: true, frames: samples, decodedImages: decodes, scope: 'plain-parts-only', exportReady: false, captures }
}
