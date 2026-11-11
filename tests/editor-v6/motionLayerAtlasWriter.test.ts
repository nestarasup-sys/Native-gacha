import { describe, expect, it, vi } from 'vitest'
import type { EditorV6MotionFrame } from '../../src/shared/editorV6Motion'
import type { CroppedMotionLayers } from '../../src/renderer/src/features/editorV6/motion/motionLayerCrops'
import { createEditorV6MotionLayerAtlases, disposeEditorV6MotionLayerAtlases, writeEditorV6MotionLayerAtlasFrame } from '../../src/renderer/src/features/editorV6/motion/motionLayerAtlasWriter'

function canvas(name: string, events: string[] = []) {
  const drawImage = vi.fn(() => events.push(name))
  const value = { width: 8, height: 10, getContext: vi.fn(() => ({ drawImage })) } as unknown as HTMLCanvasElement
  return { canvas: value, drawImage }
}

function layers(events: string[] = []): CroppedMotionLayers {
  return {
    behindFace: canvas('behind', events).canvas,
    face: canvas('face', events).canvas,
    posteriorHair: canvas('posterior', events).canvas,
    inFrontOfFace: null,
    eyesAboveRearHair: canvas('eyes', events).canvas
  }
}

const motionFrame = { offset: 2, sprite: { x: 4, y: 6, width: 20, height: 30, atlasWidth: 100, atlasHeight: 120 }, x: 0.1, y: 0.2, width: 0.3, height: 0.4, rotation: 7, flipX: true } as EditorV6MotionFrame

describe('Editor V6 motion layer atlas writer', () => {
  it('draws layers in order, lazily allocates optional atlases, and records frame geometry', () => {
    const created: HTMLCanvasElement[] = [], events: string[] = []
    const createCanvas = vi.fn(() => {
      const value = canvas(`atlas-${created.length}`, events).canvas
      created.push(value)
      return value
    })
    const atlases = createEditorV6MotionLayerAtlases(100, 120, createCanvas)
    const sourceLayers = layers(events)
    const crop = { left: 12, top: 14, width: 16, height: 18, fingerprint: 123 }

    const result = writeEditorV6MotionLayerAtlasFrame({
      atlases, layers: sourceLayers, motionFrame, offset: 2, crop,
      destination: { x: 30, y: 40, width: 32, height: 36 }, createCanvas
    })

    expect(events).toEqual(['atlas-0', 'atlas-1', 'atlas-3', 'atlas-4'])
    expect(createCanvas).toHaveBeenCalledTimes(5)
    expect([atlases.posteriorHair?.width, atlases.posteriorHair?.height, atlases.eyesAboveRearHair?.width, atlases.eyesAboveRearHair?.height]).toEqual([100, 120, 100, 120])
    expect(result).toEqual({ offset: 2, ...motionFrame, crop: { left: 12, top: 14, width: 16, height: 18 } })
    expect(sourceLayers.behindFace.width).toBe(1)
    disposeEditorV6MotionLayerAtlases(atlases)
    expect(created.map(item => [item.width, item.height])).toEqual([[1, 1], [1, 1], [1, 1], [1, 1], [1, 1]])
  })

  it('rejects missing layer data', () => {
    const atlases = createEditorV6MotionLayerAtlases(20, 30, () => canvas('atlas').canvas)
    expect(() => writeEditorV6MotionLayerAtlasFrame({ atlases, motionFrame, offset: 0, crop: { left: 0, top: 0, width: 1, height: 1 }, destination: { x: 0, y: 0, width: 1, height: 1 } }))
      .toThrow('A preparação do cabelo não capturou as camadas da pose intermediária.')
  })

  it('releases partially allocated required atlases if allocation fails', () => {
    const first = canvas('first').canvas
    let calls = 0
    expect(() => createEditorV6MotionLayerAtlases(20, 30, () => {
      calls++
      if (calls === 2) throw Error('falha sintética')
      return first
    })).toThrow('falha sintética')
    expect([first.width, first.height]).toEqual([1, 1])
  })
})
