import type { EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import type { CroppedMotionLayers } from './motionLayerCrops'
import { disposeCroppedMotionLayers } from './motionLayerCrops'
import type { EditorV6MotionLayerAtlasCapture } from './motionLayerAtlasCapture'
import type { MotionPixelCrop } from './motionPixelAnalysis'

export type MotionLayerAtlases = Pick<EditorV6MotionLayerAtlasCapture, 'behindFace' | 'face'> & {
  posteriorHair?: HTMLCanvasElement
  inFrontOfFace: HTMLCanvasElement
  eyesAboveRearHair?: HTMLCanvasElement
}

export type MotionLayerAtlasFrame = Omit<EditorV6MotionLayerAtlasCapture['frames'][number], 'facePatch'>

type CanvasFactory = () => HTMLCanvasElement

/** Creates the required atlases; optional layers are allocated on first use. */
export function createEditorV6MotionLayerAtlases(width: number, height: number, createCanvas: CanvasFactory = () => document.createElement('canvas')): MotionLayerAtlases {
  const created: HTMLCanvasElement[] = []
  const createAtlas = () => {
    const canvas = createCanvas()
    created.push(canvas)
    canvas.width = width
    canvas.height = height
    return canvas
  }
  try { return { behindFace: createAtlas(), face: createAtlas(), inFrontOfFace: createAtlas() } }
  catch (error) {
    created.forEach(canvas => { canvas.width = canvas.height = 1 })
    throw error
  }
}

type WriteMotionLayerAtlasFrameOptions = {
  atlases: MotionLayerAtlases
  layers?: CroppedMotionLayers
  motionFrame: EditorV6MotionFrame
  offset: number
  crop: MotionPixelCrop
  destination: { x: number; y: number; width: number; height: number }
  createCanvas?: CanvasFactory
}

/** Draws one set of cropped character layers into the matching motion-atlas cell. */
export function writeEditorV6MotionLayerAtlasFrame({
  atlases,
  layers,
  motionFrame,
  offset,
  crop,
  destination,
  createCanvas = () => document.createElement('canvas')
}: WriteMotionLayerAtlasFrameOptions): MotionLayerAtlasFrame {
  const drawLayer = (target: HTMLCanvasElement, source: HTMLCanvasElement | null) => {
    if (!source) return
    const targetContext = target.getContext('2d')!
    targetContext.drawImage(source, 0, 0, source.width, source.height, destination.x, destination.y, destination.width, destination.height)
  }
  try {
    if (!layers) throw Error('A preparação do cabelo não capturou as camadas da pose intermediária.')
    drawLayer(atlases.behindFace, layers.behindFace)
    drawLayer(atlases.face, layers.face)
    if (layers.posteriorHair) {
      if (!atlases.posteriorHair) { atlases.posteriorHair = createCanvas(); atlases.posteriorHair.width = atlases.behindFace.width; atlases.posteriorHair.height = atlases.behindFace.height }
      drawLayer(atlases.posteriorHair, layers.posteriorHair)
    }
    drawLayer(atlases.inFrontOfFace, layers.inFrontOfFace)
    if (layers.eyesAboveRearHair) {
      if (!atlases.eyesAboveRearHair) { atlases.eyesAboveRearHair = createCanvas(); atlases.eyesAboveRearHair.width = atlases.behindFace.width; atlases.eyesAboveRearHair.height = atlases.behindFace.height }
      drawLayer(atlases.eyesAboveRearHair, layers.eyesAboveRearHair)
    }
    return {
      offset,
      sprite: motionFrame.sprite,
      x: motionFrame.x,
      y: motionFrame.y,
      width: motionFrame.width,
      height: motionFrame.height,
      rotation: motionFrame.rotation,
      flipX: motionFrame.flipX,
      crop: { left: crop.left, top: crop.top, width: crop.width, height: crop.height }
    }
  } finally { disposeCroppedMotionLayers(layers) }
}

/** Releases all required and lazily allocated atlases after serialization. */
export function disposeEditorV6MotionLayerAtlases(atlases?: MotionLayerAtlases): void {
  if (!atlases) return
  atlases.behindFace.width = atlases.behindFace.height = 1
  atlases.face.width = atlases.face.height = 1
  atlases.inFrontOfFace.width = atlases.inFrontOfFace.height = 1
  if (atlases.posteriorHair) atlases.posteriorHair.width = atlases.posteriorHair.height = 1
  if (atlases.eyesAboveRearHair) atlases.eyesAboveRearHair.width = atlases.eyesAboveRearHair.height = 1
}
