import { describe, expect, it, vi } from 'vitest'
import type { EditorV6FaceRenderMode } from '../../src/shared/editorV6'
import { resolveMotionBakeEndpointGeometry, type MotionBakeEndpointFrame } from '../../src/renderer/src/features/editorV6/motion/motionBakeEndpointGeometry'

type Renderer = { id: string }
type Frame = MotionBakeEndpointFrame<Renderer>
type RenderCall = { progress: number; mode?: EditorV6FaceRenderMode; preparedRenderer?: Renderer; referenceMode?: boolean }

function crop(left: number, top: number, width: number, height: number) { return { left, top, width, height } }
function frame(progress: number, mode?: EditorV6FaceRenderMode): Frame {
  const size = progress === 1 ? { width: 550, height: 680 } : { width: 500, height: 700 }
  const bounds = mode === 'idle' ? crop(5, 18, 50, 70)
    : mode === 'talk' ? crop(0, 15, 60, 75)
      : crop(progress === 1 ? 8 : 10, progress === 1 ? 22 : 20, 40, 60)
  return { ...size, crop: bounds, renderer: { id: `renderer-${progress}` }, dispose: vi.fn() }
}

describe('Editor V6 motion endpoint geometry', () => {
  it('uses premeasured hair endpoint dimensions and crops without rendering again', async () => {
    const from = { ...crop(4, 8, 80, 120), outputWidth: 400, outputHeight: 600 }
    const to = { ...crop(2, 5, 90, 130), outputWidth: 440, outputHeight: 640 }
    const render = vi.fn<(...args: Parameters<Parameters<typeof resolveMotionBakeEndpointGeometry<Renderer>>[0]['render']>) => Promise<Frame>>()

    const result = await resolveMotionBakeEndpointGeometry({ captureLayerAtlases: true, endpointCrops: { from, to }, staticMouthLoop: false, hasMouthScaleSamples: false, firstFaceMode: 'idle', render })

    expect(result).toEqual({ fromCrop: from, toCrop: to, maximumCanvasWidth: 440, maximumCanvasHeight: 640 })
    expect(render).not.toHaveBeenCalled()
  })

  it('unions supported face-mode crops and skips only unavailable blink assets', async () => {
    const disposed: Array<Frame['dispose']> = [], calls: RenderCall[] = []
    const render = vi.fn(async (progress: number, mode?: EditorV6FaceRenderMode, _scale?: number, _fingerprint?: boolean, preparedRenderer?: Renderer, referenceMode?: boolean) => {
      calls.push({ progress, mode, preparedRenderer, referenceMode })
      if (mode === 'blink' || mode === 'talk-blink') throw Error('Selecione olhos do catálogo ou assets de Olhos Dev')
      const result = frame(progress, mode)
      disposed.push(result.dispose)
      return result
    })

    const result = await resolveMotionBakeEndpointGeometry({ captureLayerAtlases: false, staticMouthLoop: false, hasMouthScaleSamples: true, firstFaceMode: 'talk', render })

    expect(result).toEqual({ fromCrop: crop(0, 15, 60, 75), toCrop: crop(0, 15, 60, 75), maximumCanvasWidth: 550, maximumCanvasHeight: 700 })
    expect(calls[0]).toMatchObject({ progress: 0, mode: undefined })
    expect(calls.at(-5)).toMatchObject({ progress: 1, mode: undefined })
    expect(calls.filter(call => call.referenceMode)).toHaveLength(8)
    expect(disposed.length).toBe(6)
    disposed.forEach(dispose => expect(dispose).toHaveBeenCalledOnce())
  })

  it('reuses supplied crops when dimensions are unmeasured and avoids duplicate face-mode renders', async () => {
    const from = { ...crop(6, 9, 70, 100), outputWidth: 0, outputHeight: 500 }
    const to = crop(3, 4, 80, 110)
    const render = vi.fn(async (progress: number) => frame(progress))

    const result = await resolveMotionBakeEndpointGeometry({ captureLayerAtlases: true, endpointCrops: { from, to }, staticMouthLoop: false, hasMouthScaleSamples: false, firstFaceMode: 'idle', render })

    expect(result.fromCrop).toBe(from)
    expect(result.toCrop).toBe(to)
    expect(result.maximumCanvasWidth).toBe(550)
    expect(render).toHaveBeenCalledTimes(2)
  })

  it('keeps static mouth loops on the first endpoint without rendering a final rig', async () => {
    const calls: RenderCall[] = []
    const render = vi.fn(async (progress: number, mode?: EditorV6FaceRenderMode, _scale?: number, _fingerprint?: boolean, preparedRenderer?: Renderer, referenceMode?: boolean) => {
      calls.push({ progress, mode, preparedRenderer, referenceMode })
      if (mode === 'blink' || mode === 'talk-blink') throw Error('Selecione olhos do catálogo ou assets de Olhos Dev')
      return frame(progress, mode)
    })

    const result = await resolveMotionBakeEndpointGeometry({ captureLayerAtlases: false, staticMouthLoop: true, hasMouthScaleSamples: true, firstFaceMode: 'talk', render })

    expect(calls[0]).toMatchObject({ progress: 0, mode: 'talk' })
    expect(calls.every(call => call.progress === 0)).toBe(true)
    expect(render).toHaveBeenCalledTimes(5)
    expect(result.fromCrop).toEqual(result.toCrop)
    expect(result.maximumCanvasWidth).toBe(500)
    expect(result.maximumCanvasHeight).toBe(700)
  })

  it('propagates missing non-blink facial assets and always disposes the initial endpoint', async () => {
    const first = frame(0), render = vi.fn(async (_progress: number, mode?: EditorV6FaceRenderMode) => {
      if (mode === 'idle') throw Error('Falha sintética de olhos')
      return first
    })

    await expect(resolveMotionBakeEndpointGeometry({ captureLayerAtlases: false, staticMouthLoop: false, hasMouthScaleSamples: false, firstFaceMode: 'idle', render }))
      .rejects.toThrow('Falha sintética de olhos')
    expect(first.dispose).toHaveBeenCalledOnce()
  })
})
