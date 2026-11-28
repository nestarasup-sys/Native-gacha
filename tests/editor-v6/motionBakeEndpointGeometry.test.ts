import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Element } from '../../src/shared/editorV6'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import { editorV6MotionEndpointGeometryCacheKey, resolveMotionBakeEndpointGeometry, type CachedMotionBakeEndpointGeometry } from '../../src/renderer/src/features/editorV6/motion/motionBakeEndpointGeometry'

function crop(left: number, top: number, width: number, height: number) { return { left, top, width, height } }
function measurement(endpoint: 'from' | 'to', knownCrop?: CachedMotionBakeEndpointGeometry['crop']): CachedMotionBakeEndpointGeometry {
  return endpoint === 'from' ? { width: 500, height: 700, crop: knownCrop ?? crop(5, 18, 50, 70) }
    : { width: 550, height: 680, crop: knownCrop ?? crop(0, 15, 60, 75) }
}

describe('Editor V6 motion endpoint geometry', () => {
  it('shares cached crop geometry for identical snapshots on different timeline element IDs', () => {
    const character = { id: 'character-1', updatedAt: 'revision-1', customization: { poseSlot: 2 } } as unknown as CustomizerCharacter
    const state = { id: 'element-1', kind: 'character', characterId: character.id, poseSlot: 2, x: 10, y: 20 } as EditorV6Element
    const duplicate = { ...state, id: 'element-2' }

    expect(editorV6MotionEndpointGeometryCacheKey(character, duplicate)).toBe(editorV6MotionEndpointGeometryCacheKey(character, state))
    expect(editorV6MotionEndpointGeometryCacheKey(character, { ...state, x: 11 })).not.toBe(editorV6MotionEndpointGeometryCacheKey(character, state))
  })

  it('uses premeasured hair endpoint dimensions and crops without rendering again', async () => {
    const from = { ...crop(4, 8, 80, 120), outputWidth: 400, outputHeight: 600 }
    const to = { ...crop(2, 5, 90, 130), outputWidth: 440, outputHeight: 640 }
    const measure = vi.fn(async () => measurement('from'))

    const result = await resolveMotionBakeEndpointGeometry({ captureLayerAtlases: true, endpointCrops: { from, to }, measure })

    expect(result).toEqual({ fromCrop: from, toCrop: to, maximumCanvasWidth: 440, maximumCanvasHeight: 640, maximumAtlasWidth: 90, maximumAtlasHeight: 130, endpointGeometryCacheHits: 0, endpointGeometryCacheMisses: 0 })
    expect(measure).not.toHaveBeenCalled()
  })

  it('reuses exact endpoint geometry within the supplied export session cache', async () => {
    const cache = new Map()
    const measure = vi.fn(async (endpoint: 'from' | 'to') => measurement(endpoint))
    const base = { captureLayerAtlases: false, measure, endpointGeometryCache: cache }

    const first = await resolveMotionBakeEndpointGeometry({ ...base, endpointCacheKeys: { from: 'same-from', to: 'first-to' } })
    expect(measure).toHaveBeenCalledTimes(2)
    expect(first.toCrop).toEqual(measurement('to').crop)
    expect(first.maximumCanvasHeight).toBe(700)

    const second = await resolveMotionBakeEndpointGeometry({ ...base, endpointCacheKeys: { from: 'same-from', to: 'second-to' } })
    expect(measure).toHaveBeenCalledTimes(3)
    expect(second.fromCrop).toEqual(first.fromCrop)
    expect(second.maximumCanvasWidth).toBe(550)
    expect(cache.size).toBe(3)
    expect(first.endpointGeometryCacheHits).toBe(0)
    expect(first.endpointGeometryCacheMisses).toBe(2)
    expect(second.endpointGeometryCacheHits).toBe(1)
    expect(second.endpointGeometryCacheMisses).toBe(1)
  })

  it('keeps full-frame transform geometry while sizing atlases from alpha bounds', async () => {
    const from = { width: 1122, height: 1402, crop: crop(0, 0, 1122, 1402), atlasCrop: crop(180, 90, 744, 1217) }
    const to = { width: 1122, height: 1402, crop: crop(0, 0, 1122, 1402), atlasCrop: crop(170, 84, 740, 1190) }
    const result = await resolveMotionBakeEndpointGeometry({ captureLayerAtlases: false, measure: async (endpoint) => endpoint === 'from' ? from : to })

    expect(result.fromCrop).toEqual(from.crop)
    expect(result.toCrop).toEqual(to.crop)
    expect([result.maximumCanvasWidth, result.maximumCanvasHeight]).toEqual([1122, 1402])
    expect([result.maximumAtlasWidth, result.maximumAtlasHeight]).toEqual([744, 1217])
  })

  it('keeps supplied hair crops separate from cached snapshot measurements', async () => {
    const from = { ...crop(6, 9, 70, 100), outputWidth: 0, outputHeight: 500 }
    const to = crop(3, 4, 80, 110)
    const measure = vi.fn(async (endpoint: 'from' | 'to', knownCrop?: CachedMotionBakeEndpointGeometry['crop']) => measurement(endpoint, knownCrop))
    const cache = new Map([['from', measurement('from')]])

    const result = await resolveMotionBakeEndpointGeometry({ captureLayerAtlases: true, endpointCrops: { from, to }, measure,
      endpointGeometryCache: cache, endpointCacheKeys: { from: 'from', to: 'to' } })

    expect(result.fromCrop).toBe(from)
    expect(result.toCrop).toBe(to)
    expect(result.maximumCanvasWidth).toBe(550)
    expect(measure.mock.calls).toEqual([['from', from], ['to', to]])
    expect([...cache]).toEqual([['from', measurement('from')]])
  })
})
