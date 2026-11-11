import type { EditorV6Element, EditorV6FaceRenderMode } from '../../../../../shared/editorV6'
import type { EditorV6MotionBakeRequest } from '../../../../../shared/editorV6Motion'
import { editorV6FaceModeDuringMotion } from '../../../../../shared/editorV6FaceSchedule'
import { interpolateEditorV6Face } from '../../../../../shared/editorV6MotionInterpolation'
import type { prepareSavedCharacterRenderer, PreparedGachaLayerFrame } from '../../../characters/editorV6CharacterRenderer'
import { scaleEditorV6MotionMouth } from './motionFacePreparation'
import type { EditorV6BakeSession } from './bakeSession'
import { readMotionCanvasCrop } from './motionCanvasRegions'
import type { MotionPixelCrop } from './motionPixelAnalysis'

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>

export type EditorV6MotionRenderedFrame = {
  canvas: HTMLCanvasElement
  width: number
  height: number
  crop: MotionPixelCrop
  renderer: Renderer
  layers?: PreparedGachaLayerFrame
  mouthCanvas?: HTMLCanvasElement
  mouthCrop?: MotionPixelCrop
  dispose: () => void
}

export type EditorV6MotionFrameRenderer = ReturnType<typeof createEditorV6MotionFrameRenderer>

type EditorV6MotionFrameRendererOptions = {
  request: EditorV6MotionBakeRequest
  from: EditorV6Element
  to: EditorV6Element
  prepare: (progress: number) => Promise<Renderer>
  samePose: boolean
  session?: EditorV6BakeSession
  readCrop?: typeof readMotionCanvasCrop
}

/** Renders one motion sample, including optional split layers and isolated mouth pixels. */
export function createEditorV6MotionFrameRenderer({
  request,
  from,
  to,
  prepare,
  samePose,
  session,
  readCrop = readMotionCanvasCrop
}: EditorV6MotionFrameRendererOptions) {
  return async (
    progress: number,
    faceMode?: EditorV6FaceRenderMode,
    mouthScale = 1,
    fingerprint = false,
    preparedRenderer?: Renderer,
    referenceMode = false,
    captureLayers = false
  ): Promise<EditorV6MotionRenderedFrame> => {
    const renderer = preparedRenderer ?? await prepare(progress)
    const face = scaleEditorV6MotionMouth(interpolateEditorV6Face(from, to, progress), mouthScale)
    try {
      const mode = faceMode ?? face.mode
      const renderMode = referenceMode ? mode : editorV6FaceModeDuringMotion(mode)
      const isolateMouth = Boolean(request.mouthScaleSamples && (mode === 'talk' || mode === 'talk-blink') && renderer.canIsolateMouth(face.appearance))
      // Split-layer export needs the full body and separate layers from one render.
      const mouthOptions = isolateMouth ? { mouthLayer: 'without-mouth' as const } : undefined
      const layered = captureLayers
        ? await renderer.renderToCanvasWithLayers(face.appearance, face.transforms, face.effects, renderMode, mouthOptions)
        : undefined
      const result = layered ?? await renderer.renderToCanvas(face.appearance, face.transforms, face.effects, renderMode, mouthOptions)
      const layers = layered?.layers
      const mouth = isolateMouth ? await renderer.renderMouthToCanvas(face.appearance, face.transforms, face.effects, renderMode) : undefined
      return {
        ...result,
        crop: readCrop(result.canvas, fingerprint),
        renderer,
        ...(layers ? { layers } : {}),
        ...(mouth ? { mouthCanvas: mouth.canvas, mouthCrop: readCrop(mouth.canvas, fingerprint, 0) } : {}),
        dispose: () => {
          if (!samePose && !preparedRenderer && !(session && [...session.endpointRenderers.values()].includes(renderer))) renderer.dispose()
        }
      }
    } catch (error) {
      if (!samePose && !preparedRenderer && !(session && [...session.endpointRenderers.values()].includes(renderer))) renderer.dispose()
      throw error
    }
  }
}
