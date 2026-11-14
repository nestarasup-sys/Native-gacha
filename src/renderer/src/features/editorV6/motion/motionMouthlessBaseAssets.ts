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
  /** Expands the native crop to include the widest rendered mouth sample. */
  requiredCrop?: MotionPixelCrop
  /** Caller-owned frame: avoids rerendering the reference mouth during base preparation. */
  isolatedBaseline?: MotionMouthlessBaseFrame
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
    if (!options.isolatedBaseline) options.baseline.dispose()
    throw error
  }
}

async function buildMotionMouthlessBaseAssets({
  from,
  baseline,
  render,
  requiredCrop,
  isolatedBaseline: suppliedIsolatedBaseline,
  isBlinkUnavailable: isBlinkUnavailableError = isBlinkUnavailable,
  readCrop = readMotionCanvasCrop,
  cropCanvas = cropMotionCanvas,
  createId = () => crypto.randomUUID()
}: PrepareMotionMouthlessBaseAssetsOptions): Promise<MotionMouthlessBaseAssets> {
  let isolatedBaseline = suppliedIsolatedBaseline
    try {
    const fullTalk = await baseline.renderer.renderToCanvas(from.faceAppearance, from.faceTransforms, from.activeExpressionEffects, from.activeFaceMode, { mouthLayer: 'all' })
    let sourceCrop: MotionPixelCrop
    try { sourceCrop = readCrop(fullTalk.canvas, false, 0) }
    finally { fullTalk.canvas.width = fullTalk.canvas.height = 1 }
    try {
    const fullTalkBlink = await baseline.renderer.renderToCanvas(from.faceAppearance, from.faceTransforms, from.activeExpressionEffects, 'talk-blink', { mouthLayer: 'all' })
    try { sourceCrop = unionMotionCrops(sourceCrop, readCrop(fullTalkBlink.canvas, false, 0)) }
    finally { fullTalkBlink.canvas.width = fullTalkBlink.canvas.height = 1 }
    } catch (error) { if (!isBlinkUnavailableError(error)) throw error }

    if (requiredCrop) sourceCrop = unionMotionCrops(sourceCrop, requiredCrop)
    isolatedBaseline ??= await render(0, from.activeFaceMode, 1, true, baseline.renderer, true)
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
    if (!suppliedIsolatedBaseline) isolatedBaseline?.dispose()
    throw error
  }
}
