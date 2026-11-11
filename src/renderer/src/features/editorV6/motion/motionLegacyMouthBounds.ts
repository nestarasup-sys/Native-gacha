import type { EditorV6FaceRenderMode } from '../../../../../shared/editorV6'
import { changedMotionPixelBounds, unionMotionPixelBounds, type MotionPixelBounds, type MotionPixelCrop } from './motionPixelAnalysis'

export type LegacyMouthBoundsFrame = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  crop: MotionPixelCrop
  dispose: () => void
}

type DetectLegacyMouthBoundsOptions<Frame extends LegacyMouthBoundsFrame> = {
  baseline: Frame
  scales: number[]
  faceMode?: EditorV6FaceRenderMode
  render: (progress: number, faceMode: EditorV6FaceRenderMode | undefined, mouthScale: number, fingerprint: boolean) => Promise<Frame>
  findChangedBounds?: typeof changedMotionPixelBounds
  unionBounds?: typeof unionMotionPixelBounds
}

export type LegacyMouthBoundsResult = { sourceCrop: MotionPixelCrop; changedBounds: MotionPixelBounds }

/** Measures the legacy mouth change across scales and releases each comparison frame. */
export async function detectEditorV6LegacyMouthBounds<Frame extends LegacyMouthBoundsFrame>({
  baseline,
  scales,
  faceMode,
  render,
  findChangedBounds = changedMotionPixelBounds,
  unionBounds = unionMotionPixelBounds
}: DetectLegacyMouthBoundsOptions<Frame>): Promise<LegacyMouthBoundsResult> {
  const sourceCrop = baseline.crop
  const baselineContext = baseline.canvas.getContext('2d', { willReadFrequently: true })!
  const baselinePixels = new Uint8ClampedArray(baselineContext.getImageData(0, 0, baseline.width, baseline.height).data)
  let changedBounds: MotionPixelBounds | undefined
  for (let index = 1; index < scales.length; index++) {
    const comparison = await render(0, faceMode, scales[index], index === scales.length - 1)
    try {
      if (index === scales.length - 1 && comparison.crop.fingerprint === sourceCrop.fingerprint) throw Error('A boca aberta não respondeu à ampliação; confira se o personagem tem uma variante de boca aberta editável no catálogo facial.')
      const pixels = comparison.canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, comparison.width, comparison.height).data
      const changed = findChangedBounds(baselinePixels, pixels, comparison.width, comparison.height)
      if (changed) changedBounds = unionBounds(changedBounds, changed)
    } finally { comparison.dispose() }
  }
  if (!changedBounds) throw Error('A animação da boca não alterou pixels do personagem; confira o vínculo da boca aberta no catálogo facial.')
  return { sourceCrop, changedBounds }
}
