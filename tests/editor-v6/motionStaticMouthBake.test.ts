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
    const renderedFrames = [baseline, ...comparisons]
    let renderedFrameIndex = 0
    const render = vi.fn(async (_progress: number, _mode?: 'talk', _scale?: number, _fingerprint?: boolean, _prepared?: unknown) =>
      renderedFrames[renderedFrameIndex++]) as unknown as EditorV6MotionFrameRenderer
    const sourceCrop = { left: 0, top: 0, width: 40, height: 50 }
    const baseAssets = [{ faceMode: 'talk', asset: { id: 'base-mouthless' } }]
    const prepareMouthlessBaseAssets = vi.fn(async () => ({ sourceCrop, isolatedBaseline, assets: baseAssets } as never))
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

    expect(result).toMatchObject({ asset, assetRole: 'face-atlas', mouthIsolationMode: 'isolated-piece', mouthlessBaseAssets: baseAssets, motion: packed.motion,
      metrics: { milliseconds: 25, ...rigMetrics, samples: 3, atlasPixels: 96 } })
    expect(prepareMouthlessBaseAssets).toHaveBeenCalledWith({ from: pose, baseline, render })
    expect(render).toHaveBeenCalledTimes(3)
    expect(comparisons.every((item) => item.dispose.mock.calls.length === 1)).toBe(true)
    expect(buildIsolatedMouthAtlas).toHaveBeenCalledWith(expect.objectContaining({ sourceCrop, key: 'static-mouth', rotation: 0, flipX: false }))
    expect(createPatch).toHaveBeenCalledTimes(3)
    expect(createCanvas).toHaveBeenCalledTimes(3)
    expect(baseline.dispose).toHaveBeenCalledOnce()
    expect(isolatedBaseline.dispose).toHaveBeenCalledOnce()
    expect(atlas.width).toBe(1)
    expect(canvases.length).toBe(0)
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
