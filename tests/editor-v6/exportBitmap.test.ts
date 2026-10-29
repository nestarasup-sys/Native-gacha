import { describe, expect, it, vi } from 'vitest'
import type { NativeImage } from 'electron'
import { exportBitmap } from '../../electron/domains/editorV6/exportBitmap'

describe('native export readback', () => {
  it('returns exact native pixels without resampling an already matching frame', () => {
    const pixels = Buffer.from([0, 255, 255, 255, 0, 0, 255, 255])
    const image = { getSize: () => ({ width: 2, height: 1 }), toBitmap: vi.fn(() => pixels), resize: vi.fn() }
    expect(exportBitmap(image as unknown as NativeImage, 2, 1)).toBe(pixels)
    expect(image.resize).not.toHaveBeenCalled()
  })
  it('materializes source pixels before resampling a different size', () => {
    const events: string[] = []
    const expected = Buffer.alloc(16, 42)
    const image = {
      getSize: () => ({ width: 1, height: 1 }),
      toBitmap: () => { events.push('read'); return Buffer.alloc(4) },
      resize: () => { events.push('resize'); return { toBitmap: () => expected } }
    }
    expect(exportBitmap(image as unknown as NativeImage, 2, 2)).toBe(expected)
    expect(events).toEqual(['read', 'resize'])
  })
  it('rejects a malformed resampled buffer before passing it to FFmpeg', () => {
    const image = { getSize: () => ({ width: 1, height: 1 }), toBitmap: () => Buffer.alloc(0), resize: () => ({ toBitmap: () => Buffer.alloc(1) }) }
    expect(() => exportBitmap(image as unknown as NativeImage, 2, 2)).toThrow('Dimensões inesperadas')
  })
})
