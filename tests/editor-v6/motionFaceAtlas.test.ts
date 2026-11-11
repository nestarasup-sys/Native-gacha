import { describe, expect, it, vi } from 'vitest'
import { buildEditorV6MotionFaceAtlas } from '../../src/renderer/src/features/editorV6/motion/motionFaceAtlas'
import type { BakedFacePatch } from '../../src/renderer/src/features/editorV6/motion/motionFacePatchPreparation'

function canvas(width: number, height: number, drawImage = vi.fn(), dataUrl = 'data:image/png;base64,face-atlas') {
  const context = { drawImage }
  return {
    value: { width, height, getContext: vi.fn(() => context), toDataURL: vi.fn(() => dataUrl) } as unknown as HTMLCanvasElement,
    context
  }
}

function bakedPatch(overrides: Partial<BakedFacePatch> = {}): BakedFacePatch {
  return {
    index: 1,
    canvas: canvas(14, 12).value,
    left: 20, top: 30, width: 10, height: 8,
    crop: { left: 10, top: 20, width: 40, height: 32 },
    changed: { left: 23, top: 33, right: 26, bottom: 34 },
    replace: true,
    ...overrides
  }
}

describe('Editor V6 motion face atlas', () => {
  it('packs patches in input order and writes exact sprite, crop and replacement metadata', () => {
    const first = bakedPatch(), second = bakedPatch({
      index: 0, canvas: canvas(8, 9).value, left: 2, top: 3, width: 4, height: 5,
      crop: { left: 0, top: 0, width: 20, height: 20 }, changed: undefined, replace: false
    })
    const frames = [{}, {}], drawImage = vi.fn(), atlas = canvas(0, 0, drawImage)
    const ids = vi.fn().mockReturnValueOnce('face-asset').mockReturnValueOnce('motion-asset')

    const result = buildEditorV6MotionFaceAtlas({ patches: [first, second], frames, bodyPixels: 100, maxAtlasPixels: 500, createCanvas: () => atlas.value, createId: ids })

    expect([result.faceAtlas.width, result.faceAtlas.height, result.facePixels]).toEqual([22, 12, 264])
    expect(drawImage.mock.calls).toEqual([[first.canvas, 0, 0], [second.canvas, 14, 0]])
    expect(frames[1]!.facePatch).toEqual({
      sprite: { x: 2, y: 2, width: 10, height: 8, atlasWidth: 22, atlasHeight: 12 },
      x: 0.25, y: 0.3125, width: 0.25, height: 0.25,
      replace: true, replaceBounds: { x: 0.1, y: 0.125, width: 0.8, height: 0.75 }
    })
    expect(frames[0]!.facePatch).toEqual({ sprite: { x: 16, y: 2, width: 4, height: 5, atlasWidth: 22, atlasHeight: 12 }, x: 0.1, y: 0.15, width: 0.2, height: 0.25 })
    expect([first.canvas.width, first.canvas.height, second.canvas.width, second.canvas.height]).toEqual([1, 1, 1, 1])
    expect(result.faceAsset).toEqual({ id: 'face-asset', category: 'character', name: 'Camadas faciais da transição', mimeType: 'image/png', dataUrl: 'data:image/png;base64,face-atlas', timelineSnapshot: true })
    expect(result.assetId).toBe('motion-asset')
    expect(ids).toHaveBeenCalledTimes(2)
  })

  it('rejects a face atlas that exceeds its native pixel budget before allocating a canvas', () => {
    const createCanvas = vi.fn(() => canvas(0, 0).value)

    expect(() => buildEditorV6MotionFaceAtlas({ patches: [bakedPatch()], frames: [{}, {}], bodyPixels: 300, maxAtlasPixels: 400, createCanvas }))
      .toThrow('As camadas faciais desta transição excedem o limite seguro em resolução nativa.')
    expect(createCanvas).not.toHaveBeenCalled()
  })

  it('releases the atlas canvas if writing metadata or encoding fails', () => {
    const drawImage = vi.fn(() => { throw Error('falha sintética de composição') })
    const atlas = canvas(0, 0, drawImage)

    expect(() => buildEditorV6MotionFaceAtlas({ patches: [bakedPatch()], frames: [{}, {}], bodyPixels: 10, maxAtlasPixels: 500, createCanvas: () => atlas.value }))
      .toThrow('falha sintética de composição')
    expect([atlas.value.width, atlas.value.height]).toEqual([1, 1])
  })
})
