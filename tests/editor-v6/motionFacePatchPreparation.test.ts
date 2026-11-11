import { describe, expect, it, vi } from 'vitest'
import type { MotionPixelCrop } from '../../src/renderer/src/features/editorV6/motion/motionPixelAnalysis'
import { prepareEditorV6MotionFacePatch, type MotionFacePatchFrame } from '../../src/renderer/src/features/editorV6/motion/motionFacePatchPreparation'

type Renderer = { id: string }
type Frame = MotionFacePatchFrame<Renderer>

function canvasWithPixels(width: number, height: number, pixels = new Uint8ClampedArray(width * height * 4)): HTMLCanvasElement {
  const context = { getImageData: vi.fn(() => ({ data: pixels })) }
  return { width, height, getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement
}

function canvas(width = 1, height = 1): HTMLCanvasElement { return { width, height } as HTMLCanvasElement }

function frame(options: { pixels?: Uint8ClampedArray; mouthCanvas?: HTMLCanvasElement; mouthCrop?: MotionPixelCrop } = {}): Frame {
  return {
    canvas: canvasWithPixels(10, 10, options.pixels), width: 10, height: 10,
    crop: { left: 1, top: 2, width: 8, height: 7 },
    renderer: { id: 'renderer' },
    ...(options.mouthCanvas ? { mouthCanvas: options.mouthCanvas } : {}),
    ...(options.mouthCrop ? { mouthCrop: options.mouthCrop } : {}),
    dispose: vi.fn()
  }
}

describe('Editor V6 motion face patch preparation', () => {
  it('skips samples without mouth animation or outside speech modes', async () => {
    const baseline = frame(), render = vi.fn(async () => frame())
    const options = { index: 0, faceMode: 'talk' as const, progress: 0.5, mouthScale: 1.2, frame: baseline, render }

    await expect(prepareEditorV6MotionFacePatch(options)).resolves.toBeUndefined()
    await expect(prepareEditorV6MotionFacePatch({ ...options, mouthScaleSamples: [1, 1.2], faceMode: 'idle' })).resolves.toBeUndefined()
    await expect(prepareEditorV6MotionFacePatch({ ...options, mouthScaleSamples: [1, 1.2], mouthScale: 1 })).resolves.toBeUndefined()
    expect(render).not.toHaveBeenCalled()
  })

  it('uses the isolated mouth renderer and retains its local source rectangle', async () => {
    const baseline = frame(), mouthCanvas = canvas(4, 3), patchCanvas = canvas(8, 7)
    const scaled = frame({ mouthCanvas, mouthCrop: { left: 3, top: 4, width: 4, height: 3 } })
    const render = vi.fn(async () => scaled), createTransparentPatch = vi.fn(() => patchCanvas)

    const result = await prepareEditorV6MotionFacePatch({
      index: 5, faceMode: 'talk-blink', progress: 0.75, mouthScale: 1.35, mouthScaleSamples: [1, 1.35], frame: baseline, render, createTransparentPatch
    })

    expect(render).toHaveBeenCalledWith(0.75, 'talk-blink', 1.35, false, baseline.renderer)
    expect(createTransparentPatch).toHaveBeenCalledWith(mouthCanvas, { left: 3, top: 4, width: 4, height: 3 })
    expect(result).toMatchObject({ index: 5, canvas: patchCanvas, left: 3, top: 4, width: 4, height: 3, crop: baseline.crop })
    expect(scaled.dispose).toHaveBeenCalledOnce()
  })

  it('falls back to a padded changed-pixel region when isolated mouth rendering is unavailable', async () => {
    const baseline = frame(), pixels = new Uint8ClampedArray(10 * 10 * 4)
    pixels[(4 * 10 + 2) * 4] = 20
    pixels[(7 * 10 + 8) * 4 + 1] = 30
    const scaled = frame({ pixels }), patchCanvas = canvas(12, 11)
    const render = vi.fn(async () => scaled), createChangedPatch = vi.fn(() => patchCanvas)

    const result = await prepareEditorV6MotionFacePatch({
      index: 2, faceMode: 'talk', progress: 0.4, mouthScale: 1.5, mouthScaleSamples: [1, 1.5], frame: baseline, render, createChangedPatch
    })

    expect(createChangedPatch).toHaveBeenCalledWith(scaled.canvas, { left: 1, top: 2, right: 8, bottom: 8 })
    expect(result).toMatchObject({ index: 2, canvas: patchCanvas, left: 1, top: 2, width: 8, height: 7, changed: { left: 2, top: 4, right: 8, bottom: 7 }, replace: true })
    expect(scaled.dispose).toHaveBeenCalledOnce()
  })

  it('reports unchanged mouth pixels and still disposes the rendered comparison', async () => {
    const baseline = frame(), scaled = frame(), render = vi.fn(async () => scaled)

    await expect(prepareEditorV6MotionFacePatch({ index: 1, faceMode: 'talk', progress: 0.5, mouthScale: 1.4, mouthScaleSamples: [1, 1.4], frame: baseline, render }))
      .rejects.toThrow('A boca aberta não alterou pixels durante a transição; confira a variante de boca aberta no catálogo facial.')
    expect(scaled.dispose).toHaveBeenCalledOnce()
  })
})
