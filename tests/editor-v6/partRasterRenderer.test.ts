import { describe, expect, it } from 'vitest'
import { createEditorV6PartRasterRenderer } from '../../src/shared/editorV6PartRasterRenderer'
import type { EditorV6ExperimentalPartFrame } from '../../src/shared/editorV6PartMotionPrototype'

function harness() {
  const calls: unknown[][] = []
  const context = Object.fromEntries(['save', 'restore', 'translate', 'rotate', 'scale', 'drawImage', 'clearRect'].map(name =>
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
  it('finishes a frame if cancellation is requested synchronously during drawing', async () => {
    const controller = new AbortController()
    const { canvas, calls } = harness()
    const originalContext = canvas.getContext()
    const context = {
      ...originalContext,
      drawImage: (...args: unknown[]) => {
        calls.push(['drawImage', ...args])
        controller.abort()
      }
    }
    const target = { ...canvas, getContext: () => context as never }
    const renderer = createEditorV6PartRasterRenderer(async () => ({} as never))
    const metrics = await renderer.render(frame([part('a', 'a'), part('b', 'b')]), target, controller.signal)
    expect(metrics.drawnParts).toBe(2)
    expect(calls.filter(call => call[0] === 'drawImage')).toHaveLength(2)
    expect(calls.filter(call => call[0] === 'restore')).toHaveLength(2)
    expect(calls.filter(call => call[0] === 'clearRect')).toHaveLength(1)
    await expect(renderer.render(frame([part('a', 'a')]), target, controller.signal)).rejects.toThrow('cancelled')
  })
  it('rejects malformed draw lists before decoding or clearing the target', async () => {
    const { canvas, calls } = harness()
    let decodes = 0
    const renderer = createEditorV6PartRasterRenderer(async () => { decodes++; return {} as never })
    const a = part('a', 'a')
    const b = { ...part('b', 'b'), order: 1 }
    const invalid = [
      { ...frame([a]), progress: Number.NaN },
      frame([a, { ...b, id: 'a' }]),
      frame([{ ...a, order: -1 }]),
      frame([{ ...a, visible: undefined as never }])
    ]
    for (const candidate of invalid) {
      await expect(renderer.render(candidate, canvas)).rejects.toThrow('invalid frame geometry')
    }
    expect(decodes).toBe(0)
    expect(calls).toHaveLength(0)
  })
  it('composites pre-rendered wardrobe, face and hair layers in explicit paint stages', async () => {
    const { canvas, calls } = harness()
    const renderer = createEditorV6PartRasterRenderer(async (source) => ({ source }) as never)
    const makeOverlay = (id: string, stage: 'behind-body' | 'over-body' | 'face' | 'front-hair') => ({
      id, stage, sourceDataUrl: id, visible: true, x: 3, y: 4, width: 12, height: 16,
      rotation: 20, opacity: 0.7, flipX: id === 'fringe'
    })
    const result = await renderer.render({
      ...frame([part('body', 'body')]),
      overlays: [
        makeOverlay('fringe', 'front-hair'), makeOverlay('shirt', 'over-body'),
        makeOverlay('rear-hair', 'behind-body'), makeOverlay('mouth', 'face'),
        { ...makeOverlay('unused', 'face'), visible: false }
      ]
    }, canvas)
    expect(result).toEqual({
      decodedImages: 5, reusedImages: 0, drawnParts: 1, skippedHiddenParts: 0,
      drawnOverlays: 4, skippedHiddenOverlays: 1
    })
    expect(calls.filter(x => x[0] === 'drawImage').map(x => (x[1] as { source: string }).source))
      .toEqual(['rear-hair', 'body', 'shirt', 'mouth', 'fringe'])
    expect(calls.filter(x => x[0] === 'scale')).toEqual([['scale', -1, 1]])
    expect(calls.filter(x => x[0] === 'restore')).toHaveLength(5)
  })
  it('bounds parallel image decoding to four while preparing all sources before painting', async () => {
    let running = 0, peak = 0
    const renderer = createEditorV6PartRasterRenderer(async () => {
      running++
      peak = Math.max(peak, running)
      await Promise.resolve()
      running--
      return {} as never
    })
    const { canvas, calls } = harness()
    const all = Array.from({ length: 12 }, (_, i) => ({ ...part('piece-' + i, 'image-' + i), order: i }))
    const result = await renderer.render(frame(all), canvas)
    expect(peak).toBe(4)
    expect(result.decodedImages).toBe(12)
    expect(result.drawnParts).toBe(12)
    expect(calls.filter(x => x[0] === 'drawImage')).toHaveLength(12)
    const warmed = await renderer.render(frame(all), canvas)
    expect(warmed.decodedImages).toBe(0)
    expect(warmed.reusedImages).toBe(12)
  })
  it('rejects invalid layered commands without modifying the destination canvas', async () => {
    const { canvas, calls } = harness()
    let decodes = 0
    const renderer = createEditorV6PartRasterRenderer(async () => { decodes++; return {} as never })
    const base = { id: 'overlay', sourceDataUrl: 'overlay', stage: 'face' as const,
      visible: true, x: 0, y: 0, width: 10, height: 10, rotation: 0 }
    const invalid = [
      { ...base, opacity: 1.01 },
      { ...base, flipX: 'yes' as never },
      { ...base, stage: 'unknown' as never },
      { ...base, width: Infinity },
      { ...base, id: 'body' },
      null as never
    ]
    for (const layer of invalid) {
      await expect(renderer.render({ ...frame([part('body', 'body')]), overlays: [layer] }, canvas))
        .rejects.toThrow('invalid frame geometry')
    }
    expect(decodes).toBe(0)
    expect(calls).toHaveLength(0)
  })
  it('rejects invalid cache capacities', () => {
    for (const capacity of [0, -1, 257, 1.5, Number.NaN]) {
      expect(() => createEditorV6PartRasterRenderer(async () => ({} as never), capacity)).toThrow()
    }
  })
})
