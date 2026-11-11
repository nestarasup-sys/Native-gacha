import { describe, expect, it, vi } from 'vitest'
import type { EditorV6MotionFrame } from '../../src/shared/editorV6Motion'
import type { BakedFacePatch } from '../../src/renderer/src/features/editorV6/motion/motionFacePatchPreparation'
import type { EditorV6MotionLayerAtlasCapture } from '../../src/renderer/src/features/editorV6/motion/motionLayerAtlasCapture'
import { finalizeEditorV6MotionBake } from '../../src/renderer/src/features/editorV6/motion/motionBakeResult'

function canvas(width: number, height: number, dataUrl: string) {
  const drawImage = vi.fn()
  const value = { width, height, getContext: vi.fn(() => ({ drawImage })), toDataURL: vi.fn(() => dataUrl) } as unknown as HTMLCanvasElement
  return { canvas: value, drawImage }
}

const motionFrame: EditorV6MotionFrame = {
  offset: 0, sprite: { x: 1, y: 2, width: 3, height: 4, atlasWidth: 20, atlasHeight: 30 },
  x: 0.1, y: 0.2, width: 0.3, height: 0.4, rotation: 5, flipX: false
}
const capturedLayerFrame = { ...motionFrame, crop: { left: 2, top: 3, width: 10, height: 12 } }
const metrics = { milliseconds: 12, preparedRigs: 2, reusedRigs: 3 }

describe('Editor V6 motion bake result', () => {
  it('serializes a body-only atlas with its original asset and metric shape', () => {
    const atlas = canvas(20, 30, 'data:body'), idFactory = vi.fn(() => 'body-id')
    const captured: EditorV6MotionLayerAtlasCapture[] = []

    const result = finalizeEditorV6MotionBake({
      atlas: atlas.canvas, frames: [motionFrame], facePatches: [], key: 'motion-key', samples: 1, maxAtlasPixels: 5000,
      metrics, layerFrames: [capturedLayerFrame], captureLayerAtlases: capture => captured.push(capture),
      layerAtlases: { behindFace: canvas(20, 30, '').canvas, face: canvas(20, 30, '').canvas, inFrontOfFace: canvas(20, 30, '').canvas },
      createId: idFactory
    })

    expect(result).toEqual({
      asset: { id: 'body-id', category: 'character', name: 'Transição de personagem', mimeType: 'image/png', dataUrl: 'data:body', timelineSnapshot: true },
      motion: { version: 1, key: 'motion-key', assetId: 'body-id', frames: [motionFrame] },
      metrics: { ...metrics, samples: 1, atlasPixels: 600 }
    })
    expect(idFactory).toHaveBeenCalledOnce()
    expect(captured).toHaveLength(1)
    expect([atlas.canvas.width, atlas.canvas.height]).toEqual([1, 1])
  })

  it('adds facial snapshots, face patches, and combined pixel metrics', () => {
    const atlas = canvas(10, 10, 'data:body'), faceAtlas = canvas(0, 0, 'data:face')
    const frame: EditorV6MotionFrame = { ...motionFrame }
    const patchCanvas = canvas(6, 7, 'not-serialized-directly')
    const patch: BakedFacePatch = {
      index: 0, canvas: patchCanvas.canvas, left: 4, top: 6, width: 2, height: 3,
      crop: { left: 2, top: 3, width: 10, height: 12 }
    }
    const createId = vi.fn().mockReturnValueOnce('face-id').mockReturnValueOnce('body-id')

    const result = finalizeEditorV6MotionBake({
      atlas: atlas.canvas, frames: [frame], facePatches: [patch], key: 'motion-key', samples: 1, maxAtlasPixels: 200,
      metrics, layerFrames: [], createCanvas: () => faceAtlas.canvas, createId
    })

    expect(result.asset.id).toBe('body-id')
    expect(result.faceAsset).toMatchObject({ id: 'face-id', name: 'Camadas faciais da transição', dataUrl: 'data:face', timelineSnapshot: true })
    expect(result.motion).toMatchObject({ assetId: 'body-id', faceAssetId: 'face-id' })
    expect(frame.facePatch).toEqual({ sprite: { x: 2, y: 2, width: 2, height: 3, atlasWidth: 6, atlasHeight: 7 }, x: 0.2, y: 0.25, width: 0.2, height: 0.25 })
    expect(result.metrics).toEqual({ ...metrics, samples: 1, atlasPixels: 142 })
    expect(createId.mock.results.map(({ value }) => value)).toEqual(['face-id', 'body-id'])
    expect(patchCanvas.canvas.width).toBe(1)
    expect([atlas.canvas.width, atlas.canvas.height, faceAtlas.canvas.width, faceAtlas.canvas.height]).toEqual([1, 1, 1, 1])
  })

  it('clears body and face atlases if layer capture fails during finalization', () => {
    const atlas = canvas(10, 10, 'data:body'), faceAtlas = canvas(0, 0, 'data:face')
    const patchCanvas = canvas(6, 7, 'patch')
    const patch: BakedFacePatch = { index: 0, canvas: patchCanvas.canvas, left: 0, top: 0, width: 2, height: 3, crop: { left: 0, top: 0, width: 10, height: 12 } }
    const layerAtlases = { behindFace: canvas(10, 10, '').canvas, face: canvas(10, 10, '').canvas, inFrontOfFace: canvas(10, 10, '').canvas }

    expect(() => finalizeEditorV6MotionBake({
      atlas: atlas.canvas, frames: [{ ...motionFrame }], facePatches: [patch], key: 'motion-key', samples: 1,
      maxAtlasPixels: 200, metrics, layerFrames: [capturedLayerFrame], layerAtlases, captureLayerAtlases: () => { throw Error('falha sintética') },
      createCanvas: () => faceAtlas.canvas, createId: () => 'id'
    })).toThrow('falha sintética')
    expect([atlas.canvas.width, atlas.canvas.height, faceAtlas.canvas.width, faceAtlas.canvas.height]).toEqual([1, 1, 1, 1])
  })
})
