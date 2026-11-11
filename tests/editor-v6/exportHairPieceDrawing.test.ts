import { describe, expect, it, vi } from 'vitest'
import type { HairMotionLoop, HairMotionSettings, HairMotionState } from '../../src/shared/hairMotionEngine'
import type { EditorV6FrameTimings } from '../../src/shared/editorV6Export'
import type { EditorV6HairMotionBundle, EditorV6HairMotionLayer, EditorV6HairMotionRig } from '../../src/shared/editorV6HairMotion'
import type { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { createEditorV6ExportHairPieceDrawer } from '../../src/renderer/src/features/editorV6/exportHairPieceDrawing'

type SceneElement = ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number]
type AnimationSettings = Pick<EditorV6HairMotionBundle, 'preset' | 'posteriorOnly' | 'poseReactionOnly' | 'loopFrames'>

const animation: AnimationSettings = {
  preset: { enabled: { back: true, front: true }, intensity: { back: 1, front: 1 }, physics: {} } as EditorV6HairMotionBundle['preset']
}
const piece: EditorV6HairMotionLayer = { id: 'fringe:one', side: 'front', textureId: 'texture', width: 10, height: 20, x: 2, y: 3, scaleX: 1.5, scaleY: 0.5, rotation: 15, flipX: true, phase: 0.25 }
const rig: EditorV6HairMotionRig = {
  elementId: 'actor', assetId: 'asset', characterId: 'character', poseSlot: null, baseSurfaceId: 'base', faceSurfaceId: 'face', overlaySurfaceId: 'overlay',
  artworkWidth: 100, artworkHeight: 80, outputWidth: 200, outputHeight: 160, shapeScaleX: 2, shapeScaleY: 0.5,
  sourceCrop: { left: 0, top: 0, width: 100, height: 80 }, sourceHead: { width: 1, height: 1 }, targetHead: { x: 20, y: 10, width: 30, height: 20, rotation: 30 }, layers: []
}
const texture = { naturalWidth: 10, naturalHeight: 20 } as HTMLImageElement
const warped = { width: 18, height: 26 } as HTMLCanvasElement

function makeDrawer(overrides: Partial<Parameters<typeof createEditorV6ExportHairPieceDrawer>[0]> = {}) {
  const context = Object.fromEntries(['save', 'translate', 'scale', 'rotate', 'drawImage', 'restore'].map(key => [key, vi.fn()])) as unknown as CanvasRenderingContext2D
  let motionInput: Parameters<NonNullable<Parameters<typeof createEditorV6ExportHairPieceDrawer>[0]['preparePieceMotion']>>[0] | undefined
  const state = { offsets: new Float32Array(2), time: 1, frame: 12 } as HairMotionState
  const settings = { enabled: true } as HairMotionSettings
  const preparePieceMotion = vi.fn((input: NonNullable<typeof motionInput>) => {
    motionInput = input
    return { state, settings, phase: 2.5, intensity: 0.75 }
  })
  const warpHairTexture = vi.fn(() => warped)
  const options: Parameters<typeof createEditorV6ExportHairPieceDrawer>[0] = {
    animation, textures: new Map([['texture', texture]]), states: new Map<string, HairMotionState>(), loops: new Map<string, HairMotionLoop>(),
    instancePhases: new Map([['actor', 1]]), poseReactionEnds: new Map([['actor', [8]]]),
    headXAtFrame: (_elementId, frame) => frame * 2, pieceFlipXAtFrame: (_elementId, _pieceId, frame) => frame === 4,
    warpHairTexture, preparePieceMotion, ...overrides
  }
  return { draw: createEditorV6ExportHairPieceDrawer(options), context, preparePieceMotion, warpHairTexture, state, settings, getMotionInput: () => motionInput }
}

describe('createEditorV6ExportHairPieceDrawer', () => {
  it('prepares deterministic motion, applies the head path and preserves strand drawing transforms', () => {
    const drawer = makeDrawer()
    const timings: EditorV6FrameTimings = {}
    drawer.draw(drawer.context, rig, piece, { id: 'actor' } as SceneElement, 12, timings)

    expect(drawer.preparePieceMotion).toHaveBeenCalledWith(expect.objectContaining({
      animation, elementId: 'actor', piece, frame: 12, poseReactionEnds: [8], states: expect.any(Map), loops: expect.any(Map), instancePhases: expect.any(Map)
    }))
    expect(drawer.getMotionInput()?.headAtFrame(4)).toBe(-8)
    expect(drawer.getMotionInput()?.headAtFrame(5)).toBe(10)
    expect(drawer.warpHairTexture).toHaveBeenCalledWith('texture', texture, drawer.state, drawer.settings, 0.75, 2.5, timings)
    expect(drawer.context.translate.mock.calls).toEqual([[100, 80], [-50, -40], [35, 20], [2, 3]])
    expect(drawer.context.scale.mock.calls).toEqual([[2, 0.5], [-1, 1]])
    expect(drawer.context.rotate.mock.calls).toEqual([[Math.PI / 6], [Math.PI / 12]])
    expect(drawer.context.drawImage).toHaveBeenCalledWith(warped, -13.5, -6.5, 27, 13)
    expect(drawer.context.restore).toHaveBeenCalledOnce()
    expect(timings.hairLayerDrawMs).toBeGreaterThanOrEqual(0)
  })

  it('fails with the established message when a prepared texture is absent', () => {
    const drawer = makeDrawer({ textures: new Map() })
    expect(() => drawer.draw(drawer.context, rig, piece, { id: 'actor' } as SceneElement, 0, {})).toThrow('A exportação perdeu uma imagem do cabelo preparado.')
    expect(drawer.preparePieceMotion).not.toHaveBeenCalled()
    expect(drawer.warpHairTexture).not.toHaveBeenCalled()
  })
})
