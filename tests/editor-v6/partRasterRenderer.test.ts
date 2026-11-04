import { describe, expect, it } from 'vitest'
import { createEditorV6PartRasterRenderer } from '../../src/shared/editorV6PartRasterRenderer'
import type { EditorV6ExperimentalPartFrame } from '../../src/shared/editorV6PartMotionPrototype'

function harness() {
  const calls: unknown[][] = []
  const context = Object.fromEntries(['save', 'restore', 'translate', 'rotate', 'drawImage', 'clearRect'].map(name =>
    [name, (...args: unknown[]) => { calls.push([name, ...args]) }]))
  const canvas = { width: 100, height: 100, getContext: () => context as never }
  return { canvas, calls }
}
const part = (id: string, sourceDataUrl: string, visible = true) => ({
  id, sourceDataUrl, visible, order: 0, x: 10, y: 20, width: 30, height: 40, rotation: 90
})
const frame = (parts: ReturnType<typeof part>[]): EditorV6ExperimentalPartFrame => ({
  progress: 0.5, width: 100, height: 100, parts
})
describe('R37 isolated piece raster backend', () => {
  it('draws in compiler order with rotation, transparency reset and no hidden images', async () => {
    const { canvas, calls } = harness()
    const decode = async (source: string) => ({ source }) as never
    const renderer = createEditorV6PartRasterRenderer(decode)
    const metrics = await renderer.render(frame([part('arm', 'a'), part('hidden', 'b', false)]), canvas)
    expect(metrics).toEqual({ decodedImages: 1, reusedImages: 0, drawnParts: 1, skippedHiddenParts: 1 })
    expect(calls.map(x => x[0])).toEqual(['clearRect', 'save', 'translate', 'rotate', 'drawImage', 'restore'])
    expect(calls[2]).toEqual(['translate', 25, 40])
    expect(calls[3]).toEqual(['rotate', Math.PI / 2])
    expect(calls[4].slice(2)).toEqual([-15, -20, 30, 40])
  })
  it('reuses decoded sources across frames, never caches complete frames', async () => {
    let decodes = 0
    const renderer = createEditorV6PartRasterRenderer(async () => { decodes++; return {} as never })
    const { canvas, calls } = harness()
    await renderer.render(frame([part('a', 'same'), part('b', 'same')]), canvas)
    const result = await renderer.render(frame([part('a', 'same')]), canvas)
    expect(result.decodedImages).toBe(0)
    expect(result.reusedImages).toBe(1)
    expect(decodes).toBe(1)
    expect(calls.filter(x => x[0] === 'clearRect')).toHaveLength(2)
  })
  it('evicts bounded cache and supports explicit invalidation', async () => {
    let decodes = 0
    const renderer = createEditorV6PartRasterRenderer(async () => { decodes++; return {} as never }, 2)
    const { canvas } = harness()
    for (const key of ['a', 'b', 'c', 'a']) await renderer.render(frame([part(key, key)]), canvas)
    expect(decodes).toBe(4)
    expect(renderer.cachedSources()).toBe(2)
    renderer.clear()
    expect(renderer.cachedSources()).toBe(0)
    await renderer.render(frame([part('a', 'a')]), canvas)
    expect(decodes).toBe(5)
  })
  it('rejects cancellation, invalid geometry and decoding errors before clearing target', async () => {
    const { canvas, calls } = harness()
    const renderer = createEditorV6PartRasterRenderer(async () => { throw new Error('decode failed') })
    await expect(renderer.render(frame([part('a', 'a')]), canvas)).rejects.toThrow('decode failed')
    expect(calls).toHaveLength(0)
    await expect(renderer.render(frame([{ ...part('a', 'a'), width: 0 }]), canvas)).rejects.toThrow('invalid frame geometry')
    await expect(renderer.render(frame([part('a', 'a')]), { ...canvas, width: 50 })).rejects.toThrow('target size')
    const controller = new AbortController()
    controller.abort()
    await expect(renderer.render(frame([part('a', 'a')]), canvas, controller.signal)).rejects.toThrow('cancelled')
    expect(calls).toHaveLength(0)
  })
  it('shares concurrent decoding without coupling it to cancellation of one consumer', async () => {
    let resolve!: (value: never) => void
    let decodes = 0
    const renderer = createEditorV6PartRasterRenderer(() => {
      decodes++
      return new Promise<never>(r => { resolve = r })
    })
    const cancelled = new AbortController()
    const first = renderer.render(frame([part('a', 'same')]), harness().canvas, cancelled.signal)
    const second = renderer.render(frame([part('b', 'same')]), harness().canvas)
    await Promise.resolve()
    cancelled.abort()
    resolve({} as never)
    await expect(first).rejects.toThrow('cancelled')
    await expect(second).resolves.toMatchObject({ drawnParts: 1 })
    expect(decodes).toBe(1)
    expect(renderer.cachedSources()).toBe(1)
  })
  it('rejects invalid cache capacities', () => {
    for (const capacity of [0, -1, 257, 1.5, Number.NaN]) {
      expect(() => createEditorV6PartRasterRenderer(async () => ({} as never), capacity)).toThrow()
    }
  })
})
