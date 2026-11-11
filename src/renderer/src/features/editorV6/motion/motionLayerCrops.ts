import type { PreparedGachaLayerFrame } from '../../../characters/editorV6CharacterRenderer'
import type { MotionPixelCrop } from './motionPixelAnalysis'

export type CroppedMotionLayers = {
  behindFace: HTMLCanvasElement
  face: HTMLCanvasElement
  posteriorHair: HTMLCanvasElement | null
  inFrontOfFace: HTMLCanvasElement | null
  eyesAboveRearHair: HTMLCanvasElement | null
}

type CanvasFactory = () => HTMLCanvasElement

function cropPreparedLayer(source: HTMLCanvasElement, layers: PreparedGachaLayerFrame, crop: MotionPixelCrop, createCanvas: CanvasFactory): HTMLCanvasElement {
  const canvas = createCanvas()
  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d')
  if (!context) throw Error('Não foi possível preparar uma camada de cabelo durante a pose.')
  context.translate(-crop.left, -crop.top)
  context.translate(layers.outputWidth / 2, layers.outputHeight / 2)
  context.scale(layers.shapeScaleX, layers.shapeScaleY)
  context.drawImage(source, -layers.width / 2, -layers.height / 2)
  return canvas
}

/** Crops the already rendered character layers into one shared motion-frame viewport. */
export function cropPreparedMotionLayers(
  layers: PreparedGachaLayerFrame,
  crop: MotionPixelCrop,
  createCanvas: CanvasFactory = () => document.createElement('canvas')
): CroppedMotionLayers {
  return {
    behindFace: cropPreparedLayer(layers.behindFace, layers, crop, createCanvas),
    face: cropPreparedLayer(layers.face, layers, crop, createCanvas),
    posteriorHair: layers.posteriorHair ? cropPreparedLayer(layers.posteriorHair, layers, crop, createCanvas) : null,
    inFrontOfFace: layers.inFrontOfFace ? cropPreparedLayer(layers.inFrontOfFace, layers, crop, createCanvas) : null,
    eyesAboveRearHair: layers.eyesAboveRearHair ? cropPreparedLayer(layers.eyesAboveRearHair, layers, crop, createCanvas) : null
  }
}

/** Releases crop backing stores once their frames have been packed into an atlas. */
export function disposeCroppedMotionLayers(layers?: CroppedMotionLayers): void {
  if (!layers) return
  layers.behindFace.width = layers.behindFace.height = 1
  layers.face.width = layers.face.height = 1
  if (layers.posteriorHair) layers.posteriorHair.width = layers.posteriorHair.height = 1
  if (layers.inFrontOfFace) layers.inFrontOfFace.width = layers.inFrontOfFace.height = 1
  if (layers.eyesAboveRearHair) layers.eyesAboveRearHair.width = layers.eyesAboveRearHair.height = 1
}
