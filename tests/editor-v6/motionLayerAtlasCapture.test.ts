import { describe, expect, it } from 'vitest'
import { createEditorV6MotionLayerAtlasCapture } from '../../src/renderer/src/features/editorV6/motion/motionLayerAtlasCapture'
import type { EditorV6MotionFrame } from '../../src/shared/editorV6Motion'

function layerFrame(offset: number) {
  return { offset, sprite: { x: 1, y: 2, width: 3, height: 4, atlasWidth: 10, atlasHeight: 12 }, x: 0.1, y: 0.2, width: 0.3, height: 0.4, rotation: 8, flipX: true, crop: { left: 5, top: 6, width: 7, height: 8 } }
}

describe('Editor V6 motion layer atlas capture', () => {
  it('joins layer geometry to frames by offset and carries final face patches', () => {
    const facePatch = { sprite: { x: 9, y: 8, width: 7, height: 6, atlasWidth: 20, atlasHeight: 30 }, x: 0.2, y: 0.3, width: 0.4, height: 0.5 }
    const frames = [
      { ...layerFrame(3), facePatch },
      { ...layerFrame(7), facePatch: undefined }
    ] as unknown as EditorV6MotionFrame[]
    const behindFace = {} as HTMLCanvasElement, face = {} as HTMLCanvasElement, inFrontOfFace = {} as HTMLCanvasElement

    const capture = createEditorV6MotionLayerAtlasCapture({
      frames,
      layerFrames: [layerFrame(7), layerFrame(3)],
      behindFace,
      face,
      posteriorHair: null,
      inFrontOfFace,
      eyesAboveRearHair: null
    })

    expect(capture).toEqual({
      frames: [{ ...layerFrame(3), facePatch }, layerFrame(7)],
      behindFace,
      face,
      posteriorHair: null,
      inFrontOfFace,
      eyesAboveRearHair: null
    })
  })

  it('fails with the existing message when a frame has no captured layer geometry', () => {
    expect(() => createEditorV6MotionLayerAtlasCapture({
      frames: [{ ...layerFrame(5) } as unknown as EditorV6MotionFrame],
      layerFrames: [],
      behindFace: {} as HTMLCanvasElement,
      face: {} as HTMLCanvasElement,
      posteriorHair: null,
      inFrontOfFace: null,
      eyesAboveRearHair: null
    })).toThrow('A preparação perdeu um quadro da pose sem cabelo.')
  })
})
