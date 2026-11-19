import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Element } from '../../src/shared/editorV6'
import type { EditorV6MotionBakeRequest } from '../../src/shared/editorV6Motion'
import type { EditorV6MotionFrameRenderer, EditorV6MotionRenderedFrame } from '../../src/renderer/src/features/editorV6/motion/motionFrameRenderer'
import { bakeEditorV6StaticMouthLoop } from '../../src/renderer/src/features/editorV6/motion/motionStaticMouthBake'

const request = (mouthScaleSamples: number[] = [1, 1.1, 1.2]) => ({
  mouthScaleSamples,
  plan: { key: 'static-mouth', samples: [{ offset: 0, faceMode: 'talk' }, { offset: 15, faceMode: 'talk' }, { offset: 30, faceMode: 'talk' }] },
  maxAtlasPixels: 8000
}) as unknown as EditorV6MotionBakeRequest

function frame(overrides: Partial<EditorV6MotionRenderedFrame> = {}): EditorV6MotionRenderedFrame {
  return {
    canvas: { width: 40, height: 50 } as HTMLCanvasElement,
    width: 40,
    height: 50,
    crop: { left: 0, top: 0, width: 40, height: 50 },
    renderer: {} as never,
    mouthCanvas: { width: 10, height: 8 } as HTMLCanvasElement,
    mouthCrop: { left: 5, top: 6, width: 10, height: 8, fingerprint: 1 },
    dispose: vi.fn(),
    ...overrides
  }
}

const pose = { kind: 'character', activeFaceMode: 'talk', rotation: 0, flipX: false } as EditorV6Element
const rigMetrics = { preparedRigs: 2, reusedRigs: 3, rigKeyLookups: 4, rigRebuilds: 1, rigBuildMilliseconds: 9 }

