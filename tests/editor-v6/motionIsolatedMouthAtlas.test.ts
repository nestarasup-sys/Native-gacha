import { describe, expect, it, vi } from 'vitest'
import { buildEditorV6IsolatedMouthAtlas, type IsolatedMouthPatch } from '../../src/renderer/src/features/editorV6/motion/motionIsolatedMouthAtlas'

function makeCanvas(width: number, height: number) {
  const drawImage = vi.fn()
  const context = { drawImage }
  const canvas = { width, height, getContext: vi.fn(() => context), toDataURL: vi.fn(() => 'data:mouth-atlas') } as unknown as HTMLCanvasElement
  return { canvas, drawImage }
}

function patch(width: number, height: number, crop: IsolatedMouthPatch['crop']): IsolatedMouthPatch {
  return { canvas: makeCanvas(width, height).canvas, crop }
}

describe('Editor V6 isolated mouth atlas', () => {
  it('packs samples and stores matching normalized frame and face-patch metadata', () => {
    const atlas = makeCanvas(0, 0), first = patch(14, 18, { left: 12, top: 25, width: 10, height: 14 }), second = patch(14, 18, { left: 14, top: 27, width: 8, height: 12 })
    const createId = vi.fn(() => 'mouth-id')

    const result = buildEditorV6IsolatedMouthAtlas({
      patches: [first, second], sampleOffsets: [0, 4], sourceCrop: { left: 10, top: 20, width: 20, height: 30 },
      key: 'speech-loop', rotation: 12, flipX: true, createCanvas: () => atlas.canvas, createId
    })

    expect([atlas.canvas.width, atlas.canvas.height]).toEqual([28, 18])
    expect(atlas.canvas.toDataURL).toHaveBeenCalledWith('image/png')
    expect(atlas.drawImage).toHaveBeenCalledTimes(2)
    expect(result.asset).toMatchObject({ id: 'mouth-id', name: 'Atlas isolado da boca', dataUrl: 'data:mouth-atlas', timelineSnapshot: true })
    expect(result.atlasPixels).toBe(504)
    expect(result.motion).toMatchObject({ version: 1, key: 'speech-loop', assetId: 'mouth-id' })
    expect(result.motion.frames).toEqual([
      { offset: 0, sprite: { x: 2, y: 2, width: 10, height: 14, atlasWidth: 28, atlasHeight: 18 }, x: 0.1, y: 1 / 6, width: 0.5, height: 14 / 30, rotation: 12, flipX: true, facePatch: { sprite: { x: 2, y: 2, width: 10, height: 14, atlasWidth: 28, atlasHeight: 18 }, x: 0.1, y: 1 / 6, width: 0.5, height: 14 / 30 } },
      { offset: 4, sprite: { x: 16, y: 2, width: 8, height: 12, atlasWidth: 28, atlasHeight: 18 }, x: 0.2, y: 7 / 30, width: 0.4, height: 0.4, rotation: 12, flipX: true, facePatch: { sprite: { x: 16, y: 2, width: 8, height: 12, atlasWidth: 28, atlasHeight: 18 }, x: 0.2, y: 7 / 30, width: 0.4, height: 0.4 } }
    ])
    expect(createId).toHaveBeenCalledOnce()
  })

  it('rejects unsafe native atlas dimensions before allocating the atlas', () => {
    const atlas = makeCanvas(0, 0)
    expect(() => buildEditorV6IsolatedMouthAtlas({
      patches: [patch(100, 100, { left: 0, top: 0, width: 96, height: 96 })],
      sampleOffsets: [0, 1], sourceCrop: { left: 0, top: 0, width: 100, height: 100 },
      key: 'speech-loop', rotation: 0, flipX: false, maxAtlasPixels: 100, createCanvas: () => atlas.canvas
    })).toThrow('A camada facial em resolução nativa precisa de')
    expect([atlas.canvas.width, atlas.canvas.height]).toEqual([0, 0])
  })

  it('rejects a mouth outside the character crop and releases the allocated canvas', () => {
    const atlas = makeCanvas(0, 0)
    expect(() => buildEditorV6IsolatedMouthAtlas({
      patches: [patch(8, 8, { left: 90, top: 10, width: 20, height: 10 })],
      sampleOffsets: [0], sourceCrop: { left: 0, top: 0, width: 100, height: 100 },
      key: 'speech-loop', rotation: 0, flipX: false, createCanvas: () => atlas.canvas
    })).toThrow('A boca isolada ficou fora do recorte corporal usado pelo personagem.')
    expect([atlas.canvas.width, atlas.canvas.height]).toEqual([1, 1])
  })

  it('rejects a plan with more samples than isolated mouth patches', () => {
    const atlas = makeCanvas(0, 0)
    expect(() => buildEditorV6IsolatedMouthAtlas({
      patches: [patch(8, 8, { left: 10, top: 10, width: 4, height: 4 })],
      sampleOffsets: [0, 1], sourceCrop: { left: 0, top: 0, width: 30, height: 30 },
      key: 'speech-loop', rotation: 0, flipX: false, createCanvas: () => atlas.canvas
    })).toThrow('O ciclo de fala não contém uma amostra isolada da boca.')
    expect([atlas.canvas.width, atlas.canvas.height]).toEqual([1, 1])
  })
})
