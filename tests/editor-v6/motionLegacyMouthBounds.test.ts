import { describe, expect, it, vi } from 'vitest'
import { detectEditorV6LegacyMouthBounds, type LegacyMouthBoundsFrame } from '../../src/renderer/src/features/editorV6/motion/motionLegacyMouthBounds'

function frame(pixels: Uint8ClampedArray, fingerprint: number): LegacyMouthBoundsFrame {
  const getImageData = vi.fn(() => ({ data: pixels }))
  const canvas = { getContext: vi.fn(() => ({ getImageData })) } as unknown as HTMLCanvasElement
  return { canvas, width: 4, height: 2, crop: { left: 8, top: 12, width: 4, height: 2, fingerprint }, dispose: vi.fn() }
}

function withPixelChanges(...positions: Array<[number, number]>): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(4 * 2 * 4)
  for (const [x, y] of positions) pixels[(y * 4 + x) * 4 + 3] = 255
  return pixels
}

describe('Editor V6 legacy mouth bounds', () => {
  it('unions changed pixels from multiple scales and disposes comparison frames', async () => {
    const baseline = frame(new Uint8ClampedArray(32), 10)
    const intermediate = frame(withPixelChanges([1, 0]), 10), open = frame(withPixelChanges([1, 0], [3, 1]), 11)
    const render = vi.fn().mockResolvedValueOnce(intermediate).mockResolvedValueOnce(open)

    const result = await detectEditorV6LegacyMouthBounds({ baseline, scales: [1, 1.05, 1.1], faceMode: 'talk', render })

    expect(result).toEqual({ sourceCrop: baseline.crop, changedBounds: { left: 1, top: 0, right: 3, bottom: 1 } })
    expect(render.mock.calls).toEqual([[0, 'talk', 1.05, false], [0, 'talk', 1.1, true]])
    expect(intermediate.dispose).toHaveBeenCalledOnce()
    expect(open.dispose).toHaveBeenCalledOnce()
    expect(baseline.dispose).not.toHaveBeenCalled()
  })

  it('rejects an open-mouth sample with the unchanged crop fingerprint and still disposes it', async () => {
    const baseline = frame(new Uint8ClampedArray(32), 10), comparison = frame(withPixelChanges([2, 1]), 10)
    const render = vi.fn().mockResolvedValue(comparison)

    await expect(detectEditorV6LegacyMouthBounds({ baseline, scales: [1, 1.1], faceMode: 'talk-blink', render }))
      .rejects.toThrow('A boca aberta não respondeu à ampliação; confira se o personagem tem uma variante de boca aberta editável no catálogo facial.')
    expect(comparison.dispose).toHaveBeenCalledOnce()
  })

  it('reports missing pixel changes and disposes the final comparison frame', async () => {
    const baseline = frame(new Uint8ClampedArray(32), 10), comparison = frame(new Uint8ClampedArray(32), 11)

    await expect(detectEditorV6LegacyMouthBounds({ baseline, scales: [1, 1.1], faceMode: 'talk', render: async () => comparison }))
      .rejects.toThrow('A animação da boca não alterou pixels do personagem; confira o vínculo da boca aberta no catálogo facial.')
    expect(comparison.dispose).toHaveBeenCalledOnce()
  })
})
