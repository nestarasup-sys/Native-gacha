import { afterEach, describe, expect, it, vi } from 'vitest'
import { canvasFaceAlphaBounds, measureFaceModeCrop, trimTransparentCanvas } from '../../src/renderer/src/features/editorV6/faceModeAssets'
import type { PreparedEditorV6FaceRenderer } from '../../src/renderer/src/features/editorV6/faceModeAssets'

type FakeCanvas = { width: number; height: number; pixels: Uint8ClampedArray; toDataURL: () => string; getContext: (_kind: string) => {
  getImageData: () => { data: Uint8ClampedArray }
  drawImage: (source: FakeCanvas, ...args: number[]) => void
} }
function canvas(width: number, height: number, opaque: Array<[number, number]> = []): FakeCanvas {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (const [x, y] of opaque) pixels[(y * width + x) * 4 + 3] = 255
  return {
    width, height, pixels,
    toDataURL() { throw Error('PNG encoding is forbidden in a geometry-only measurement') },
    getContext() {
      return {
        getImageData() { return { data: pixels } },
        drawImage(source: FakeCanvas) {
          for (let y = 0; y < Math.min(height, source.height); y++)
            for (let x = 0; x < Math.min(width, source.width); x++)
              pixels[(y * width + x) * 4 + 3] = Math.max(pixels[(y * width + x) * 4 + 3], source.pixels[(y * source.width + x) * 4 + 3])
        }
      }
    }
  }
}
afterEach(() => vi.unstubAllGlobals())

describe('real hair-preparation geometry, no redundant PNG encodes', () => {
  it('keeps exactly the original alpha threshold and full-frame/no-frame contract', () => {
    expect(canvasFaceAlphaBounds(canvas(4, 4, [[1, 2], [2, 3]]))).toEqual({ left: 1, top: 2, width: 2, height: 2 })
    expect(canvasFaceAlphaBounds(canvas(2, 2, []))).toBeNull()
    expect(canvasFaceAlphaBounds(canvas(2, 2, [[0, 0], [1, 1]]))).toBeNull()
    const lowAlpha = canvas(3, 3, [[1, 1]])
    lowAlpha.pixels[(1 * 3 + 1) * 4 + 3] = 8
    expect(canvasFaceAlphaBounds(lowAlpha)).toBeNull()
    lowAlpha.pixels[(1 * 3 + 1) * 4 + 3] = 9
    expect(canvasFaceAlphaBounds(lowAlpha)).toEqual({ left: 1, top: 1, width: 1, height: 1 })
  })
  it('measures union of idle/blink/talk/talk-blink without allocating or encoding cropped PNG', async () => {
    const created: FakeCanvas[] = []
    vi.stubGlobal('document', { createElement: (tag: string) => {
      expect(tag).toBe('canvas')
      const c = canvas(4, 4); created.push(c); return c
    } })
    const frames = new Map([
      ['idle', canvas(4, 4, [[1, 2]])], ['blink', canvas(4, 4, [[2, 2]])],
      ['talk', canvas(4, 4, [[1, 3]])], ['talk-blink', canvas(4, 4, [[2, 3]])]
    ])
    const render = vi.fn(async (_appearance: unknown, _transforms: unknown, _effects: unknown, mode: string) => ({ canvas: frames.get(mode)!, width: 4, height: 4 }))
    const renderer = { renderToCanvas: render } as unknown as PreparedEditorV6FaceRenderer
    expect(await measureFaceModeCrop('fixture', renderer, undefined, undefined, undefined, 'idle')).toEqual({ left: 1, top: 2, width: 2, height: 2 })
    expect(render).toHaveBeenCalledTimes(4)
    expect(created).toHaveLength(1)
  })
  it('allows an explicit classic PNG face-crop A/B mode with the same bounds', async () => {
    const created: FakeCanvas[] = []
    let encodes = 0
    vi.stubGlobal('document', { createElement: () => {
      const c = canvas(4, 4)
      c.toDataURL = () => { encodes++; return 'data:image/png;base64,AAAA' }
      created.push(c); return c
    } })
    const frames = new Map([
      ['idle', canvas(4, 4, [[1, 1]])], ['blink', canvas(4, 4, [[2, 1]])],
      ['talk', canvas(4, 4, [[1, 2]])], ['talk-blink', canvas(4, 4, [[2, 2]])]
    ])
    const renderer = { renderToCanvas: async (_a: unknown, _b: unknown, _c: unknown, mode: string) =>
      ({ canvas: frames.get(mode)!, width: 4, height: 4 }) } as unknown as PreparedEditorV6FaceRenderer
    const optimized = await measureFaceModeCrop('teste', renderer, undefined, undefined, undefined, 'idle')
    expect(encodes).toBe(0)
    const classic = await measureFaceModeCrop('teste', renderer, undefined, undefined, undefined, 'idle', undefined, true)
    expect(classic).toEqual(optimized)
    expect(encodes).toBe(1)
    expect(created).toHaveLength(3)
  })

  it('retains trimmed-image encoding in the public snapshot path', () => {
    const source = canvas(3, 3, [[1, 1]])
    const encoded = canvas(1, 1)
    encoded.toDataURL = () => 'data:image/png;base64,AAAA'
    vi.stubGlobal('document', { createElement: () => encoded })
    expect(trimTransparentCanvas(source)).toMatchObject({ left: 1, top: 1, width: 1, height: 1, dataUrl: 'data:image/png;base64,AAAA' })
  })
})
