import { EDITOR_V6_SOURCE_FRAME_VERSION } from '../editorV6SourceFrame'
import type { EditorV6Element, EditorV6FaceRenderMode } from '../../../../../shared/editorV6'
import type { EditorV6MotionBakeResult } from '../../../../../shared/editorV6Motion'
import type { prepareSavedCharacterRenderer } from '../../../characters/editorV6CharacterRenderer'
import { unionMotionCrops, type MotionPixelCrop } from './motionPixelAnalysis'
import { cropMotionCanvas, readMotionCanvasCrop } from './motionCanvasRegions'

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>
export type MotionMouthlessBaseFrame = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  crop: MotionPixelCrop
  renderer: Renderer
  mouthCanvas?: HTMLCanvasElement
  mouthCrop?: MotionPixelCrop
  dispose: () => void
}
export type RenderMotionFaceFrame = (
  progress: number,
  faceMode?: EditorV6FaceRenderMode,
  mouthScale?: number,
  fingerprint?: boolean,
  preparedRenderer?: Renderer,
  referenceMode?: boolean
) => Promise<MotionMouthlessBaseFrame>

type MotionMouthlessBaseAssets = {
  sourceCrop: MotionPixelCrop
  assets: NonNullable<EditorV6MotionBakeResult['mouthlessBaseAssets']>
}

type PrepareMotionMouthlessBaseAssetsOptions = {
  from: EditorV6Element
  baseline: MotionMouthlessBaseFrame
  render: RenderMotionFaceFrame
  /** Expands the native crop to include the widest rendered mouth sample. */
  requiredCrop?: MotionPixelCrop
  isBlinkUnavailable?: (error: unknown) => boolean
  readCrop?: typeof readMotionCanvasCrop
  cropCanvas?: typeof cropMotionCanvas
  createId?: () => string
}

function isBlinkUnavailable(error: unknown): boolean {
  return error instanceof Error && /Blink precisa|olho fechado correspondente|Selecione olhos do catálogo|assets de Olhos Dev/.test(error.message)
}

/** Encodes each mouthless face before another render can overwrite its borrowed Canvas. */
export async function prepareEditorV6MouthlessBaseAssets({
  from,
  baseline,
  render,
  requiredCrop,
  isBlinkUnavailable: isBlinkUnavailableError = isBlinkUnavailable,
  readCrop = readMotionCanvasCrop,
  cropCanvas = cropMotionCanvas,
  createId = () => crypto.randomUUID()
}: PrepareMotionMouthlessBaseAssetsOptions): Promise<MotionMouthlessBaseAssets> {
  const sourceFrame = (from.faceRendererVersion ?? 0) >= EDITOR_V6_SOURCE_FRAME_VERSION
  let sourceCrop: MotionPixelCrop
  if (sourceFrame) {
    sourceCrop = { left: 0, top: 0, width: baseline.width, height: baseline.height }
  } else {
    const fullTalk = await baseline.renderer.renderToCanvas(from.faceAppearance, from.faceTransforms, from.activeExpressionEffects, from.activeFaceMode, { mouthLayer: 'all' })
    sourceCrop = readCrop(fullTalk.canvas, false, 0)
    try {
      const fullTalkBlink = await baseline.renderer.renderToCanvas(from.faceAppearance, from.faceTransforms, from.activeExpressionEffects, 'talk-blink', { mouthLayer: 'all' })
      sourceCrop = unionMotionCrops(sourceCrop, readCrop(fullTalkBlink.canvas, false, 0))
    } catch (error) { if (!isBlinkUnavailableError(error)) throw error }
    if (requiredCrop) sourceCrop = unionMotionCrops(sourceCrop, requiredCrop)
  }

  const encodeBase = async (mode: EditorV6FaceRenderMode | undefined) => {
    const frame = await render(0, mode, 1, false, baseline.renderer, true)
    try {
      const canvas = cropCanvas(frame.canvas, sourceCrop)
      try { return canvas.toDataURL('image/png') }
      finally { canvas.width = canvas.height = 1 }
    } finally { frame.dispose() }
  }
  const talk = await encodeBase(from.activeFaceMode)
  let talkBlink: string
  try { talkBlink = await encodeBase('talk-blink') }
  catch (error) {
    if (!isBlinkUnavailableError(error)) throw error
    talkBlink = talk
  }
  return { sourceCrop, assets: [
    { faceMode: 'talk', asset: { id: createId(), category: 'character', name: 'Personagem sem boca · fala', mimeType: 'image/png', dataUrl: talk, timelineSnapshot: true } },
    { faceMode: 'talk-blink', asset: { id: createId(), category: 'character', name: 'Personagem sem boca · fala e piscada', mimeType: 'image/png', dataUrl: talkBlink, timelineSnapshot: true } }
  ] }
}
