import type { EditorV6Element } from '../../../../../shared/editorV6'
import type { EditorV6MotionFrame, EditorV6MotionPlan } from '../../../../../shared/editorV6Motion'
import { motionEase } from '../../../../../shared/editorV6MotionInterpolation'
import type { BakedFacePatch } from './motionFacePatchPreparation'
import type { MotionAtlasSourceFrame, PreparedMotionAtlasFrame } from './motionAtlasSourcePreparation'
import { cropPreparedMotionLayers } from './motionLayerCrops'
import { createEditorV6MotionLayerAtlases, disposeEditorV6MotionLayerAtlases, writeEditorV6MotionLayerAtlasFrame, type MotionLayerAtlases } from './motionLayerAtlasWriter'
import { interpolateEditorV6MotionFrameGeometry, resolveEditorV6MotionElementScales } from './motionFrameGeometry'
import type { MotionPixelCrop } from './motionPixelAnalysis'

type BakeMotionAtlasFramesOptions<Frame extends MotionAtlasSourceFrame> = {
  samples: EditorV6MotionPlan['samples']
  from: EditorV6Element
  to: EditorV6Element
  fromCrop: MotionPixelCrop
  toCrop: MotionPixelCrop
  maximumWidth: number
  maximumHeight: number
  columns: number
  rows: number
  ratio: number
  preparedFrames?: PreparedMotionAtlasFrame[]
  mouthScaleSamples?: number[]
  captureLayers: boolean
  render: (progress: number, faceMode: EditorV6MotionPlan['samples'][number]['faceMode'], mouthScale: number, captureLayers: boolean) => Promise<Frame>
  prepareFacePatch: (options: { index: number; faceMode?: EditorV6MotionPlan['samples'][number]['faceMode']; progress: number; mouthScale: number; frame: Frame }) => Promise<BakedFacePatch | undefined>
  createCanvas?: () => HTMLCanvasElement
  cropLayers?: typeof cropPreparedMotionLayers
}

export type BakedMotionAtlasFrames = {
  atlas: HTMLCanvasElement
  frames: EditorV6MotionFrame[]
  facePatches: BakedFacePatch[]
  layerFrames: Array<{ offset: number; sprite: EditorV6MotionFrame['sprite']; x: number; y: number; width: number; height: number; rotation: number; flipX: boolean; crop: Omit<MotionPixelCrop, 'fingerprint'> }>
  layerAtlases?: MotionLayerAtlases
}

/** Creates the body atlas, draws each pose and returns its frame/layer metadata. */
export async function bakeEditorV6MotionAtlasFrames<Frame extends MotionAtlasSourceFrame>({
  samples,
  from,
  to,
  fromCrop,
  toCrop,
  maximumWidth,
  maximumHeight,
  columns,
  rows,
  ratio,
  preparedFrames,
  mouthScaleSamples,
  captureLayers,
  render,
  prepareFacePatch,
  createCanvas = () => document.createElement('canvas'),
  cropLayers = cropPreparedMotionLayers
}: BakeMotionAtlasFramesOptions<Frame>): Promise<BakedMotionAtlasFrames> {
  const cellWidth = Math.ceil(maximumWidth * ratio), cellHeight = Math.ceil(maximumHeight * ratio)
  const atlas = createCanvas()
  let layerAtlases: MotionLayerAtlases | undefined
  const frames: EditorV6MotionFrame[] = [], facePatches: BakedFacePatch[] = [], layerFrames: BakedMotionAtlasFrames['layerFrames'] = []
  try {
    atlas.width = cellWidth * columns
    atlas.height = cellHeight * rows
    const context = atlas.getContext('2d')!
    if (captureLayers) layerAtlases = createEditorV6MotionLayerAtlases(atlas.width, atlas.height, createCanvas)
    const endpointScales = resolveEditorV6MotionElementScales(from, to, fromCrop, toCrop)
    for (const [index, sample] of samples.entries()) {
      const progress = motionEase(sample.progress), mouthScale = mouthScaleSamples?.[index] ?? 1
      const baked = preparedFrames?.[index]
      const frame = baked ? undefined : await render(progress, sample.faceMode, 1, captureLayers)
      const crop = baked?.crop ?? frame!.crop
      try {
        const x = index % columns * cellWidth, y = Math.floor(index / columns) * cellHeight
        const width = Math.max(1, Math.ceil(crop.width * ratio)), height = Math.max(1, Math.ceil(crop.height * ratio))
        const sourceCanvas = baked?.canvas ?? frame!.canvas
        context.drawImage(sourceCanvas, baked ? 0 : crop.left, baked ? 0 : crop.top, crop.width, crop.height, x, y, width, height)
        const geometry = interpolateEditorV6MotionFrameGeometry({ from, to, fromCrop, toCrop, endpointScales, crop, progress })
        const motionFrame: EditorV6MotionFrame = { offset: sample.offset, sprite: { x, y, width, height, atlasWidth: atlas.width, atlasHeight: atlas.height }, ...geometry }
        frames.push(motionFrame)

        if (captureLayers) {
          const layers = baked?.layers ?? (frame?.layers ? cropLayers(frame.layers, crop) : undefined)
          if (!layerAtlases) throw Error('A preparação do cabelo não capturou as camadas da pose intermediária.')
          layerFrames.push(writeEditorV6MotionLayerAtlasFrame({ atlases: layerAtlases, layers, motionFrame, offset: sample.offset, crop, destination: { x, y, width, height }, createCanvas }))
        }
        if (frame) {
          const facePatch = await prepareFacePatch({ index, faceMode: sample.faceMode, progress, mouthScale, frame })
          if (facePatch) facePatches.push(facePatch)
        }
      } finally {
        frame?.dispose()
        if (baked) baked.canvas.width = baked.canvas.height = 1
      }
    }
    return { atlas, frames, facePatches, layerFrames, ...(layerAtlases ? { layerAtlases } : {}) }
  } catch (error) {
    atlas.width = atlas.height = 1
    disposeEditorV6MotionLayerAtlases(layerAtlases)
    facePatches.forEach(({ canvas }) => { canvas.width = canvas.height = 1 })
    throw error
  }
}
