import { describe, expect, it, vi } from 'vitest'
import type { PreparedGachaLayerFrame } from '../../src/renderer/src/characters/editorV6CharacterRenderer'
import { cropPreparedMotionLayers, disposeCroppedMotionLayers } from '../../src/renderer/src/features/editorV6/motion/motionLayerCrops'

function fakeCanvas(context: CanvasRenderingContext2D | null = null) {
  return { width: 0, height: 0, getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement
}

function fakeContext() {
  return {
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn()
  } as unknown as CanvasRenderingContext2D
}

function sourceLayers(overrides: Partial<PreparedGachaLayerFrame> = {}) {
  return {
    behindFace: fakeCanvas(), face: fakeCanvas(), posteriorHair: fakeCanvas(),
    inFrontOfFace: fakeCanvas(), eyesAboveRearHair: fakeCanvas(),
    width: 120, height: 180, outputWidth: 300, outputHeight: 400,
    shapeScaleX: 1.25, shapeScaleY: 0.75,
    ...overrides
  } as PreparedGachaLayerFrame
}

describe('Editor V6 motion layer crops', () => {
  it('crops every present layer using the shared viewport and renderer geometry', () => {
    const sources = sourceLayers(), contexts = Array.from({ length: 5 }, fakeContext), canvases = contexts.map(fakeCanvas)
    let index = 0
    const crop = { left: 13, top: 29, width: 77, height: 91 }

    const result = cropPreparedMotionLayers(sources, crop, () => canvases[index++]!)

    expect(index).toBe(5)
    for (const canvas of canvases) expect([canvas.width, canvas.height]).toEqual([77, 91])
    contexts.forEach((context, layerIndex) => {
      expect(context.translate.mock.calls).toEqual([[-13, -29], [150, 200]])
      expect(context.scale).toHaveBeenCalledWith(1.25, 0.75)
      const source = [sources.behindFace, sources.face, sources.posteriorHair, sources.inFrontOfFace, sources.eyesAboveRearHair][layerIndex]
      expect(context.drawImage).toHaveBeenCalledWith(source, -60, -90)
    })
    expect(Object.keys(result)).toEqual(['behindFace', 'face', 'posteriorHair', 'inFrontOfFace', 'eyesAboveRearHair'])
  })

  it('keeps absent optional layers null and creates only the mandatory face layers', () => {
    const contexts = [fakeContext(), fakeContext()], canvases = contexts.map(fakeCanvas)
    let index = 0

    const result = cropPreparedMotionLayers(sourceLayers({ posteriorHair: null, inFrontOfFace: null, eyesAboveRearHair: null }), { left: 0, top: 0, width: 10, height: 12 }, () => canvases[index++]!)

    expect(index).toBe(2)
    expect(result).toMatchObject({ posteriorHair: null, inFrontOfFace: null, eyesAboveRearHair: null })
  })

  it('preserves the missing-canvas-context error', () => {
    expect(() => cropPreparedMotionLayers(sourceLayers(), { left: 0, top: 0, width: 1, height: 1 }, () => fakeCanvas()))
      .toThrow('Não foi possível preparar uma camada de cabelo durante a pose.')
  })

  it('releases every crop backing store after atlas packing', () => {
    const layerCanvases = Array.from({ length: 5 }, () => fakeCanvas())
    const layers = { behindFace: layerCanvases[0]!, face: layerCanvases[1]!, posteriorHair: layerCanvases[2]!, inFrontOfFace: layerCanvases[3]!, eyesAboveRearHair: layerCanvases[4]! }

    disposeCroppedMotionLayers(layers)

    expect(layerCanvases.map(({ width, height }) => [width, height])).toEqual(Array.from({ length: 5 }, () => [1, 1]))
    expect(() => disposeCroppedMotionLayers()).not.toThrow()
  })
})
