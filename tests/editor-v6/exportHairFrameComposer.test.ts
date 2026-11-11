import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorV6FrameMetrics, EditorV6FrameTimings } from '../../src/shared/editorV6Export'
import type { EditorV6HairMotionLayer, EditorV6HairMotionRig, EditorV6HairMotionTransition } from '../../src/shared/editorV6HairMotion'
import type { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { createEditorV6ExportHairFrameComposer } from '../../src/renderer/src/features/editorV6/exportHairFrameComposer'

type SceneElement = ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number]
type CanvasSurface = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }

afterEach(() => vi.unstubAllGlobals())

function rig(): EditorV6HairMotionRig {
  const piece = (id: string, side: EditorV6HairMotionLayer['side']) => ({ id, side, textureId: id, width: 1, height: 1, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, phase: 0 })
  return {
    elementId: 'actor', assetId: 'asset', characterId: 'character', poseSlot: null, baseSurfaceId: 'base', faceSurfaceId: 'face', overlaySurfaceId: 'overlay', eyesAboveRearHairSurfaceId: 'eyes',
    artworkWidth: 10, artworkHeight: 8, outputWidth: 10, outputHeight: 8, shapeScaleX: 1, shapeScaleY: 1,
    sourceCrop: { left: 0, top: 0, width: 10, height: 8 }, sourceHead: { width: 1, height: 1 }, targetHead: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    layers: [piece('back', 'back'), piece('rearHair:one', 'fringe'), piece('front', 'front'), piece('fringe', 'fringe')]
  }
}

function installCanvasFactory(order: string[], contextAvailable = true) {
  vi.stubGlobal('document', {
    createElement: () => {
      const context = {
        clearRect: vi.fn(), save: vi.fn(), translate: vi.fn(), scale: vi.fn(), restore: vi.fn(),
        drawImage: vi.fn((image: { name: string }) => order.push(image.name))
      }
      return { width: 0, height: 0, getContext: () => contextAvailable ? context : null } as unknown as HTMLCanvasElement
    }
  })
}

function surface(name: string): HTMLImageElement {
  return { name } as unknown as HTMLImageElement
}

function composer(order: string[]) {
  const hairSurfaces = new Map(['base', 'face', 'eyes', 'overlay', 'behind', 'atlasFace', 'atlasEyes', 'atlasOverlay'].map(id => [id, surface(id)]))
  const drawHairPiece = vi.fn((_context: CanvasRenderingContext2D, _rig: EditorV6HairMotionRig, piece: EditorV6HairMotionLayer) => order.push(piece.id))
  const hairFrameCanvases = new Map<string, CanvasSurface>()
  const motionHairFrameSurfaces = new Map<string, CanvasSurface>()
  return { ...createEditorV6ExportHairFrameComposer({ hairSurfaces, hairFrameCanvases, motionHairFrameSurfaces, drawHairPiece }), hairFrameCanvases, motionHairFrameSurfaces }
}

describe('createEditorV6ExportHairFrameComposer', () => {
  it('preserves normal hair layer order, reuses its canvas and reports raster metrics', () => {
    const order: string[] = []
    installCanvasFactory(order)
    const factory = composer(order)
    const metrics: EditorV6FrameMetrics = {}
    const timings: EditorV6FrameTimings = {}
    const element = { id: 'actor' } as SceneElement

    const first = factory.composeHairFrame(rig(), element, 0, timings, metrics)
    const second = factory.composeHairFrame(rig(), element, 1, timings, metrics)

    expect(first).toBe(second)
    expect(order).toEqual(['back', 'base', 'face', 'rearHair:one', 'eyes', 'front', 'fringe', 'overlay', 'back', 'base', 'face', 'rearHair:one', 'eyes', 'front', 'fringe', 'overlay'])
    expect(metrics).toEqual({ hairRasterFrames: 2, hairRasterPixels: 160 })
    expect(factory.hairFrameCanvases.size).toBe(1)
    expect(timings.hairSurfaceComposeMs).toBeGreaterThanOrEqual(0)
  })

  it('composes transition atlases in layer order and resizes its per-actor surface', () => {
    const order: string[] = []
    installCanvasFactory(order)
    const factory = composer(order)
    const currentRig = rig()
    const transition = { atlas: { behindFaceSurfaceId: 'behind', faceSurfaceId: 'atlasFace', eyesAboveRearHairSurfaceId: 'atlasEyes', overlaySurfaceId: 'atlasOverlay' } } as { atlas: EditorV6HairMotionTransition }
    const sample = { sprite: { x: 0, y: 0, width: 4, height: 4 }, crop: { left: 0, top: 0, width: 4, height: 4 } } as EditorV6HairMotionTransition['frames'][number]

    const canvas = factory.composeMotionHairFrame('actor', currentRig, { id: 'actor' } as SceneElement, 0, transition, sample, {}, {})
    const resized = factory.composeMotionHairFrame('actor', { ...currentRig, outputWidth: 20, outputHeight: 5 }, { id: 'actor' } as SceneElement, 1, transition, sample, {}, {})

    expect(canvas).toBe(resized)
    expect(resized.width).toBe(20)
    expect(resized.height).toBe(5)
    expect(order).toEqual(['back', 'behind', 'atlasFace', 'rearHair:one', 'atlasEyes', 'front', 'fringe', 'atlasOverlay', 'back', 'behind', 'atlasFace', 'rearHair:one', 'atlasEyes', 'front', 'fringe', 'atlasOverlay'])
    expect(factory.motionHairFrameSurfaces.size).toBe(1)
  })

  it('reports a missing canvas context instead of silently skipping composition', () => {
    const order: string[] = []
    installCanvasFactory(order, false)
    const factory = composer(order)

    expect(() => factory.composeHairFrame(rig(), { id: 'actor' } as SceneElement, 0, {}, {})).toThrow(/compor o personagem animado/)
  })
})
