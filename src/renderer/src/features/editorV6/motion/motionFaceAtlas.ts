import type { EditorV6Asset } from '../../../../../shared/editorV6'
import type { EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import { normalizedMotionReplacementBounds, type MotionPixelBounds } from './motionPixelAnalysis'
import type { BakedFacePatch } from './motionFacePatchPreparation'

export type MotionFaceAtlasFrame = Pick<EditorV6MotionFrame, 'facePatch'>

export type MotionFaceAtlasResult = {
  faceAtlas: HTMLCanvasElement
  faceAsset: EditorV6Asset
  faceAssetId: string
  assetId: string
  facePixels: number
}

type BuildMotionFaceAtlasOptions = {
  patches: BakedFacePatch[]
  frames: MotionFaceAtlasFrame[]
  bodyPixels: number
  maxAtlasPixels: number
  createCanvas?: () => HTMLCanvasElement
  createId?: () => string
}

/** Packs localized face patches, writes their frame metadata and creates the snapshot asset. */
export function buildEditorV6MotionFaceAtlas({
  patches,
  frames,
  bodyPixels,
  maxAtlasPixels,
  createCanvas = () => document.createElement('canvas'),
  createId = () => crypto.randomUUID()
}: BuildMotionFaceAtlasOptions): MotionFaceAtlasResult {
  const gutter = 2
  const faceWidth = patches.reduce((total, patch) => total + patch.canvas.width, 0)
  const faceHeight = Math.max(...patches.map(patch => patch.canvas.height))
  const facePixels = faceWidth * faceHeight
  if (faceWidth > 8192 || faceHeight > 8192 || facePixels + bodyPixels > maxAtlasPixels) {
    throw Error('As camadas faciais desta transição excedem o limite seguro em resolução nativa. A exportação foi interrompida para não reduzir a nitidez do personagem.')
  }

  const faceAtlas = createCanvas()
  faceAtlas.width = faceWidth
  faceAtlas.height = faceHeight
  try {
    const faceContext = faceAtlas.getContext('2d')!
    let offsetX = 0
    for (const patch of patches) {
      faceContext.drawImage(patch.canvas, offsetX, 0)
      const frame = frames[patch.index]!
      frame.facePatch = {
        sprite: { x: offsetX + gutter, y: gutter, width: patch.width, height: patch.height, atlasWidth: faceWidth, atlasHeight: faceHeight },
        x: (patch.left - patch.crop.left) / patch.crop.width,
        y: (patch.top - patch.crop.top) / patch.crop.height,
        width: patch.width / patch.crop.width,
        height: patch.height / patch.crop.height,
        ...(patch.replace ? {
          replace: true,
          replaceBounds: normalizedMotionReplacementBounds(patch.changed!, {
            left: patch.left,
            top: patch.top,
            right: patch.left + patch.width - 1,
            bottom: patch.top + patch.height - 1
          } satisfies MotionPixelBounds)
        } : {})
      }
      offsetX += patch.canvas.width
      patch.canvas.width = patch.canvas.height = 1
    }

    const faceAssetId = createId(), assetId = createId()
    const faceAsset: EditorV6Asset = {
      id: faceAssetId,
      category: 'character',
      name: 'Camadas faciais da transição',
      mimeType: 'image/png',
      dataUrl: faceAtlas.toDataURL('image/png'),
      timelineSnapshot: true
    }
    return { faceAtlas, faceAsset, faceAssetId, assetId, facePixels }
  } catch (error) {
    faceAtlas.width = faceAtlas.height = 1
    throw error
  }
}
