import { describe, expect, it, vi } from 'vitest'
import { buildEditorV6LegacyMouthAtlas, type LegacyMouthFrame } from '../../src/renderer/src/features/editorV6/motion/motionLegacyMouthAtlas'

function makeCanvas(width: number, height: number) {
  const drawImage = vi.fn()
  const canvas = { width, height, getContext: vi.fn(() => ({ drawImage })), toDataURL: vi.fn(() => 'data:legacy-mouth') } as unknown as HTMLCanvasElement
  return { canvas, drawImage }
}

function frame(dataUrl: string): LegacyMouthFrame {
  return { canvas: makeCanvas(40, 50).canvas, width: 40, height: 50, dispose: vi.fn(), dataUrl } as LegacyMouthFrame
}

const from = { x: 0.1, y: 0.2, width: 0.5, height: 0.6, rotation: 18, flipX: true }
const sourceCrop = { left: 10, top: 20, width: 20, height: 20 }
const changedBounds = { left: 12, top: 25, right: 15, bottom: 30 }

describe('Editor V6 legacy mouth atlas', () => {
  it('pads and clips the changed region, packs samples, and disposes frames and patches', async () => {
    const atlas = makeCanvas(0, 0), first = frame('first'), second = frame('second')
    const samples = [{ offset: 0, faceMode: 'talk' as const }, { offset: 3, faceMode: 'talk-blink' as const }]
    const render = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const patches: HTMLCanvasElement[] = []
    const createPatch = vi.fn((_source: HTMLCanvasElement, bounds: { left: number; top: number; right: number; bottom: number }) => {
      expect(bounds).toEqual({ left: 10, top: 22, right: 18, bottom: 33 })
      const patch = makeCanvas(9, 12).canvas
      patches.push(patch)
      return patch
    })

    const result = await buildEditorV6LegacyMouthAtlas({
      sourceCrop, changedBounds, samples, scales: [1, 1.25], from, key: 'legacy-loop', render,
      createCanvas: () => atlas.canvas, createPatch
    })

    expect(render.mock.calls).toEqual([['talk', 1], ['talk-blink', 1.25]])
    expect([atlas.canvas.width, atlas.canvas.height]).toEqual([1, 1])
    expect(atlas.drawImage).toHaveBeenCalledTimes(2)
    expect(result.asset).toMatchObject({ name: 'Camada facial da boca', dataUrl: 'data:legacy-mouth', timelineSnapshot: true })
    expect(result.atlasPixels).toBe(416)
    expect(result.motion).toMatchObject({ version: 1, key: 'legacy-loop', assetId: result.asset.id })
    expect(result.motion.frames).toEqual([
      { offset: 0, sprite: { x: 2, y: 2, width: 9, height: 12, atlasWidth: 26, atlasHeight: 16 }, ...from, facePatch: { sprite: { x: 2, y: 2, width: 9, height: 12, atlasWidth: 26, atlasHeight: 16 }, x: 0, y: 0.1, width: 0.45, height: 0.6, replace: true, replaceBounds: { x: 0, y: 1 / 12, width: 8 / 9, height: 10 / 12 } } },
      { offset: 3, sprite: { x: 15, y: 2, width: 9, height: 12, atlasWidth: 26, atlasHeight: 16 }, ...from, facePatch: { sprite: { x: 15, y: 2, width: 9, height: 12, atlasWidth: 26, atlasHeight: 16 }, x: 0, y: 0.1, width: 0.45, height: 0.6, replace: true, replaceBounds: { x: 0, y: 1 / 12, width: 8 / 9, height: 10 / 12 } } }
    ])
    expect([first.dispose, second.dispose].map(dispose => vi.mocked(dispose).mock.calls.length)).toEqual([1, 1])
    expect(patches.map(canvas => [canvas.width, canvas.height])).toEqual([[1, 1], [1, 1]])
  })

  it('rejects unsafe layouts before rendering any sample', async () => {
    const render = vi.fn()
    await expect(buildEditorV6LegacyMouthAtlas({
      sourceCrop: { left: 0, top: 0, width: 100, height: 100 },
      changedBounds: { left: 10, top: 10, right: 90, bottom: 90 },
      samples: [{ offset: 0 }, { offset: 1 }], scales: [1, 1], from, key: 'legacy-loop', maxAtlasPixels: 100, render
    })).rejects.toThrow('A camada facial em resolução nativa precisa de')
    expect(render).not.toHaveBeenCalled()
  })

  it('releases the atlas and rendered frame when a later sample fails', async () => {
    const atlas = makeCanvas(0, 0), first = frame('first')
    const render = vi.fn().mockResolvedValueOnce(first).mockRejectedValueOnce(Error('falha sintética'))
    const patches: HTMLCanvasElement[] = []
    await expect(buildEditorV6LegacyMouthAtlas({
      sourceCrop, changedBounds, samples: [{ offset: 0 }, { offset: 1 }], scales: [1, 1], from, key: 'legacy-loop', render,
      createCanvas: () => atlas.canvas,
      createPatch: () => { const patch = makeCanvas(9, 12).canvas; patches.push(patch); return patch }
    })).rejects.toThrow('falha sintética')
    expect(first.dispose).toHaveBeenCalledOnce()
    expect(patches.map(canvas => [canvas.width, canvas.height])).toEqual([[1, 1]])
    expect([atlas.canvas.width, atlas.canvas.height]).toEqual([1, 1])
  })
})
