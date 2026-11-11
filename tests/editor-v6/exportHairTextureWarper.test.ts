import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIRST_HAIR_MOTION_PRESET, type HairMotionSettings, type HairMotionState } from '../../src/shared/hairMotionEngine'
import type { EditorV6FrameTimings } from '../../src/shared/editorV6Export'
import { createEditorV6ExportHairTextureWarper } from '../../src/renderer/src/features/editorV6/exportHairTextureWarper'

afterEach(() => vi.unstubAllGlobals())

function canvasFactory(contextAvailable = true) {
  const created: Array<{ canvas: HTMLCanvasElement; context: Record<string, unknown> }> = []
  vi.stubGlobal('document', {
    createElement: () => {
      const context = {
        clearRect: vi.fn(), drawImage: vi.fn(), imageSmoothingEnabled: false, imageSmoothingQuality: 'low'
      }
      const canvas = { width: 0, height: 0, getContext: () => contextAvailable ? context : null } as unknown as HTMLCanvasElement
      created.push({ canvas, context })
      return canvas
    }
  })
  return created
}

function image(width = 100, height = 50) {
  return { naturalWidth: width, naturalHeight: height } as HTMLImageElement
}

const settings: HairMotionSettings = { ...FIRST_HAIR_MOTION_PRESET.physics, enabled: true }
const restingState = { time: 0 } as HairMotionState
const movingState = { time: 1 } as HairMotionState

describe('createEditorV6ExportHairTextureWarper', () => {
  it('creates and reuses a separate padded canvas for a static strand', () => {
    const created = canvasFactory()
    const render = vi.fn()
    const warper = createEditorV6ExportHairTextureWarper({
      hairWarpCanvases: new Map(), staticHairWarpCanvases: new Map(),
      hairMeshRenderer: { render, getTimings: () => ({ positionMs: 0, uploadMs: 0, textureUploadMs: 0, drawMs: 0, contextCheckMs: 0, stateSetupMs: 0 }) }
    })
    const source = image()
    const timings: EditorV6FrameTimings = {}

    const first = warper.warpHairTexture('strand', source, restingState, settings, 100, 0, timings)
    const second = warper.warpHairTexture('strand', source, restingState, settings, 100, 0, timings)

    expect(first).toBe(second)
    expect(first.width).toBe(180)
    expect(first.height).toBe(65)
    expect(created).toHaveLength(1)
    expect(created[0].context.clearRect).toHaveBeenCalledWith(0, 0, 180, 65)
    expect(created[0].context.drawImage).toHaveBeenCalledWith(source, 0, 0, 100, 50, 40, 7.5, 100, 50)
    expect(created[0].context.imageSmoothingEnabled).toBe(true)
    expect(created[0].context.imageSmoothingQuality).toBe('high')
    expect(render).not.toHaveBeenCalled()
  })

  it('blits the exact source viewport from WebGL and accumulates renderer timings', () => {
    const created = canvasFactory()
    const mesh = { width: 300, height: 90 } as HTMLCanvasElement
    const render = vi.fn(() => mesh)
    const getTimings = vi.fn()
      .mockReturnValueOnce({ positionMs: 1, uploadMs: 2, textureUploadMs: 3, drawMs: 4, contextCheckMs: 5, stateSetupMs: 6 })
      .mockReturnValueOnce({ positionMs: 11, uploadMs: 12, textureUploadMs: 13, drawMs: 14, contextCheckMs: 15, stateSetupMs: 16 })
    const warper = createEditorV6ExportHairTextureWarper({
      hairWarpCanvases: new Map(), staticHairWarpCanvases: new Map(), hairMeshRenderer: { render, getTimings }
    })
    const source = image()
    const timings: EditorV6FrameTimings = {}
    const output = warper.warpHairTexture('strand', source, movingState, settings, 75, 1.5, timings)

    expect(output.width).toBe(180)
    expect(output.height).toBe(65)
    expect(created[0].context.drawImage).toHaveBeenCalledWith(mesh, 0, 25, 180, 65, 0, 0, 180, 65)
    expect(render).toHaveBeenCalledWith(source, movingState, settings, 75, 1.5)
    expect(timings).toMatchObject({ hairMeshPositionMs: 10, hairMeshUploadMs: 10, hairMeshTextureUploadMs: 10, hairMeshDrawMs: 10, hairMeshContextCheckMs: 10, hairMeshStateSetupMs: 10 })
    expect(timings.hairCanvasClearMs).toBeGreaterThanOrEqual(0)
  })

  it('reports unavailable Canvas2D contexts for both output paths', () => {
    canvasFactory(false)
    const warper = createEditorV6ExportHairTextureWarper({
      hairWarpCanvases: new Map(), staticHairWarpCanvases: new Map(),
      hairMeshRenderer: { render: vi.fn(() => ({} as HTMLCanvasElement)), getTimings: () => ({ positionMs: 0, uploadMs: 0, textureUploadMs: 0, drawMs: 0, contextCheckMs: 0, stateSetupMs: 0 }) }
    })

    expect(() => warper.warpHairTexture('static', image(), restingState, settings, 100, 0, {})).toThrow(/cabelo estático/)
    expect(() => warper.warpHairTexture('animated', image(), movingState, settings, 100, 0, {})).toThrow(/deformar o cabelo/)
  })
})
