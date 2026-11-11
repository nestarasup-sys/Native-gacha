import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Element } from '../../src/shared/editorV6'
import type { CroppedMotionLayers } from '../../src/renderer/src/features/editorV6/motion/motionLayerCrops'
import type { MotionAtlasSourceFrame } from '../../src/renderer/src/features/editorV6/motion/motionAtlasSourcePreparation'
import { bakeEditorV6MotionAtlasFrames } from '../../src/renderer/src/features/editorV6/motion/motionAtlasFrameBaking'

function canvas(width = 0, height = 0) {
  const drawImage = vi.fn()
  const value = { width, height, getContext: vi.fn(() => ({ drawImage })) } as unknown as HTMLCanvasElement
  return { canvas: value, drawImage }
}

function frame(width: number, height: number, left: number, top: number): MotionAtlasSourceFrame {
  return { canvas: canvas(100, 100).canvas, width: 100, height: 100, crop: { left, top, width, height }, dispose: vi.fn() }
}

function actor(overrides: Record<string, unknown> = {}): EditorV6Element {
  return { kind: 'character', x: 0.1, y: 0.2, width: 100, height: 100, rotation: 0, flipX: false, ...overrides } as unknown as EditorV6Element
}

const common = {
  from: actor(),
  to: actor({ x: 0.8, y: 0.7, rotation: 90, flipX: true }),
  fromCrop: { left: 0, top: 0, width: 100, height: 100 },
  toCrop: { left: 5, top: 6, width: 100, height: 100 },
  maximumWidth: 10,
  maximumHeight: 12,
  columns: 2,
  rows: 1,
  ratio: 0.5,
  captureLayers: false
}

describe('Editor V6 motion atlas frame baking', () => {
  it('draws cropped samples into atlas cells and returns motion/face metadata', async () => {
    const atlas = canvas(), first = frame(8, 10, 2, 3), second = frame(6, 7, 4, 5)
    const sources = [first, second]
    let renderIndex = 0
    const result = await bakeEditorV6MotionAtlasFrames({
      ...common,
      samples: [{ offset: 0, progress: 0.25, faceMode: 'idle' }, { offset: 2, progress: 0.75, faceMode: 'talk' }],
      render: vi.fn(async () => sources[renderIndex++]),
      prepareFacePatch: vi.fn(async ({ index }) => index === 0 ? { index, canvas: canvas().canvas, left: 1, top: 1, width: 2, height: 2, crop: first.crop } : undefined),
      createCanvas: () => atlas.canvas
    })

    expect([atlas.canvas.width, atlas.canvas.height]).toEqual([10, 6])
    expect(atlas.drawImage).toHaveBeenCalledTimes(2)
    expect(atlas.drawImage.mock.calls.map(([, sx, sy, sw, sh, dx, dy, dw, dh]) => [sx, sy, sw, sh, dx, dy, dw, dh])).toEqual([
      [2, 3, 8, 10, 0, 0, 4, 5], [4, 5, 6, 7, 5, 0, 3, 4]
    ])
    expect(result.frames.map(item => [item.offset, item.sprite, item.flipX])).toEqual([
      [0, { x: 0, y: 0, width: 4, height: 5, atlasWidth: 10, atlasHeight: 6 }, false],
      [2, { x: 5, y: 0, width: 3, height: 4, atlasWidth: 10, atlasHeight: 6 }, true]
    ])
    expect(result.facePatches.map(({ index }) => index)).toEqual([0])
    expect(result.layerFrames).toEqual([])
    expect([first.dispose, second.dispose].map(dispose => vi.mocked(dispose).mock.calls.length)).toEqual([1, 1])
  })

  it('captures split-layer geometry when requested', async () => {
    const atlas = canvas(), current = { ...frame(8, 10, 2, 3), layers: {} as NonNullable<MotionAtlasSourceFrame['layers']> }
    const croppedLayers = { behindFace: canvas(8, 10).canvas, face: canvas(8, 10).canvas, posteriorHair: null, inFrontOfFace: null, eyesAboveRearHair: null } as CroppedMotionLayers
    const created: HTMLCanvasElement[] = []

    const result = await bakeEditorV6MotionAtlasFrames({
      ...common, columns: 1, rows: 1, captureLayers: true,
      samples: [{ offset: 1, progress: 0.5, faceMode: 'idle' }],
      render: async () => current,
      prepareFacePatch: async () => undefined,
      cropLayers: () => croppedLayers,
      createCanvas: () => { if (!created.length) { created.push(atlas.canvas); return atlas.canvas }; const layerAtlas = canvas(); created.push(layerAtlas.canvas); return layerAtlas.canvas }
    })

    expect(result.layerAtlases).toBeDefined()
    expect(result.layerFrames).toHaveLength(1)
    expect(result.layerFrames[0]).toMatchObject({ offset: 1, crop: current.crop })
    expect(current.dispose).toHaveBeenCalledOnce()
    expect(croppedLayers.behindFace.width).toBe(1)
  })

  it('releases atlas and completed face patches if a later frame render fails', async () => {
    const atlas = canvas(), first = frame(8, 10, 2, 3), patch = canvas(2, 2).canvas
    const render = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(Error('falha sintética'))

    await expect(bakeEditorV6MotionAtlasFrames({
      ...common,
      samples: [{ offset: 0, progress: 0.2 }, { offset: 1, progress: 0.8 }],
      render,
      prepareFacePatch: async () => ({ index: 0, canvas: patch, left: 1, top: 1, width: 2, height: 2, crop: first.crop }),
      createCanvas: () => atlas.canvas
    })).rejects.toThrow('falha sintética')
    expect(first.dispose).toHaveBeenCalledOnce()
    expect([atlas.canvas.width, atlas.canvas.height]).toEqual([1, 1])
    expect([patch.width, patch.height]).toEqual([1, 1])
  })
})
