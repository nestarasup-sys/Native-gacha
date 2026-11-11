import type { EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import type { MotionPixelCrop } from './motionPixelAnalysis'

export type EditorV6MotionLayerAtlasFrame = Pick<EditorV6MotionFrame, 'offset' | 'sprite' | 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flipX'> & {
  crop: Omit<MotionPixelCrop, 'fingerprint'>
  facePatch?: EditorV6MotionFrame['facePatch']
}

export type EditorV6MotionLayerAtlasCapture = {
  frames: EditorV6MotionLayerAtlasFrame[]
  behindFace: HTMLCanvasElement
  face: HTMLCanvasElement
  posteriorHair: HTMLCanvasElement | null
  inFrontOfFace: HTMLCanvasElement | null
  eyesAboveRearHair: HTMLCanvasElement | null
}

type CreateMotionLayerAtlasCaptureOptions = {
  frames: EditorV6MotionFrame[]
  layerFrames: Array<Omit<EditorV6MotionLayerAtlasFrame, 'facePatch'>>
  behindFace: HTMLCanvasElement
  face: HTMLCanvasElement
  posteriorHair: HTMLCanvasElement | null
  inFrontOfFace: HTMLCanvasElement | null
  eyesAboveRearHair: HTMLCanvasElement | null
}

/** Joins the captured layer geometry with final frame metadata for hair motion preparation. */
export function createEditorV6MotionLayerAtlasCapture({
  frames,
  layerFrames,
  behindFace,
  face,
  posteriorHair,
  inFrontOfFace,
  eyesAboveRearHair
}: CreateMotionLayerAtlasCaptureOptions): EditorV6MotionLayerAtlasCapture {
  return {
    frames: frames.map(frame => {
      const captured = layerFrames.find(item => item.offset === frame.offset)
      if (!captured) throw Error('A preparação perdeu um quadro da pose sem cabelo.')
      return { ...captured, ...(frame.facePatch ? { facePatch: frame.facePatch } : {}) }
    }),
    behindFace,
    face,
    posteriorHair,
    inFrontOfFace,
    eyesAboveRearHair
  }
}
