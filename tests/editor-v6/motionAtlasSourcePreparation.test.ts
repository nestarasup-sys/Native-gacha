import { describe, expect, it, vi } from 'vitest'
import { prepareEditorV6MotionAtlasSources, type MotionAtlasSourceFrame } from '../../src/renderer/src/features/editorV6/motion/motionAtlasSourcePreparation'
import type { CroppedMotionLayers } from '../../src/renderer/src/features/editorV6/motion/motionLayerCrops'
import type { PreparedGachaLayerFrame } from '../../src/renderer/src/characters/editorV6CharacterRenderer'

function canvas(width = 0, height = 0) {
  const drawImage = vi.fn()
  return { width, height, getContext: vi.fn(() => ({ drawImage })) } as unknown as HTMLCanvasElement
}

function frame(width: number, height: number, left: number, top: number): MotionAtlasSourceFrame {
  return {
    canvas: canvas(100, 80), width: 100, height: 80,
    crop: { left, top, width, height, fingerprint: left + top },
    dispose: vi.fn()
  }
}

describe('Editor V6 motion atlas source preparation', () => {
  it('renders scaled samples, crops native frames, prepares mouth patches, and returns maximum dimensions', async () => {
    const first = frame(10, 12, 2, 3), second = frame(14, 16, 4, 5)
    const render = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const patches = [canvas(2, 2), canvas(2, 2)]
    const prepareFacePatch = vi.fn()
      .mockResolvedValueOnce({ index: 0, canvas: patches[0], left: 1, top: 1, width: 2, height: 2, crop: first.crop })
      .mockResolvedValueOnce({ index: 1, canvas: patches[1], left: 2, top: 2, width: 2, height: 2, crop: second.crop })
    const crops: HTMLCanvasElement[] = []

    const result = await prepareEditorV6MotionAtlasSources({
      samples: [{ progress: 0.25, faceMode: 'talk' }, { progress: 0.75, faceMode: 'talk-blink' }],
      fromCrop: { left: 0, top: 0, width: 8, height: 9 }, toCrop: { left: 0, top: 0, width: 12, height: 11 },
      mouthScaleSamples: [1, 1.25], captureLayers: false, render, prepareFacePatch,
      createCanvas: () => { const value = canvas(); crops.push(value); return value }
    })

    expect(render.mock.calls).toEqual([[0.15625, 'talk', 1, false], [0.84375, 'talk-blink', 1, false]])
    expect(prepareFacePatch.mock.calls.map(([args]) => [args.index, args.progress, args.mouthScale])).toEqual([[0, 0.15625, 1], [1, 0.84375, 1.25]])
    expect(result).toMatchObject({ maximumWidth: 14, maximumHeight: 16, frames: [{ crop: first.crop }, { crop: second.crop }], facePatches: [{ index: 0 }, { index: 1 }] })
    expect(crops.map(item => [item.width, item.height])).toEqual([[10, 12], [14, 16]])
    expect([first.dispose, second.dispose].map(dispose => vi.mocked(dispose).mock.calls.length)).toEqual([1, 1])
  })

  it('releases prior cropped frames and face patches when later preparation fails', async () => {
    const first = frame(10, 12, 2, 3)
    const render = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(Error('falha sintética'))
    const patch = canvas(3, 4), crops: HTMLCanvasElement[] = []

    await expect(prepareEditorV6MotionAtlasSources({
      samples: [{ progress: 0.3 }, { progress: 0.7 }],
      fromCrop: { left: 0, top: 0, width: 8, height: 9 }, toCrop: { left: 0, top: 0, width: 12, height: 11 },
      captureLayers: false, render, prepareFacePatch: async () => ({ index: 0, canvas: patch, left: 0, top: 0, width: 3, height: 4, crop: first.crop }),
      createCanvas: () => { const value = canvas(); crops.push(value); return value }
    })).rejects.toThrow('falha sintética')
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(crops.map(item => [item.width, item.height])).toEqual([[1, 1]])
    expect([patch.width, patch.height]).toEqual([1, 1])
  })

  it('crops and transfers renderer layers only when layer capture is enabled', async () => {
    const current = { ...frame(10, 12, 2, 3), layers: {} as PreparedGachaLayerFrame }
    const croppedLayers = { behindFace: canvas(10, 12), face: canvas(10, 12), posteriorHair: null, inFrontOfFace: null, eyesAboveRearHair: null } as CroppedMotionLayers
    const cropLayers = vi.fn(() => croppedLayers)

    const result = await prepareEditorV6MotionAtlasSources({
      samples: [{ progress: 0.5 }], fromCrop: current.crop, toCrop: current.crop,
      captureLayers: true, render: async () => current, prepareFacePatch: async () => undefined, cropLayers,
      createCanvas: () => canvas()
    })

    expect(cropLayers).toHaveBeenCalledWith(current.layers, current.crop)
    expect(result.frames[0].layers).toBe(croppedLayers)
    expect(croppedLayers.behindFace.width).toBe(10)
    expect(current.dispose).toHaveBeenCalledOnce()
  })

  it('cleans a cropped canvas if its drawing context is unavailable', async () => {
    const current = frame(10, 12, 0, 0), brokenCanvas = { width: 0, height: 0, getContext: vi.fn(() => null) } as unknown as HTMLCanvasElement
    await expect(prepareEditorV6MotionAtlasSources({
      samples: [{ progress: 0.5 }], fromCrop: current.crop, toCrop: current.crop,
      captureLayers: false, render: async () => current, prepareFacePatch: async () => undefined,
      createCanvas: () => brokenCanvas
    })).rejects.toThrow()
    expect([brokenCanvas.width, brokenCanvas.height]).toEqual([1, 1])
    expect(current.dispose).toHaveBeenCalledOnce()
  })
})