describe('pipeline de boca em pose estática', () => {
  it('deixa o pipeline corporal cuidar de transições e captura de camadas', async () => {
    const render = vi.fn<EditorV6MotionFrameRenderer>()
    const result = await bakeEditorV6StaticMouthLoop({
      request: request(), from: pose, to: { ...pose, x: 1 }, samePose: true,
      captureLayerAtlases: false, render, elapsedMilliseconds: () => 1, rigMetrics: () => rigMetrics
    })

    expect(result).toBeNull()
    expect(render).not.toHaveBeenCalled()
  })

  it('monta o atlas de boca isolada e preserva métricas e descarte dos canvases', async () => {
    const baseline = frame()
    const isolatedBaseline = frame({ mouthCrop: { left: 8, top: 9, width: 7, height: 6, fingerprint: 4 } })
    const comparisons = [frame({ mouthCrop: { left: 9, top: 10, width: 6, height: 5, fingerprint: 5 } }), frame({ mouthCrop: { left: 10, top: 11, width: 5, height: 4, fingerprint: 6 } })]
    const renderedFrames = [baseline, isolatedBaseline, ...comparisons]
    let renderedFrameIndex = 0
    const render = vi.fn(async (_progress: number, _mode?: 'talk', _scale?: number, _fingerprint?: boolean, _prepared?: unknown) =>
      renderedFrames[renderedFrameIndex++]) as unknown as EditorV6MotionFrameRenderer
    const sourceCrop = { left: 0, top: 0, width: 40, height: 50 }
    const baseAssets = [{ faceMode: 'talk', asset: { id: 'base-mouthless' } }]
    const prepareMouthlessBaseAssets = vi.fn(async () => ({ sourceCrop, assets: baseAssets } as never))
    const createPatch = vi.fn((_canvas: HTMLCanvasElement, crop: { width: number; height: number }) => ({ width: crop.width, height: crop.height, getContext: () => ({}) } as unknown as HTMLCanvasElement))
    const normalizedCanvas = () => ({ width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }) } as unknown as HTMLCanvasElement)
    const canvases = [normalizedCanvas(), normalizedCanvas(), normalizedCanvas()]
    const createCanvas = vi.fn(() => canvases.shift()!)
    const atlas = { width: 12, height: 8 } as HTMLCanvasElement
    const asset = { id: 'mouth-atlas', category: 'character', name: 'mouth', mimeType: 'image/png', dataUrl: 'data:image/png;base64,x' }
    const packed = { atlas, asset, motion: { version: 1, key: 'static-mouth', assetId: asset.id, frames: [] }, atlasPixels: 96 }
    const buildIsolatedMouthAtlas = vi.fn(() => packed as never)

    const result = await bakeEditorV6StaticMouthLoop({
      request: request(), from: pose, to: { ...pose }, samePose: true, captureLayerAtlases: false,
      render, elapsedMilliseconds: () => 25, rigMetrics: () => rigMetrics,
      prepareMouthlessBaseAssets, buildIsolatedMouthAtlas, createTransparentPatch: createPatch,
      createCanvas
    } as never)

    expect(result).toMatchObject({ asset, assetRole: 'face-atlas', mouthIsolationMode: 'isolated-piece', facePatchSourceCrop: sourceCrop, mouthlessBaseAssets: baseAssets, motion: packed.motion,
      metrics: { milliseconds: 25, ...rigMetrics, samples: 3, atlasPixels: 96 } })
    expect(prepareMouthlessBaseAssets).toHaveBeenCalledWith({ from: pose, baseline, render, requiredCrop: { left: 8, top: 9, width: 7, height: 6 } })
    expect(render).toHaveBeenCalledTimes(4)
    expect(comparisons.every((item) => item.dispose.mock.calls.length === 1)).toBe(true)
    expect(buildIsolatedMouthAtlas).toHaveBeenCalledWith(expect.objectContaining({ sourceCrop, key: 'static-mouth', rotation: 0, flipX: false }))
    expect(createPatch).toHaveBeenCalledTimes(3)
    expect(createCanvas).toHaveBeenCalledTimes(3)
    expect(baseline.dispose).toHaveBeenCalledOnce()
    expect(isolatedBaseline.dispose).toHaveBeenCalledOnce()
    expect(atlas.width).toBe(1)
    expect(canvases.length).toBe(0)
  })

  it('includes a mouth sample beyond the original character crop before building bases and atlas', async () => {
    const baseline = frame()
    const reference = frame({ mouthCrop: { left: 8, top: 9, width: 7, height: 6, fingerprint: 1 } })
    const middle = frame({ mouthCrop: { left: 12, top: 10, width: 8, height: 5, fingerprint: 2 } })
    const enlarged = frame({ mouthCrop: { left: 35, top: 12, width: 12, height: 8, fingerprint: 3 } })
    const frames = [baseline, reference, middle, enlarged]
    const render = vi.fn(async () => frames.shift()!) as unknown as EditorV6MotionFrameRenderer
    const bodyCrop = { left: 0, top: 0, width: 40, height: 50 }
    const expectedCrop = { left: 0, top: 0, width: 47, height: 50 }
    const bases = [{ faceMode: 'talk', asset: { id: 'full-width-base' } }]
    const prepareMouthlessBaseAssets = vi.fn(async (input: { requiredCrop: { left: number; top: number; width: number; height: number } }) => {
      expect(input.requiredCrop).toEqual({ left: 8, top: 9, width: 39, height: 11 })
      return { sourceCrop: expectedCrop, isolatedBaseline: reference, assets: bases } as never
    })
    const createTransparentPatch = vi.fn((_canvas: HTMLCanvasElement, crop: { width: number; height: number }) =>
      ({ width: crop.width + 4, height: crop.height + 4 } as HTMLCanvasElement))
    const createCanvas = vi.fn(() => ({ width: 1, height: 1, getContext: () => ({ drawImage: vi.fn() }) } as unknown as HTMLCanvasElement))
    const atlas = { width: 15, height: 20 } as HTMLCanvasElement
    const packed = { atlas, asset: { id: 'mouth-atlas' }, motion: { version: 1, key: 'static-mouth', assetId: 'mouth-atlas', frames: [] }, atlasPixels: 300 }
    const buildIsolatedMouthAtlas = vi.fn((input: { sourceCrop: typeof expectedCrop }) => {
      expect(input.sourceCrop).toEqual(expectedCrop)
      return packed as never
    })
    const result = await bakeEditorV6StaticMouthLoop({
      request: request(), from: pose, to: { ...pose }, samePose: true, captureLayerAtlases: false,
      render, elapsedMilliseconds: () => 2, rigMetrics: () => rigMetrics, prepareMouthlessBaseAssets,
      buildIsolatedMouthAtlas, createTransparentPatch, createCanvas
    } as never)
    expect(result?.facePatchSourceCrop).toEqual(expectedCrop)
    expect(result?.mouthlessBaseAssets).toBe(bases)
    expect(prepareMouthlessBaseAssets).toHaveBeenCalledOnce()
    expect(buildIsolatedMouthAtlas).toHaveBeenCalledOnce()
    expect(reference.dispose).toHaveBeenCalledOnce()
    expect(baseline.dispose).toHaveBeenCalledOnce()
    expect(middle.dispose).toHaveBeenCalledOnce()
    expect(enlarged.dispose).toHaveBeenCalledOnce()
    expect(bodyCrop.width).toBeLessThan(expectedCrop.width)
  })

  it('usa o fallback legacy quando o renderer não consegue separar a boca', async () => {
    const baseline = frame({ mouthCanvas: undefined, mouthCrop: undefined })
    const render = vi.fn(async () => baseline) as unknown as EditorV6MotionFrameRenderer
    const detectLegacyMouthBounds = vi.fn(async () => ({ sourceCrop: { left: 1, top: 2, width: 30, height: 40 }, changedBounds: { left: 4, top: 5, right: 9, bottom: 10 } }))
    const packed = { atlas: {} as HTMLCanvasElement, asset: { id: 'legacy-mouth' }, motion: { version: 1, key: 'static-mouth', assetId: 'legacy-mouth', frames: [] }, atlasPixels: 80 }
    const buildLegacyMouthAtlas = vi.fn(async () => packed as never)

    const result = await bakeEditorV6StaticMouthLoop({
      request: request(), from: pose, to: { ...pose }, samePose: true, captureLayerAtlases: false,
      render, elapsedMilliseconds: () => 7, rigMetrics: () => rigMetrics,
      detectLegacyMouthBounds, buildLegacyMouthAtlas
    } as never)

    expect(result).toMatchObject({ asset: packed.asset, mouthIsolationMode: 'legacy-patch', metrics: { milliseconds: 7, preparedRigs: 2, reusedRigs: 3, samples: 3, atlasPixels: 80 } })
    expect(detectLegacyMouthBounds).toHaveBeenCalledWith({ baseline, scales: [1, 1.1, 1.2], faceMode: 'talk', render })
    expect(buildLegacyMouthAtlas).toHaveBeenCalledWith(expect.objectContaining({ samples: request().plan.samples, key: 'static-mouth' }))
  })
})
