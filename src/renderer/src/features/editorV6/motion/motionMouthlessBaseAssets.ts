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
  isolatedBaseline: MotionMouthlessBaseFrame
  assets: NonNullable<EditorV6MotionBakeResult['mouthlessBaseAssets']>
}

type PrepareMotionMouthlessBaseAssetsOptions = {
  from: EditorV6Element
  baseline: MotionMouthlessBaseFrame
  render: RenderMotionFaceFrame
  isBlinkUnavailable?: (error: unknown) => boolean
  readCrop?: typeof readMotionCanvasCrop
  cropCanvas?: typeof cropMotionCanvas
  createId?: () => string
}

function isBlinkUnavailable(error: unknown): boolean {
  return error instanceof Error && /Blink precisa|olho fechado correspondente|Selecione olhos do catálogo|assets de Olhos Dev/.test(error.message)
}

/** Builds the mouthless talk/talk-blink snapshots while returning the isolated baseline to its caller. */
export async function prepareEditorV6MouthlessBaseAssets(options: PrepareMotionMouthlessBaseAssetsOptions): Promise<MotionMouthlessBaseAssets> {
  try { return await buildMotionMouthlessBaseAssets(options) }
  catch (error) {
    options.baseline.dispose()
    throw error
  }
}

async function buildMotionMouthlessBaseAssets({
  from,
  baseline,
  render,
  isBlinkUnavailable: isBlinkUnavailableError = isBlinkUnavailable,
  readCrop = readMotionCanvasCrop,
  cropCanvas = cropMotionCanvas,
  createId = () => crypto.randomUUID()
}: PrepareMotionMouthlessBaseAssetsOptions): Promise<MotionMouthlessBaseAssets> {
  const fullTalk = await baseline.renderer.renderToCanvas(from.faceAppearance, from.faceTransforms, from.activeExpressionEffects, from.activeFaceMode, { mouthLayer: 'all' })
  let sourceCrop: MotionPixelCrop
  try { sourceCrop = readCrop(fullTalk.canvas, false, 0) }
  finally { fullTalk.canvas.width = fullTalk.canvas.height = 1 }
  try {
    const fullTalkBlink = await baseline.renderer.renderToCanvas(from.faceAppearance, from.faceTransforms, from.activeExpressionEffects, 'talk-blink', { mouthLayer: 'all' })
    try { sourceCrop = unionMotionCrops(sourceCrop, readCrop(fullTalkBlink.canvas, false, 0)) }
    finally { fullTalkBlink.canvas.width = fullTalkBlink.canvas.height = 1 }
  } catch (error) { if (!isBlinkUnavailableError(error)) throw error }

  const isolatedBaseline = await render(0, from.activeFaceMode, 1, true, baseline.renderer, true)
  try {
    const baseTalkId = createId()
    const baseTalkCanvas = cropCanvas(isolatedBaseline.canvas, sourceCrop)
    let baseTalkDataUrl: string
    try { baseTalkDataUrl = baseTalkCanvas.toDataURL('image/png') }
    finally { baseTalkCanvas.width = baseTalkCanvas.height = 1 }

    const assets: NonNullable<EditorV6MotionBakeResult['mouthlessBaseAssets']> = [{
      faceMode: 'talk',
      asset: { id: baseTalkId, category: 'character', name: 'Personagem sem boca · fala', mimeType: 'image/png', dataUrl: baseTalkDataUrl, timelineSnapshot: true }
    }]
    try {
      const talkBlink = await render(0, 'talk-blink', 1, false, isolatedBaseline.renderer, true)
      try {
        const baseTalkBlinkId = createId()
        const baseTalkBlinkCanvas = cropCanvas(talkBlink.canvas, sourceCrop)
        let dataUrl: string
        try { dataUrl = baseTalkBlinkCanvas.toDataURL('image/png') }
        finally { baseTalkBlinkCanvas.width = baseTalkBlinkCanvas.height = 1 }
        assets.push({ faceMode: 'talk-blink', asset: { id: baseTalkBlinkId, category: 'character', name: 'Personagem sem boca · fala e piscada', mimeType: 'image/png', dataUrl, timelineSnapshot: true } })
      } finally { talkBlink.dispose() }
    } catch (error) {
      if (!isBlinkUnavailableError(error)) throw error
      assets.push({ faceMode: 'talk-blink', asset: { id: createId(), category: 'character', name: 'Personagem sem boca · fala e piscada', mimeType: 'image/png', dataUrl: baseTalkDataUrl, timelineSnapshot: true } })
    }
    return { sourceCrop, isolatedBaseline, assets }
  } catch (error) {
    isolatedBaseline.dispose()
    throw error
  }
}
