import type { EditorV6Asset } from '../../../../../shared/editorV6'
import type { EditorV6MotionBakeResult, EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import type { BakedFacePatch } from './motionFacePatchPreparation'
import { buildEditorV6MotionFaceAtlas } from './motionFaceAtlas'
import { createEditorV6MotionLayerAtlasCapture, type EditorV6MotionLayerAtlasCapture } from './motionLayerAtlasCapture'
import type { MotionLayerAtlases } from './motionLayerAtlasWriter'

type FinalizeMotionBakeOptions = {
  atlas: HTMLCanvasElement
  frames: EditorV6MotionFrame[]
  facePatches: BakedFacePatch[]
  key: string
  samples: number
  maxAtlasPixels: number
  metrics: Pick<EditorV6MotionBakeResult['metrics'], 'milliseconds' | 'preparedRigs' | 'reusedRigs'>
  layerAtlases?: MotionLayerAtlases
  layerFrames: EditorV6MotionLayerAtlasCapture['frames']
  captureLayerAtlases?: (capture: EditorV6MotionLayerAtlasCapture) => void
  createCanvas?: () => HTMLCanvasElement
  createId?: () => string
}

function captureLayers(options: FinalizeMotionBakeOptions): void {
  const { captureLayerAtlases, layerAtlases } = options
  if (!captureLayerAtlases) return
  captureLayerAtlases(createEditorV6MotionLayerAtlasCapture({
    frames: options.frames,
    layerFrames: options.layerFrames,
    behindFace: layerAtlases!.behindFace,
    face: layerAtlases!.face,
    posteriorHair: layerAtlases!.posteriorHair ?? null,
    inFrontOfFace: layerAtlases!.inFrontOfFace,
    eyesAboveRearHair: layerAtlases!.eyesAboveRearHair ?? null
  }))
}

/** Serializes motion atlases, attaches face snapshots and creates the stable bake result. */
export function finalizeEditorV6MotionBake(options: FinalizeMotionBakeOptions): EditorV6MotionBakeResult {
  const { atlas, frames, facePatches, key, samples, maxAtlasPixels, metrics, createCanvas = () => document.createElement('canvas'), createId = () => crypto.randomUUID() } = options
  let faceAtlas: HTMLCanvasElement | undefined
  try {
    if (facePatches.length) {
      const bodyPixels = atlas.width * atlas.height
      const result = buildEditorV6MotionFaceAtlas({ patches: facePatches, frames, bodyPixels, maxAtlasPixels, createCanvas, createId })
      faceAtlas = result.faceAtlas
      const dataUrl = atlas.toDataURL('image/png')
      captureLayers(options)
      return {
        asset: createMotionAsset(result.assetId, dataUrl),
        faceAsset: result.faceAsset,
        motion: { version: 1, key, assetId: result.assetId, faceAssetId: result.faceAssetId, frames },
        metrics: { ...metrics, samples, atlasPixels: bodyPixels + result.facePixels }
      }
    }

    const atlasPixels = atlas.width * atlas.height, assetId = createId()
    const dataUrl = atlas.toDataURL('image/png')
    captureLayers(options)
    return {
      asset: createMotionAsset(assetId, dataUrl),
      motion: { version: 1, key, assetId, frames },
      metrics: { ...metrics, samples, atlasPixels }
    }
  } finally {
    atlas.width = atlas.height = 1
    if (faceAtlas) faceAtlas.width = faceAtlas.height = 1
  }
}

function createMotionAsset(id: string, dataUrl: string): EditorV6Asset {
  return { id, category: 'character', name: 'Transição de personagem', mimeType: 'image/png', dataUrl, timelineSnapshot: true }
}
