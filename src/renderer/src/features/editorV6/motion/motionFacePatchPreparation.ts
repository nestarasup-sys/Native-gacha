import type { EditorV6FaceRenderMode } from '../../../../../shared/editorV6'
import { changedMotionPixelBounds, type MotionPixelBounds, type MotionPixelCrop } from './motionPixelAnalysis'
import { createChangedMotionPixelPatch, createTransparentMotionPatch } from './motionCanvasRegions'

export type BakedFacePatch = {
  index: number
  canvas: HTMLCanvasElement
  left: number
  top: number
  width: number
  height: number
  crop: MotionPixelCrop
  changed?: MotionPixelBounds
  replace?: boolean
}

export type MotionFacePatchFrame<Renderer> = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  crop: MotionPixelCrop
  renderer: Renderer
  mouthCanvas?: HTMLCanvasElement
  mouthCrop?: MotionPixelCrop
  dispose: () => void
}

type MotionFacePatchRender<Renderer> = (
  progress: number,
  faceMode?: EditorV6FaceRenderMode,
  mouthScale?: number,
  fingerprint?: boolean,
  preparedRenderer?: Renderer
) => Promise<MotionFacePatchFrame<Renderer>>

type PrepareMotionFacePatchOptions<Renderer> = {
  index: number
  faceMode?: EditorV6FaceRenderMode
  progress: number
  mouthScale: number
  mouthScaleSamples?: number[]
  frame: MotionFacePatchFrame<Renderer>
  render: MotionFacePatchRender<Renderer>
  createTransparentPatch?: typeof createTransparentMotionPatch
  createChangedPatch?: typeof createChangedMotionPixelPatch
}

function pixelsOf(canvas: HTMLCanvasElement, width: number, height: number): Uint8ClampedArray {
  return canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data
}

/** Prepares the per-sample mouth overlay, retaining the legacy changed-pixel fallback. */
export async function prepareEditorV6MotionFacePatch<Renderer>({
  index,
  faceMode,
  progress,
  mouthScale,
  mouthScaleSamples,
  frame,
  render,
  createTransparentPatch = createTransparentMotionPatch,
  createChangedPatch = createChangedMotionPixelPatch
}: PrepareMotionFacePatchOptions<Renderer>): Promise<BakedFacePatch | undefined> {
  if (!mouthScaleSamples || (faceMode !== 'talk' && faceMode !== 'talk-blink')) return undefined
  if (mouthScale <= 1.000001 && !frame.mouthCanvas) return undefined

  const scaled = await render(progress, faceMode, mouthScale, false, frame.renderer)
  if (scaled.mouthCanvas && scaled.mouthCrop) {
    try {
      return {
        index,
        canvas: createTransparentPatch(scaled.mouthCanvas, scaled.mouthCrop),
        left: scaled.mouthCrop.left,
        top: scaled.mouthCrop.top,
        width: scaled.mouthCrop.width,
        height: scaled.mouthCrop.height,
        crop: frame.crop
      }
    } finally { scaled.dispose() }
  }

  const baselinePixels = new Uint8ClampedArray(pixelsOf(frame.canvas, frame.width, frame.height))
  try {
    const pixels = pixelsOf(scaled.canvas, scaled.width, scaled.height)
    const changed = changedMotionPixelBounds(baselinePixels, pixels, scaled.width, scaled.height)
    if (!changed) throw Error('A boca aberta não alterou pixels durante a transição; confira a variante de boca aberta no catálogo facial.')
    const padding = 3
    const left = Math.max(frame.crop.left, changed.left - padding), top = Math.max(frame.crop.top, changed.top - padding)
    const right = Math.min(frame.crop.left + frame.crop.width - 1, changed.right + padding), bottom = Math.min(frame.crop.top + frame.crop.height - 1, changed.bottom + padding)
    const width = right - left + 1, height = bottom - top + 1
    const canvas = createChangedPatch(scaled.canvas, { left, top, right, bottom })
    return { index, canvas, left, top, width, height, crop: frame.crop, changed, replace: true }
  } finally { scaled.dispose() }
}
