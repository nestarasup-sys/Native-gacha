import type { EditorV6FaceRenderMode } from '../../../../../shared/editorV6'
import type { EditorV6MotionPlan } from '../../../../../shared/editorV6Motion'
import { motionEase } from '../../../../../shared/editorV6MotionInterpolation'
import type { PreparedGachaLayerFrame } from '../../../characters/editorV6CharacterRenderer'
import type { BakedFacePatch } from './motionFacePatchPreparation'
import { cropPreparedMotionLayers, disposeCroppedMotionLayers, type CroppedMotionLayers } from './motionLayerCrops'
import type { MotionPixelCrop } from './motionPixelAnalysis'

export type MotionAtlasSourceFrame = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  crop: MotionPixelCrop
  layers?: PreparedGachaLayerFrame
  dispose: () => void
}

export type PreparedMotionAtlasFrame = { canvas: HTMLCanvasElement; crop: MotionPixelCrop; layers?: CroppedMotionLayers }

type PrepareMotionAtlasSourcesOptions<Frame extends MotionAtlasSourceFrame> = {
  samples: EditorV6MotionPlan['samples']
  fromCrop: MotionPixelCrop
  toCrop: MotionPixelCrop
  mouthScaleSamples?: number[]
  captureLayers: boolean
  render: (progress: number, faceMode: EditorV6FaceRenderMode | undefined, mouthScale: number, captureLayers: boolean) => Promise<Frame>
  prepareFacePatch: (options: { index: number; faceMode?: EditorV6FaceRenderMode; progress: number; mouthScale: number; frame: Frame }) => Promise<BakedFacePatch | undefined>
  createCanvas?: () => HTMLCanvasElement
  cropLayers?: typeof cropPreparedMotionLayers
}

export type PreparedMotionAtlasSources = {
  frames: PreparedMotionAtlasFrame[]
  facePatches: BakedFacePatch[]
  maximumWidth: number
  maximumHeight: number
}

/** Renders native-size source frames for a tighter atlas layout and transfers their ownership on success. */
export async function prepareEditorV6MotionAtlasSources<Frame extends MotionAtlasSourceFrame>({
  samples,
  fromCrop,
  toCrop,
  mouthScaleSamples,
  captureLayers,
  render,
  prepareFacePatch,
  createCanvas = () => document.createElement('canvas'),
  cropLayers = cropPreparedMotionLayers
}: PrepareMotionAtlasSourcesOptions<Frame>): Promise<PreparedMotionAtlasSources> {
  const frames: PreparedMotionAtlasFrame[] = [], facePatches: BakedFacePatch[] = []
  let maximumWidth = Math.max(fromCrop.width, toCrop.width), maximumHeight = Math.max(fromCrop.height, toCrop.height)
  try {
    for (const [index, sample] of samples.entries()) {
      const progress = motionEase(sample.progress)
      const mouthScale = mouthScaleSamples?.[index] ?? 1
      const frame = await render(progress, sample.faceMode, 1, captureLayers)
      let croppedCanvas: HTMLCanvasElement | undefined, croppedLayers: CroppedMotionLayers | undefined
      try {
        maximumWidth = Math.max(maximumWidth, frame.crop.width)
        maximumHeight = Math.max(maximumHeight, frame.crop.height)
        croppedCanvas = createCanvas()
        croppedCanvas.width = frame.crop.width
        croppedCanvas.height = frame.crop.height
        croppedCanvas.getContext('2d')!.drawImage(frame.canvas, frame.crop.left, frame.crop.top, frame.crop.width, frame.crop.height, 0, 0, frame.crop.width, frame.crop.height)
        if (captureLayers && frame.layers) croppedLayers = cropLayers(frame.layers, frame.crop)
        frames.push({ canvas: croppedCanvas, crop: frame.crop, ...(croppedLayers ? { layers: croppedLayers } : {}) })
        croppedCanvas = undefined
        croppedLayers = undefined
        const facePatch = await prepareFacePatch({ index, faceMode: sample.faceMode, progress, mouthScale, frame })
        if (facePatch) facePatches.push(facePatch)
      } finally {
        if (croppedCanvas) { croppedCanvas.width = croppedCanvas.height = 1 }
        disposeCroppedMotionLayers(croppedLayers)
        frame.dispose()
      }
    }
    return { frames, facePatches, maximumWidth, maximumHeight }
  } catch (error) {
    frames.forEach(({ canvas, layers }) => { canvas.width = canvas.height = 1; disposeCroppedMotionLayers(layers) })
    facePatches.forEach(({ canvas }) => { canvas.width = canvas.height = 1 })
    throw error
  }
}
